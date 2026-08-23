/**
 * マップ上の置き場所。**ここが唯一の正。**
 *
 * 地面の高さは何度か変わっている（-40 → -10 → 9）。
 * そのたびに手で足し算をすると必ずどこかを間違えるので、
 * **数値は1箇所に置き、コマンドは計算して出す。**
 *
 * 設計は docs/game/02-map.md。
 */

/** 中央の島の中心（水平）。拠点のコアはここから ±100 */
export const CENTER_X = 1000;
export const CENTER_Z = 1000;

/**
 * **地面の高さ。** 島の上面がこの高さになる。
 *
 * `MC_GROUND=9 node build-mid.mjs` のように環境変数で上書きできる。
 * 高さは何度も変わっているので、**書き換えずに切り替えられる**ようにしておく。
 *
 * 既定が -10 である根拠:
 * 中央の城は地面より 24 マス上まで伸びる。
 * 手で保存した範囲が -10..20 だったので、地面 -10 なら城全体が収まる（てっぺん 14）。
 * 地面 9 だとてっぺんが 33 になり、13 マス切れてしまう。
 */
export const GROUND = process.env.MC_GROUND !== undefined
  ? Number(process.env.MC_GROUND)
  : -10;

/** 拠点のコアの位置（docs/game/02-map.md） */
export const CORE_A_X = 900;
export const CORE_B_X = 1100;
export const CORE_Z = 1000;

/**
 * 構造物を置く座標を出す。
 *
 * `/structure load` は**与えた座標を x/y/z の最小の角**として置く。
 * 回転しても、正方形なら囲みの大きさは変わらないので角は動かない。
 *
 * @param {number} anchorX  合わせたい点の世界座標
 * @param {number} anchorZ
 * @param {number} innerX   構造物の中でその点が来る位置
 * @param {number} innerZ
 * @param {number} innerGround 構造物の中での地面の高さ
 */
export function origin(anchorX, anchorZ, innerX, innerZ, innerGround) {
  return [anchorX - innerX, GROUND - innerGround, anchorZ - innerZ];
}
