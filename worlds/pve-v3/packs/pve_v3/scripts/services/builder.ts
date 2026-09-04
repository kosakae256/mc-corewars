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

function apply(dim: Dimension, o: Vector3, op: BuildOp): void {
  if (op.kind === "set") {
    dim.setBlockType({ x: o.x + op.at.x, y: o.y + op.at.y, z: o.z + op.at.z }, op.block);
    return;
  }
  const volume = new BlockVolume(
    { x: o.x + op.from.x, y: o.y + op.from.y, z: o.z + op.from.z },
    { x: o.x + op.to.x, y: o.y + op.to.y, z: o.z + op.to.z }
  );
  dim.fillBlocks(volume, op.block);
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
