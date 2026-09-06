/**
 * 17「白の神殿」の**材。純粋。**
 *
 * > ### 明るさは帯の中で揃える
 * >
 * > **白い建物は、少しでも暗い石を混ぜると汚れて見える。**
 * > 壁・床はクォーツと方解石（223〜238）だけで組み、
 * > **浮かせるのはシーランタン・ステンドグラス・苔の 3 つに絞る。**
 * > **屋根だけは灰**——ここで明暗を切らないと、上から見て建物の形が読めない。
 *
 * **1 マスごとに引く**（`spec/14-map-build.md` 0-7）。区画で塗り分けない。
 */

import { noise, smoothWave } from "./map-frame.js";
import { AISLE_IN, AISLE_OUT, ISLE_R, NAVE_HALF, SEED } from "./map-sanctum-plan.js";

/** 屋根の材。**白の壁と分ける灰**——1 マスごとに引く（0-7） */
export function roofTile(x: number, z: number): string {
  const ax = Math.abs(x);
  // **軒と棟だけ白**。線が浮いて、屋根の勾配が読める
  if (ax === AISLE_OUT || ax === AISLE_IN) return "smooth_quartz";
  const n = noise(SEED + 107, x, z);
  if (n < 0.07) return "mossy_cobblestone";
  if (n < 0.15) return "stone";
  if (n < 0.5) return "polished_andesite";
  if (n < 0.85) return "andesite";
  return "diorite";
}

/** ステンドグラスの色。**休憩所と同じ 3 色**（水色・白・紫） */
const GLASS: readonly string[] = ["light_blue_stained_glass", "white_stained_glass", "purple_stained_glass"];

/** 色を 1 つ選ぶ */
export function glassOf(seedShift: number, a: number, b: number): string {
  const i = Math.floor(noise(SEED + seedShift, a, b) * GLASS.length);
  return GLASS[Math.min(GLASS.length - 1, i)] as string;
}

/**
 * 壁の材。**明るさは帯の中で揃える**——白い建物は、明るい線だけを浮かせる。
 *
 * 足元は滑らかなクォーツ、胴は煉瓦、y ＝ 4 に方解石の胴蛇腹、天端は彫り。
 * **1 マスごとに少しだけ古びを混ぜる**（0-7）。
 */
export function wallStone(x: number, y: number, z: number, top: number): string {
  if (y <= 1) return "smooth_quartz";
  if (y === top) return "chiseled_quartz_block";
  if (y === 4) return "calcite";
  const n = noise(SEED + 5, x, y, z);
  if (n < 0.07) return "diorite";
  if (n < 0.2) return "calcite";
  if (n < 0.3) return "smooth_quartz";
  return "quartz_bricks";
}

/** 身廊の市松。**目は 3 マス**——1 マスだと模様に見えない（休憩所と同じ流儀） */
const TILE = 3;

/** 市松のどちらの目か */
function even(x: number, z: number, size: number): boolean {
  return ((Math.floor((x + 300) / size) + Math.floor((z + 300) / size)) & 1) === 0;
}

/**
 * 身廊の床。**市松に、罅と苔を落とす。**
 *
 * > ### 白と白の市松は、模様として読めない（2026-09-06 に絵で分かった）
 * >
 * > 休憩所は `quartz_block` と `smooth_quartz` の市松だが、
 * > **明るさがほとんど同じなので、絵にすると一様な白い床**になる。
 * > **こちらは磨いた閃緑岩を相手にする**——同じ白の系統のまま、目が出る。
 * > 縁は 2 段の縁取りにして、身廊の幅を線で示す。
 */
export function naveTile(x: number, z: number): string {
  const n = noise(SEED + 11, x, z);
  if (n < 0.04) return "moss_block";
  if (n < 0.09) return "andesite";
  if (Math.abs(x) === NAVE_HALF) return "polished_diorite";
  if (Math.abs(x) === NAVE_HALF - 1) return "calcite";
  return even(x, z, TILE) ? "quartz_block" : "polished_diorite";
}

/** 側廊の床。**目を細かくして、身廊と区別する** */
export function aisleTile(x: number, z: number): string {
  const n = noise(SEED + 13, x, z);
  if (n < 0.05) return "moss_block";
  if (n < 0.1) return "andesite";
  return even(x, z, 2) ? "quartz_bricks" : "smooth_quartz";
}

/**
 * 外庭の敷石。
 *
 * > ### **1 マスごとに引く**（0-7）
 * >
 * > 区画で塗り分けない。**外へ行くほど荒れる**寄りだけを足す。
 */
export function courtStone(x: number, z: number): string {
  const far = Math.min(1, Math.hypot(x, z) / ISLE_R);
  const damp = (smoothWave(SEED + 21, x, z, 21) + 1) / 2;
  // **苔は湿った側だけ。** 一様に撒くと、島の縁が緑の輪になる（0-7）
  const wet = Math.max(0, damp - 0.55) * 2.2;
  const wear = far * 0.4 + damp * 0.6;
  const n = noise(SEED + 7, x, z);
  if (n < 0.09 * wet) return "moss_block";
  if (n < 0.16 * wet) return "mossy_cobblestone";
  if (n < 0.2 * wear) return "andesite";
  if (n < 0.14 + 0.16 * wear) return "diorite";
  if (n < 0.5) return "calcite";
  if (n < 0.78) return "smooth_quartz";
  return "quartz_block";
}

/** 参道の敷石。**湧く所から前面まで、まっすぐ通す** */
export function pathStone(x: number, z: number): string {
  if (Math.abs(x) === 15) return "polished_diorite";
  if (Math.abs(x) > 15) return even(x, z, 2) ? "calcite" : "quartz_bricks";
  const n = noise(SEED + 17, x, z);
  if (n < 0.05) return "moss_block";
  return even(x, z, TILE) ? "quartz_block" : "polished_diorite";
}

/**
 * 外庭の割り付け。
 *
 * > ### 上から見たとき、外庭が白い皿に見える（2026-09-06 に絵で分かった）
 * >
 * > **同心の輪と放射の筋を、床の色で引く**——休憩所の `bands` / `spokes` と同じ流儀。
 * > **石を積まずに、模様だけで庭の広さを見せる。**
 */
export function courtPave(x: number, z: number): string {
  const d = Math.hypot(x, z);
  // ---- 縁は**揃える**。
  //
  // > ### 島の断崖は、天面の色をそのまま縦に引き伸ばす（2026-09-06 に絵で分かった）
  // >
  // > 縁を 1 マスごとにまだらにすると、**崖が白黒の縞になって「爪楊枝の束」に見える。**
  // > **外周 3 マスだけは同じ材で揃える**——崖が 1 枚の白い壁として立つ。
  if (d > ISLE_R - 3.5) return noise(SEED + 3, x, z) < 0.25 ? "calcite" : "smooth_quartz";
  if (Math.abs(d - 33.5) < 1.2 || Math.abs(d - 40) < 1.2) return "polished_diorite";
  if (Math.abs(d - 35) < 0.7 || Math.abs(d - 38.5) < 0.7) return "andesite";
  // ---- 放射の筋。**12 本**。中心から見た角度の幅で引くと、外ほど太らない
  if (d > 29 && d < 43) {
    const a = Math.atan2(z, x);
    const k = Math.round((a * 6) / Math.PI);
    if (Math.abs(a - (k * Math.PI) / 6) * d < 0.9) return "calcite";
  }
  return courtStone(x, z);
}
