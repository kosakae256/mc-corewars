/**
 * 戦場 14「円形闘技場」の**形**。**純粋な計算だけ**——手順は積まない。
 *
 * **材は `map-arena-mat.ts`**、面の意匠は `map-arena-deco.ts`。
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 *
 * ## 断面（2026-09-06 に作り直した）
 *
 * ```
 *   ████  ──────────  ────────────────────  ──────────  ████
 *   壁    段差上 幅 6   段差下（広い・平坦）      段差上 幅 6   壁
 *   y 12  y 0          y −6                  y 0          y 12
 *   r 44             38    37 ────── 0
 * ```
 *
 * > ### **上り下りできる必要がない**
 * >
 * > **段差下と段差上は 6 マスの崖で切れたまま。** 降り口も階段も作らない。
 * > **0-8（どこでも登れる）は免除**（`core/maps.ts` の `waive`）。
 */

import { BOTTOM, GROUND } from "./map-frame.js";
import { GATE } from "./places.js";

/** 種。**変えれば材の散り方が変わる** */
export const SEED = 4114;

/** 段差下。**広くて平ら。ここで戦う** */
export const FLOOR_Y = GROUND - 6;
/** 段差上。**湧く所とゲートはここ。y ＝ 0 は動かせない**（0-1） */
export const LEDGE_Y = GROUND;
/** 外壁の天 */
export const WALL_Y = GROUND + 12;
/** 外壁の笠。**外側 3 マスだけ 2 マス高くして、壁の頭を見せる** */
export const CAP_Y = GROUND + 14;

/** 段差下の外端 */
export const FLOOR_R = 37;
/** 段差上の内端・外端。**幅 6 マス。** 湧く所（r ＝ 40）もゲート（r ≒ 39）も収まる */
export const LEDGE_IN = 38;
export const LEDGE_OUT = 43;
/** 外壁の壁体 */
export const WALL_IN = 44;
export const WALL_MID = 45;
/** 笠。**いちばん外は ±50 の内側**（0-1） */
export const CAP_IN = 46;
export const CAP_OUT = 48;

export function distOf(x: number, z: number): number {
  return Math.hypot(x, z);
}

export function degOf(x: number, z: number): number {
  return (Math.atan2(z, x) * 180) / Math.PI;
}

/**
 * 門の控え壁の中か。
 *
 * **ゲートの箱（z ＝ 39）のすぐ奥から壁まで**を、壁と同じ高さまで詰める。
 * **回り込めるポータルは、置く意味がない**（`14-map-build.md` 0-3）。
 */
export function inGatePier(x: number, z: number): boolean {
  return z >= GATE.z + 1 && Math.abs(x) <= 5;
}

/**
 * その柱の天面。**闘技場の外なら `undefined`。**
 *
 * **飾りを置く側も必ずここを見る**——地形とずれると、浮いた台座になる（0-5）。
 */
export function topAt(x: number, z: number): number | undefined {
  const r = distOf(x, z);
  if (r > CAP_OUT) return undefined;
  if (r <= FLOOR_R) return FLOOR_Y;
  if (r <= LEDGE_OUT) return inGatePier(x, z) ? WALL_Y : LEDGE_Y;
  if (r <= WALL_MID) return WALL_Y;
  return CAP_Y;
}

/**
 * その柱の底。**浅い円錐**——真ん中がいちばん深い。
 *
 * **下へ細らせれば、外へ張り出す天面はどこにも増えない。**
 * 台座は見えないので、**厚みは控えめでよい。**
 */
export function bottomAt(x: number, z: number): number {
  return Math.max(BOTTOM, GROUND - 20 + Math.floor(distOf(x, z) * 0.24));
}

/**
 * 円周に沿った目盛り。**角度で刻むと、外側ほど間隔が開く。**
 *
 * 付け柱や窪みを**同じ幅で回す**ために、半径をかけて長さに直す。
 */
export function arcOf(x: number, z: number, r: number): number {
  return Math.round(((degOf(x, z) + 180) * Math.PI * r) / 180);
}
