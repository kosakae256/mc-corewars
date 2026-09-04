/**
 * 本物のネザーゲートを、**見た目だけの飾り**（`pve_v2:portal`）に差し替える係。
 *
 * 仕様は `docs/spec/14-portal.md`。
 *
 * ## なぜ自前で総当たりするのか
 *
 * > ### `getBlocks` の絞り込みでは 1 つも見つからなかった（2026-09-01 実機）
 * >
 * > `Dimension.getBlocks(volume, { includeTypes })` を使ったが、
 * > 目の前にゲートがあっても「近くに無い」と返ってきた。
 * > **1 マスずつ `getBlock` して `typeId` を見る**ほうが確実。
 *
 * **範囲が広いので、tick に分けて進める**（1 tick 8000 マスまで）。
 * ついでに**黒曜石の数も数える**——0 なら、そもそも枠が近くに無いと分かる。
 *
 * ## 名前を決め打ちしない
 *
 * > ### `minecraft:portal` では 1 つも見つからなかった（2026-09-01 実機）
 * >
 * > 黒曜石は数えられているのにゲートだけ 0。**名前が違う**
 * > （バージョンによって `nether_portal` などに変わる）。
 * >
 * > **`portal` を名前に含むブロックはすべて対象**にする。
 * > 見つけた名前は**そのまま報告する**——次に同じことを調べ直さないため。
 */

import { BlockPermutation, BlockVolume, type Dimension, type Player, type Vector3 } from "@minecraft/server";

/** 探す広さ（水平／下／上） */
const REACH = 40;
const DOWN = 30;
const UP = 34;

/** 1 tick に見る数 */
const PER_TICK = 8000;

/** 飾り（**これ自身は対象にしない**） */
const DECOR = "pve_v2:portal";

const FRAME = "minecraft:obsidian";

/** それはゲートか。**名前を決め打ちしない** */
function isGate(id: string): boolean {
  return id.includes("portal") && id !== DECOR;
}

interface Job {
  readonly dim: Dimension;
  readonly by: Player;
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
  readonly x2: number;
  readonly y2: number;
  readonly z2: number;
  x: number;
  y: number;
  z: number;
  done: number;
  frame: number;
  failed: number;
  seen: number;
  /** 見つけたゲートの名前（**報告して残す**） */
  readonly names: Set<string>;
}

let job: Job | undefined;

/** いま探している最中か */
export function busy(): boolean {
  return job !== undefined;
}

/** 始める。**立っている所を中心に探す** */
export function start(dim: Dimension, spot: Vector3, by: Player): void {
  const x1 = Math.floor(spot.x) - REACH;
  const z1 = Math.floor(spot.z) - REACH;
  const y1 = Math.floor(spot.y) - DOWN;
  job = {
    dim,
    by,
    x1,
    y1,
    z1,
    x2: Math.floor(spot.x) + REACH,
    y2: Math.floor(spot.y) + UP,
    z2: Math.floor(spot.z) + REACH,
    x: x1,
    y: y1,
    z: z1,
    done: 0,
    frame: 0,
    failed: 0,
    seen: 0,
    names: new Set<string>(),
  };
  by.sendMessage(`§7ネザーゲートを探す（${REACH * 2} x ${DOWN + UP} x ${REACH * 2}）……`);
}

/**
 * 板の向き。**まず本物の状態を見る。**
 *
 * 状態の名前もバージョンで変わりうるので、**取れなければ隣を見て決める**
 *（東西に続いていれば x 向き、南北に続いていれば z 向き）。
 */
function acrossOf(dim: Dimension, at: Vector3): boolean {
  const here = dim.getBlock(at);
  const axis = here?.permutation.getState("portal_axis");
  if (axis === "z") return true;
  if (axis === "x") return false;
  const east = dim.getBlock({ x: at.x + 1, y: at.y, z: at.z });
  const west = dim.getBlock({ x: at.x - 1, y: at.y, z: at.z });
  if ((east !== undefined && isGate(east.typeId)) || (west !== undefined && isGate(west.typeId))) return false;
  return true;
}

