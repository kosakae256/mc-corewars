/**
 * 7. 地下水路——**水そのもの。** 水路・樋・落水・格子・橋。
 *
 * 寸法は `map-aqueduct-plan.ts`。**石の意匠は `map-aqueduct-hall.ts`。**
 *
 * > ### 水は「下が空いていれば、横へ広がらない」
 * >
 * > 落とし口は**真下が空いた縦穴**にしてある。だから
 * > **源を 1 段置くだけで、まっすぐ落ちて水路に着く**——歩廊へは溢れない。
 */

import { fill, set, type BuildOp } from "./build.js";
import {
  BED_Y,
  CROSS_H,
  DECK,
  GUT_Y,
  KERB_X,
  WATER_Y,
  Z0,
  Z1,
  bedAt,
  cellAt,
  deckAt,
  halfAt,
  isAisleCol,
  isArcade,
  stoneAt,
} from "./map-aqueduct-plan.js";

/** 主水路に橋を架ける z。**等間隔に置かない** */
const SPANS: readonly number[] = [-22, -13, 8, 17, 27];

/** 横水路に橋を架ける x */
const CROSSINGS: readonly number[] = [-25, -17, -9, 9, 17, 25];

/** 落とし口を開ける z。**左右でずらす**（揃えると作り物に見える） */
const DRAINS_R: readonly number[] = [-16, -11, 6, 12];
const DRAINS_L: readonly number[] = [-14, -7, 9, 14];

/** 格子が半分落ちている所 */
const GRATES: readonly number[] = [-19, 22];

/** 水を張る。**水路は 3 段、樋は 1 段** */
export function canalWater(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const w = halfAt(z);
    for (let x = -w; x <= w; x++) {
      if (isArcade(x, w) && Math.abs(z) > CROSS_H) continue;
      if (isAisleCol(x, w, z)) continue;
      const cell = cellAt(x, z, w);
      if (cell === "canal") ops.push(fill(x, BED_Y + 1, z, x, WATER_Y, z, "water"));
      else if (cell === "gutter") ops.push(set(x, GUT_Y + 1, z, "water"));
    }
  }
}

/**
 * 橋。**主水路は z を跨ぎ、横水路は x を跨ぐ。**
 *
 * **欄干は y ＝ 1 の 1 段だけ**——0-3 の視線が x ＝ 0 の y ＝ 2 以上を通るので、
 * **ここより高くすると、湧く所からゲートが見えなくなる。**
 */
export function bridgeOps(ops: BuildOp[]): void {
  for (const z of SPANS) {
    for (let x = -KERB_X; x <= KERB_X; x++) {
      ops.push(set(x, DECK, z, deckAt(x, z)));
      for (const dz of [-1, 1]) {
        ops.push(set(x, DECK, z + dz, deckAt(x, z + dz)));
        ops.push(set(x, DECK + 1, z + dz, "cobblestone_wall"));
      }
      // ---- 桁。**橋の裏を厚くして、板 1 枚に見せない**
      if (Math.abs(x) >= KERB_X - 1) ops.push(fill(x, WATER_Y - 1, z - 1, x, WATER_Y, z + 1, "stone_bricks"));
    }
    for (const sx of [-KERB_X, KERB_X]) {
      ops.push(set(sx, DECK + 1, z, "chiseled_stone_bricks"));
      ops.push(set(sx, DECK + 2, z, "lantern"));
    }
  }
  for (const x of CROSSINGS) {
    for (let z = -CROSS_H - 1; z <= CROSS_H + 1; z++) {
      ops.push(set(x, DECK, z, deckAt(x, z)));
      for (const dx of [-1, 1]) {
        ops.push(set(x + dx, DECK, z, deckAt(x + dx, z)));
        ops.push(set(x + dx, DECK + 1, z, "cobblestone_wall"));
      }
    }
    for (const sz of [-CROSS_H - 1, CROSS_H + 1]) {
      ops.push(set(x, DECK + 1, sz, "chiseled_stone_bricks"));
      ops.push(set(x, DECK + 2, sz, "lantern"));
    }
  }
}

/**
 * 横水路の両端の**大落水。**
 *
 * **岩をくり抜いた奥から、幅 5・高さ 8 の水の帯が落ちてくる。**
 * ここが交差の広間の見せ場。
 */
