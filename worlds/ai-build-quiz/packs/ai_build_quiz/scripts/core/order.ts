/**
 * 置く順と速さ（**純粋関数**）。`docs/spec/14-build.md` 2 章。
 *
 * - 下の層から。同じ層の中は**ランダム**（端から並べると「掃く」ように見える）
 * - 10 秒で置き終わる個数/tick: N = ceil(count / 200)。上限 1,300、下限 1
 */

import type { Vec3 } from "./box.js";

export interface Cell extends Vec3 {
  /** palette の添字（1..） */
  readonly block: number;
}

export const TARGET_TICKS = 200; // 10 秒
export const MAX_PER_TICK = 1300; // pve-v3 の実測予算
export const MIN_PER_TICK = 1;

export function perTick(count: number): number {
  return Math.max(MIN_PER_TICK, Math.min(MAX_PER_TICK, Math.ceil(count / TARGET_TICKS)));
}

/** 決定的な乱数（seed から）。ゲーム内で Math.random を使わないためではなく、テストで並びを固定するため */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 展開したブロック列（添字 = y×size² + z×size + x）→ 置く順の配列。
 * 戻り値の高さ（占有している一番上の層 + 1）も返す（ANCHOR = center のときに使う）。
 */
export function placementOrder(
  cells: Uint8Array,
  size: number,
  seed = 1
): { order: Cell[]; height: number; count: number } {
  const rnd = mulberry32(seed);
  const order: Cell[] = [];
  let height = 0;
  for (let y = 0; y < size; y++) {
    const layer: Cell[] = [];
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const b = cells[y * size * size + z * size + x] ?? 0;
        if (b !== 0) layer.push({ x, y, z, block: b });
      }
    }
    if (layer.length) height = y + 1;
    // Fisher–Yates
    for (let i = layer.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const a = layer[i] as Cell;
      layer[i] = layer[j] as Cell;
      layer[j] = a;
    }
    order.push(...layer);
  }
  return { order, height, count: order.length };
}
