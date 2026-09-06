/**
 * どのマップでも同じ骨組み。**純粋。**
 *
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 *
 * ```
 * clearBox(ops)      まず全部消す
 *   …地形や建物を積む…
 * spawnPad(ops, …)   湧く所の足場を置き直す（地形に消させない）
 * openGate(ops)      ゲートの箱を空ける
 * ```
 *
 * > ### ここに置くのは「どのマップでも同じ」ものだけ
 * >
 * > **地形や意匠は各マップの口に置く。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { FIELD, GATE } from "./places.js";

/** 端。**x・z とも −50 〜 +50** */
export const HALF = FIELD.half;

/** 地面の高さ。**全マップ共通で y ＝ 0** */
export const GROUND = FIELD.groundY;

/** 地形の底 */
export const BOTTOM = FIELD.bottomY;

/** 湧く所とゲートの面 */
export const SPAWN_Z = FIELD.spawnZ;
export const GATE_Z = GATE.z;

/** 掘り抜く外側。**空を通すために、マップより少し広く取る** */
export const CLEAR = 64;
export const CLEAR_TOP = 150;

/** 天井を張るときの高さの目安（`14-map-build.md` 0-1 の上限は +29） */
export const ROOF_MAX = GROUND + 28;

/** まず全部消す */
export function clearBox(ops: BuildOp[]): void {
  ops.push(fill(-CLEAR, BOTTOM - 4, -CLEAR, CLEAR, CLEAR_TOP, CLEAR, "air"));
}

/**
 * 湧く所の足場。
 *
 * **材は問わない**（`14-map-build.md` 0-2。2026-09-06 緩和）が、
 * **立てること**と**埋まらないこと**は要る。
 */
export function spawnPad(ops: BuildOp[], block: string, radius = 5): void {
  ops.push(fill(-radius, GROUND, SPAWN_Z - radius, radius, GROUND, SPAWN_Z + radius, block));
  ops.push(fill(-radius, GROUND + 1, SPAWN_Z - radius, radius, GROUND + 3, SPAWN_Z + radius, "air"));
}

/**
 * ゲートの箱を空ける。
 *
 * **マップにポータルを立ててはいけない**（`20-portal.md` 0-2）——
 * **倒し切ったときに進行の側が置く。**
 */
export function openGate(ops: BuildOp[]): void {
  ops.push(fill(GATE.x1, GATE.y1, GATE.z, GATE.x2, GATE.y2, GATE.z, "air"));
}

/**
 * ゲートの足元と裏。
 *
 * **裏へ回れないように塞ぐ**（`14-map-build.md` 0-3）。
 * **浮島なら裏は奈落でよい**ので、そのときは呼ばない。
 */
export function gateBack(ops: BuildOp[], block: string): void {
  ops.push(fill(-2, GROUND, GATE_Z - 1, 2, GROUND, GATE_Z + 1, block));
  ops.push(fill(-2, GROUND + 1, GATE_Z + 1, 2, GROUND + 6, GATE_Z + 1, block));
}

// ================================================================ 乱数

/**
 * 種から 0〜1 を作る。**同じ座標なら、いつも同じ値。**
 *
 * **`Math.random` を使わない**——**同じ種なら同じマップ**にしたい。
 */
export function noise(seed: number, x: number, y: number, z = 0): number {
  let h = seed ^ (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * 揺らぎ（−1〜1）。**格子の境で値が飛ぶ。**
 *
 * > ### **傾きを 1 マス以内に保ちたい所には使わない**（2026-09-06 に分かった）
 * >
 * > **四隅を別々の種で引いている**ので、隣り合う格子が同じ角の値を共有しない。
 * > **`length` の倍数の座標で段が出る**——石垣の高さがいきなり 1 → 6 になり、
 * > **登れない面**（0-8）で検査に落ちた。
 * >
 * > **なめらかさが要るなら `smoothWave`。**
 * > **岩肌の粗さのように、飛んでよい所ではこちらでよい。**
 */
export function wave(seed: number, x: number, z: number, length: number): number {
  const a = noise(seed, Math.floor(x / length), Math.floor(z / length));
  const b = noise(seed + 1, Math.floor(x / length) + 1, Math.floor(z / length));
  const c = noise(seed + 2, Math.floor(x / length), Math.floor(z / length) + 1);
  const d = noise(seed + 3, Math.floor(x / length) + 1, Math.floor(z / length) + 1);
  const fx = smooth((x / length) % 1);
  const fz = smooth((z / length) % 1);
  const top = a * (1 - fx) + b * fx;
  const bot = c * (1 - fx) + d * fx;
  return (top * (1 - fz) + bot * fz) * 2 - 1;
}

/**
 * **なめらかな揺らぎ**（−1〜1）。**格子の境でも繋がる。**
 *
 * **四隅を同じ種で引く**のが `wave` との違い。
 * **地形の起伏・壁の高さ**のように、**傾きを抑えたい所はこちら。**
 */
export function smoothWave(seed: number, x: number, z: number, length: number): number {
  const ix = Math.floor(x / length);
  const iz = Math.floor(z / length);
  const a = noise(seed, ix, iz);
  const b = noise(seed, ix + 1, iz);
  const c = noise(seed, ix, iz + 1);
  const d = noise(seed, ix + 1, iz + 1);
  const fx = smooth(x / length - ix);
  const fz = smooth(z / length - iz);
  const top = a * (1 - fx) + b * fx;
  const bot = c * (1 - fx) + d * fx;
  return (top * (1 - fz) + bot * fz) * 2 - 1;
}

function smooth(t: number): number {
  const v = t < 0 ? t + 1 : t;
  return v * v * (3 - 2 * v);
}

/**
 * **1 マスごとに材を引く**（`14-map-build.md` 0-7）。
 *
 * **区画で塗り分けない。** そのうえで、
 * **ゆっくり変わる「寄り」**を足して、場所ごとに混ざり方を変える。
 */
export function speckle(seed: number, x: number, z: number, mats: readonly string[]): string {
  if (mats.length === 0) return "stone";
  // **寄り**——長い波で、どの材に寄るかを動かす
  const bias = (wave(seed + 91, x, z, 18) + 1) / 2;
  const r = noise(seed, x, z) * 0.72 + bias * 0.28;
  const i = Math.min(mats.length - 1, Math.floor(r * mats.length));
  return mats[i] ?? mats[0] ?? "stone";
}

/** 縦に 1 本埋める。**上面だけ別の材にできる** */
export function column(ops: BuildOp[], x: number, z: number, top: number, body: string, cap?: string): void {
  if (top < BOTTOM) return;
  ops.push(fill(x, BOTTOM, z, x, cap === undefined ? top : top - 1, z, body));
  if (cap !== undefined) ops.push(set(x, top, z, cap));
}