export function outfallOps(ops: BuildOp[]): void {
  const mouth = halfAt(0);
  for (const sx of [-1, 1]) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let d = 1; d <= 4; d++) {
        const x = sx * (mouth + d);
        ops.push(fill(x, BED_Y + 1, dz, x, 7, dz, "air"));
        ops.push(set(x, BED_Y, dz, bedAt(x, dz)));
        ops.push(set(x, 8, dz, stoneAt(x, 8, dz)));
        ops.push(fill(x, BED_Y + 1, dz, x, WATER_Y, dz, "water"));
        if (d >= 2) ops.push(set(x, 7, dz, "water"));
      }
      // ---- 口の左右と上を、はっきり縁取る
      ops.push(set(sx * mouth, 8, dz, "chiseled_stone_bricks"));
    }
    for (let y = DECK; y <= 8; y++) {
      for (const sz of [-3, 3]) ops.push(set(sx * mouth, y, sz, "chiseled_stone_bricks"));
    }
    // ---- 奥と左右の壁。**掘りっぱなしの生石を見せない**
    for (let dz = -3; dz <= 3; dz++) {
      for (let y = BED_Y; y <= 8; y++) ops.push(set(sx * (mouth + 5), y, dz, stoneAt(sx * (mouth + 5), y, dz)));
    }
    for (const sz of [-3, 3]) {
      for (let d = 1; d <= 4; d++) {
        const x = sx * (mouth + d);
        for (let y = BED_Y; y <= 8; y++) ops.push(set(x, y, sz, stoneAt(x, y, sz)));
      }
    }
  }
}

/**
 * 壁の樋。**縦穴に水を落とし、前に格子を立てる。**
 *
 * **2 本に 1 本は格子が落ちている**——同じ物を並べない（0-6）。
 */
export function drainOps(ops: BuildOp[]): void {
  drainSide(ops, 1, DRAINS_R);
  drainSide(ops, -1, DRAINS_L);
}

function drainSide(ops: BuildOp[], sx: number, list: readonly number[]): void {
  for (let i = 0; i < list.length; i++) {
    const z = list[i] as number;
    const w = halfAt(z);
    if (w < 19) continue;
    const gx = sx * (w + 1);
    ops.push(fill(gx, WATER_Y, z, gx, 6, z, "air"));
    ops.push(set(gx, 7, z, "chiseled_stone_bricks"));
    ops.push(set(gx, 6, z, "water"));
    for (let y = WATER_Y; y <= 6; y++) ops.push(set(sx * (w + 2), y, z, stoneAt(sx * (w + 2), y, z)));
    // ---- 格子。**落ちている口は、上半分が無い**
    //
    // **下を抜くと格子が宙に浮く**（0-5 で塊が割れた）。**欠けるのは上から。**
    const fallen = i % 2 === 1;
    ops.push(fill(sx * w, DECK, z, sx * w, fallen ? 3 : 5, z, "iron_bars"));
    if (!fallen) continue;
    ops.push(set(sx * (w - 2), DECK + 1, z, "iron_bars"));
    ops.push(set(sx * (w - 3), DECK + 1, z + 1, "iron_bars"));
  }
}

/**
 * 水路を塞ぐ**落ちかけの格子。**
 *
 * **真ん中が抜けている**のは意匠であり、同時に
 * **0-3 の視線（x ＝ 0）を通すため**でもある。
 */
export function grateOps(ops: BuildOp[]): void {
  for (const z of GRATES) {
    // **下半分は残っている。** 落ちている高さは 2 つで変える（同じ物を並べない）
    const low = z < 0 ? DECK + 1 : DECK + 3;
    ops.push(fill(-4, DECK, z, 4, low, z, "iron_bars"));
    for (const sx of [-1, 1]) {
      ops.push(fill(sx, low + 1, z, sx * 4, 5, z, "iron_bars"));
      ops.push(fill(sx * KERB_X, DECK + 1, z, sx * KERB_X, 6, z, "chiseled_stone_bricks"));
      ops.push(fill(sx, 6, z, sx * KERB_X, 6, z, "stone_bricks"));
    }
    ops.push(set(-KERB_X, 7, z, "lantern"));
    ops.push(set(KERB_X, 7, z, "lantern"));
  }
}
