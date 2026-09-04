/**
 * その場に残るもの。**炎の渦・焦土の軌跡。**
 *
 * 仕様は `docs/spec/20-enchant.md`（灼熱の渦・焦土の軌跡）。
 *
 * ## 置いて、時間で消える
 *
 * ```
 * 置く → 毎秒、中に居る敵へ配る → 時間が来たら消える
 * ```
 *
 * **1 体につき秒 1 回**——通り抜けても多段しない（`docs/spec/20-enchant.md` 3 章）。
 * **メモリだけ**（`/reload` で消えてよい）。
 */

import type { Dimension, Player, Vector3 } from "@minecraft/server";

/** 残っているもの 1 つ */
export interface Zone {
  readonly by: Player;
  readonly dim: Dimension;
  readonly at: Vector3;
  readonly radius: number;
  /** 1 秒あたりのダメージ */
  readonly per: number;
  /** いつまで（tick） */
  readonly until: number;
  /** 最後に配った時刻 */
  last: number;
  /** 見た目のため。**いまは全部おなじ粒** */
  readonly tag: string;
}

const zones: Zone[] = [];

/** 置ける数の上限。**軌跡で増えすぎないように** */
const CAP = 64;

export function place(z: Omit<Zone, "last">): void {
  if (zones.length >= CAP) zones.shift();
  zones.push({ ...z, last: 0 });
}

export function each(fn: (z: Zone, index: number) => void): void {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z !== undefined) fn(z, i);
  }
}

export function drop(index: number): void {
  zones.splice(index, 1);
}

export function count(): number {
  return zones.length;
}
