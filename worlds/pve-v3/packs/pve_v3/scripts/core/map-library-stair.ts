/**
 * 16. 大書庫——**2 階へ上がる道。** 玄関の大階段 2 本と、螺旋階段 4 基。
 *
 * 間取りは `map-library-plan.ts`。**床と手すりは `map-library-deck.ts`。**
 *
 * > ### **上がる道は 1 か所にしない**
 * >
 * > **敵も同じ道で登る**（`spec/14-map-build.md` 0-8）。
 * > 1 か所しか無いと、そこが詰まって 2 階が安全地帯になる。
 *
 * > ### **段は 1 マスずつ**
 * >
 * > 2 マス飛ばすと登れない。**螺旋は 16 段で 8 マス上がる**（2 段で 1 マス）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { CEIL_1, DECK, SEED, SPIRALS, WALL_R, ringOf } from "./map-library-plan.js";

/** 大階段。**玄関の左右に 1 本ずつ。**（x の帯・z ＝ −39 から 1 段ずつ） */
const GRAND = [
  { x1: -10, x2: -8, rail: [-11, -7] },
  { x1: 8, x2: 10, rail: [7, 11] },
] as const;

/**
 * 螺旋階段の踏み面。**中心から見た 16 マスの輪**。
 *
 * **順に隣り合っている**ので、斜め跳びをせずに回りながら上がれる。
 */
const SPIRAL_RING: readonly (readonly [number, number])[] = [
  [2, -2],
  [2, -1],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [-1, 2],
  [-2, 2],
  [-2, 1],
  [-2, 0],
  [-2, -1],
  [-2, -2],
  [-1, -2],
  [0, -2],
  [1, -2],
];

/**
 * 上がる道。**大階段 2 本・螺旋 4 基・壁の梯子。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function stairOps(ops: BuildOp[]): void {
  grandStairs(ops);
  for (const s of SPIRALS) spiralStair(ops, s.x, s.z);
  wallLadders(ops);
}

/** 玄関の大階段。**z が 1 増えるごとに 1 マス上がる**（−39 で 1、−32 で 8） */
function grandStairs(ops: BuildOp[]): void {
  for (const g of GRAND) {
    for (let z = -39; z <= -32; z++) {
      const h = z + 40;
      ops.push(fill(g.x1, 1, z, g.x2, h, z, "stone_bricks"));
      for (let x = g.x1; x <= g.x2; x++) {
        if (noise(SEED + 51, x, h, z) < 0.3) ops.push(set(x, h, z, "polished_andesite"));
      }
      // ---- 両脇の手すり。**踏み面より 1 マス高い所に立てる**
      for (const rx of g.rail) {
        ops.push(fill(rx, 1, z, rx, h, z, "stone_bricks"));
        ops.push(set(rx, h + 1, z, "dark_oak_fence"));
        if ((z + 40) % 3 === 0) ops.push(set(rx, h + 2, z, "lantern"));
      }
    }
  }
}

/**
 * 螺旋階段。**3 × 3 の心柱の周りを 16 段で回る。**
 *
 * **2 段で 1 マス上がる**ので、段差はどこも 1 マス（0-8）。
 * 上がり口は 1 段目、降り口は 16 段目——**どちらも回廊と隣り合う。**
 */
function spiralStair(ops: BuildOp[], cx: number, cz: number): void {
  // ---- 心柱。**天井まで通す**——上が抜けていると柱に見えない
  ops.push(fill(cx - 1, 1, cz - 1, cx + 1, CEIL_1 - 1, cz + 1, "stone_bricks"));
  for (const y of [4, 8, 12, 16]) {
    ops.push(fill(cx - 1, y, cz - 1, cx + 1, y, cz + 1, "polished_andesite"));
  }
  ops.push(set(cx, CEIL_1 - 1, cz, "glowstone"));
  SPIRAL_RING.forEach(([dx, dz], i) => {
    const h = 1 + Math.floor(i / 2);
    ops.push(fill(cx + dx, 1, cz + dz, cx + dx, h, cz + dz, "stone_bricks"));
    ops.push(set(cx + dx, h, cz + dz, i % 2 === 0 ? "dark_oak_planks" : "polished_andesite"));
  });
  // ---- 灯り。**心柱に埋める**（腕木を出すと踏み面が塞がる）
  for (const y of [3, 7, 11]) {
    ops.push(set(cx, y, cz + 1, "glowstone"));
    ops.push(set(cx, y, cz - 1, "glowstone"));
  }
}

/**
 * 壁の梯子。**書架の壁に立て掛かった、可動書架の梯子。**
 *
 * > ### **道としては数えない**
 * >
 * > `fill` はブロックの状態（向き）を指定できないので、
 * > **梯子の向きが既定のままになる。** 登れるかは当てにせず、**飾りとして置く。**
 * > 2 階へは大階段 2 本と螺旋 4 基で上がる。
 */
function wallLadders(ops: BuildOp[]): void {
  const ring = ringOf(WALL_R);
  for (let i = 0; i < 4; i++) {
    const p = ring[Math.floor((ring.length * (i + 0.35)) / 4)];
    if (p === undefined) continue;
    ops.push(fill(p.x, 1, p.z, p.x, DECK - 1, p.z, "ladder"));
  }
}