/** 1 tick ぶん進める */
export function step(): void {
  const j = job;
  if (j === undefined) return;

  let left = PER_TICK;
  while (left > 0) {
    // ---- 1 マス見る
    try {
      const block = j.dim.getBlock({ x: j.x, y: j.y, z: j.z });
      if (block !== undefined) {
        j.seen += 1;
        if (block.typeId === FRAME) j.frame += 1;
        else if (isGate(block.typeId)) {
          j.names.add(block.typeId);
          block.setPermutation(BlockPermutation.resolve(DECOR, { "pve_v2:across": acrossOf(j.dim, block.location) }));
          j.done += 1;
        }
      }
    } catch {
      j.failed += 1;
    }
    left -= 1;

    // ---- 次のマスへ
    j.z += 1;
    if (j.z > j.z2) {
      j.z = j.z1;
      j.x += 1;
      if (j.x > j.x2) {
        j.x = j.x1;
        j.y += 1;
        if (j.y > j.y2) {
          const miss = j.failed > 0 ? `§7（読めなかった: §c${j.failed}§7）` : "";
          try {
            if (j.done > 0) {
              const names = [...j.names].join(" / ");
              j.by.sendMessage(`§a${j.done}§7 マスを飾りのゲートに差し替えた（§f${names}§7）${miss}`);
            } else if (j.frame > 0) {
              j.by.sendMessage(`§7ゲートのブロックは無い。§f黒曜石は ${j.frame} マスある§7（火が入っていない？）`);
            } else {
              j.by.sendMessage(`§7この付近にゲートも黒曜石も無い（見たマス: ${j.seen}）${miss}`);
            }
          } catch {
            /* 消えている */
          }
          job = undefined;
          return;
        }
      }
    }
  }
}

/** 一度に置ける上限（**打ち間違いで world を潰さないため**） */
const MAX = 8000;

/**
 * 範囲を指定して、**飾りのゲートを敷く**（`/pve:gate`）。
 *
 * > ### 探しても見つからないゲートがある
 * >
 * > 実機では**黒曜石は数えられるのにゲートだけ 0**だった（2026-09-01）。
 * > 特殊な扱いのブロックらしく、`getBlock` で拾えないことがある。
 * >
 * > **拾えないなら、座標を言ってもらって置く。**
 *
 * **板の向きは箱の形から決める**——横に長ければ x 向き、奥に長ければ z 向き。
 *
 * @param clear `true` なら**空気にする**（敷いたものを消す）
 */
export function place(dim: Dimension, from: Vector3, to: Vector3, by: Player, clear: boolean): void {
  const x1 = Math.floor(Math.min(from.x, to.x));
  const y1 = Math.floor(Math.min(from.y, to.y));
  const z1 = Math.floor(Math.min(from.z, to.z));
  const x2 = Math.floor(Math.max(from.x, to.x));
  const y2 = Math.floor(Math.max(from.y, to.y));
  const z2 = Math.floor(Math.max(from.z, to.z));
  const count = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1);
  if (count > MAX) {
    by.sendMessage(`§c広すぎる（${count} マス）。§7${MAX} マスまで`);
    return;
  }

  const volume = new BlockVolume({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 });
  try {
    if (clear) {
      dim.fillBlocks(volume, "minecraft:air");
      by.sendMessage(`§7${count}§7 マスを空気にした`);
      return;
    }
    // **横に長ければ x 向き、奥に長ければ z 向き**
    const across = z2 - z1 > x2 - x1;
    dim.fillBlocks(volume, BlockPermutation.resolve(DECOR, { "pve_v2:across": across }));
    by.sendMessage(`§a${count}§7 マスに飾りのゲートを置いた（${across ? "z" : "x"} 向き）`);
  } catch (err) {
    by.sendMessage(`§c置けなかった: ${String(err)}`);
  }
}
