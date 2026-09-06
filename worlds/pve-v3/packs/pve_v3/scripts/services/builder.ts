/**
 * 手順を、tick に分けて流す。**組み立ての係。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md`。
 *
 * ## 一度に置かない
 *
 * **休憩所も戦場も、1 回で数百万マスになる。**
 * **1 tick ぶんの予算を決めて、そこまでで止める。**
 *
 * > ### 1 手の失敗で全体を止めない
 * >
 * > **ブロック名を 1 つ間違えただけで、建物が半分で終わっていた。**
 * > **飛ばして進み、最後にまとめて知らせる。**
 */

import { BlockVolume, world, type Dimension, type Player, type Vector3 } from "@minecraft/server";

import type { BuildOp } from "../core/build.js";
import { volumeOf } from "../core/build.js";

/** 1 tick に動かすマスの数 */
const PER_TICK = 16000;

/**
 * 1 マスずつ置く手順の重さ。
 *
 * **`fillBlocks` の 1 マスより、`setBlockType` の 1 回のほうがずっと高い。**
 */
const SET_COST = 12;

interface Job {
  readonly ops: BuildOp[];
  readonly origin: Vector3;
  readonly name: string;
  readonly watcher: Player | undefined;
  index: number;
  failed: number;
  firstError: string | undefined;
}

/** いま流している仕事。**メモリだけ** */
let job: Job | undefined;

/** 組み立て中か */
export function busy(): boolean {
  return job !== undefined;
}

/** 残りの手順 */
export function left(): number {
  return job === undefined ? 0 : job.ops.length - job.index;
}

/** 組み立てを始める。**前の仕事は捨てる** */
export function start(name: string, ops: BuildOp[], origin: Vector3, watcher?: Player): void {
  job = { ops, origin, name, watcher, index: 0, failed: 0, firstError: undefined };
}

function overworld(): Dimension | undefined {
  try {
    return world.getDimension("overworld");
  } catch {
    return undefined;
  }
}

/**
 * 一度に置ける上限。
 *
 * > ### **`fillBlocks` は 1 回 32768 マスまで**（2026-09-06 に踏んだ）
 * >
 * > ```
 * > cannot perform a single fill greater than 32768 … requested fill was 3411405
 * > ```
 * >
 * > **`clearBox` が範囲をまるごと消そうとして落ちた**（129 × 205 × 129）。
 * > **書く側に数えさせない**——ここで割る。
 */
const MAX_FILL = 32768;

/** 端から端まで、上限に収まる厚さで切って置く */
function fillBig(
  dim: Dimension,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  block: string
): void {
  const sx = x2 - x1 + 1;
  const sz = z2 - z1 + 1;
  // **まず y で切る。** 1 枚が上限を超えるなら、z でも切る
  const layer = sx * sz;
  if (layer <= MAX_FILL) {
    const stepY = Math.max(1, Math.floor(MAX_FILL / layer));
    for (let y = y1; y <= y2; y += stepY) {
      const yy = Math.min(y2, y + stepY - 1);
      dim.fillBlocks(new BlockVolume({ x: x1, y, z: z1 }, { x: x2, y: yy, z: z2 }), block);
    }
    return;
  }
  const stepZ = Math.max(1, Math.floor(MAX_FILL / Math.max(1, sx)));
  for (let z = z1; z <= z2; z += stepZ) {
    const zz = Math.min(z2, z + stepZ - 1);
    fillBig(dim, x1, y1, z, x2, y2, zz, block);
  }
}

function apply(dim: Dimension, o: Vector3, op: BuildOp): void {
  if (op.kind === "set") {
    dim.setBlockType({ x: o.x + op.at.x, y: o.y + op.at.y, z: o.z + op.at.z }, op.block);
    return;
  }
  fillBig(
    dim,
    o.x + Math.min(op.from.x, op.to.x),
    o.y + Math.min(op.from.y, op.to.y),
    o.z + Math.min(op.from.z, op.to.z),
    o.x + Math.max(op.from.x, op.to.x),
    o.y + Math.max(op.from.y, op.to.y),
    o.z + Math.max(op.from.z, op.to.z),
    op.block
  );
}

/** 1 tick ぶん進める */
export function step(): void {
  if (job === undefined) return;
  const dim = overworld();
  if (dim === undefined) {
    job = undefined;
    return;
  }

  let budget = PER_TICK;
  while (budget > 0 && job.index < job.ops.length) {
    const op = job.ops[job.index];
    job.index++;
    if (op === undefined) break;
    budget -= op.kind === "set" ? SET_COST : volumeOf(op);
    try {
      apply(dim, job.origin, op);
    } catch (err) {
      job.failed++;
      if (job.firstError === undefined) job.firstError = String(err);
      console.warn(`[build] ${String(err)}`);
    }
  }

  if (job.index < job.ops.length) return;
  const done = job;
  job = undefined;
  done.watcher?.sendMessage(
    done.failed === 0
      ? `§a${done.name}を組んだ`
      : `§e${done.name}を組んだ §8（${done.failed} 手が失敗）\n§8${done.firstError ?? ""}`
  );
}
