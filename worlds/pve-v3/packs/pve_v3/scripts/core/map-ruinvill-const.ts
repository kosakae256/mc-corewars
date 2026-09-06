/**
 * 4. 廃村（`ruinvill`）——**数と材だけ。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 4 番。
 * 決まりは `spec/14-map-build.md` 0 章。
 *
 * > ### 定数を別の口に置く
 * >
 * > 地形（`map-ruinvill.ts`）と町並み（`map-ruinvill-town.ts`）が
 * > **互いを読み合うと、読み込みの途中で定数が空になる**——
 * > `map-basin-const.ts` に同じ事故の記録がある。
 * > **数はどちらにも属さない口に置く。**
 */

import { noise, speckle } from "./map-frame.js";

/** 種。**変えれば別の崩れ方になる** */
export const SEED = 2274;

/**
 * 島の広がり（楕円）。**奥行きのほうを長く取る**——
 * 湧く所（z ＝ −40）とゲート（z ＝ +39）を、余裕をもって内側に入れるため。
 */
const AX = 46;
const AZ = 47;

/** 島の縁からの位置。**1 でちょうど縁** */
export function edgeK(x: number, z: number): number {
  return Math.hypot(x / AX, z / AZ);
}

/**
 * ぐるりの角度（ラジアン）。**0 が ＋x、π/2 が ＋z**
 *
 * > ### 外周の形は、**角度だけで決める**（2026-09-06 に直した）
 * >
 * > `map-frame.ts` の `wave` は、**格子の四隅で別々の種を引いている。**
 * > そのため**格子の境目（21 マスごと）で値が飛ぶ**——
 * > 実際に**石垣の高さが隣り合って 1 と 6 になり**、そこが登れない面になった。
 * >
 * > **正弦の重ね合わせなら、どこにも切れ目が無い。**
 * > 傾きも手で決められる——**1 マスあたり 0.5 段より緩く**しておけば、
 * > 丸めても隣との差は 1 マスに収まる（0-8）。
 */
function angleOf(x: number, z: number): number {
  return Math.atan2(z, x);
}

/** 縁の揺らぎ。**真円にしない**（0-6）。**最後の項だけ 1 マスごとに引いて縁を毛羽立たせる** */
function edgeLimit(x: number, z: number): number {
  const a = angleOf(x, z);
  return (
    1 +
    Math.sin(a * 2 + 0.6) * 0.014 +
    Math.sin(a * 5 - 1.7) * 0.01 +
    Math.sin(a * 9 + 2.4) * 0.007 +
    (noise(SEED + 63, x, z) - 0.5) * 0.024
  );
}

/**
 * そこに地面が有るか。
 *
 * > ### **縁の外は奈落**（`14-map-build.md` 0-4）
 * >
 * > **登れない崖を、自然な形で作るのは無理がある。**
 * > **村ごと宙に浮かせて、縁を切る。**
 */
export function isLand(x: number, z: number): boolean {
  return edgeK(x, z) <= edgeLimit(x, z);
}

/** 縁から何マス内側か */
export function inset(x: number, z: number): number {
  return (edgeLimit(x, z) - edgeK(x, z)) * AX;
}

// ================================================================ 外壁

/**
 * 稜堡（張り出し）を置く向き（度）。**等間隔に置かない**（0-6）。
 *
 * **0 が ＋x、90 が ＋z。** 湧く所（−90 の側）とゲート（+90 の側）は外している——
 * **正面に大きな影を作らない。**
 */
const BASTIONS: readonly number[] = [-146, -37, 24, 61, 143, 176];

/** その場所の「稜堡らしさ」0〜1。**なだらかに立ち上げる**——段差を作らないため */
export function bastion(x: number, z: number): number {
  const a = (angleOf(x, z) * 180) / Math.PI;
  let b = 0;
  for (const t of BASTIONS) {
    const d = Math.min(Math.abs(a - t), 360 - Math.abs(a - t));
    b = Math.max(b, Math.max(0, 1 - d / 16));
  }
  return b;
}

/** 外壁の帯の厚み。**稜堡では内側へ太る** */
export function wallWidth(x: number, z: number): number {
  return 3 + Math.round(bastion(x, z) * 4.4);
}

/**
 * 外壁の高さ。
 *
 * > ### **崩れて 1 マスまで落ちる所を残す**
 * >
 * > **そこから塁の上へ上がれる**——上がれないと、
 * > 壁の天端がまるごと「歩いて行けない面」になる（0-8）。
 * >
 * > **波長を長く、振幅を小さく**取って、**隣との差を 1 マスに収める。**
 */
export function wallHeight(x: number, z: number): number {
  const a = angleOf(x, z);
  const h =
    4.8 + Math.sin(a * 3 + 0.9) * 1.3 + Math.sin(a * 5 - 2.2) * 1 + Math.sin(a * 8 + 1.4) * 0.7 + bastion(x, z) * 2.2;
  return Math.max(1, Math.min(9, Math.round(h)));
}

/**
 * 崩れ落ちた切れ目を置く向き（度）。**8 箇所。**
 *
 * > ### **上がれない天端を作らない**（0-8）
 * >
 * > 壁の天端がまるごと「歩いて行けない面」になると、そこで戦えない。
 * > **石垣が崩れ落ちて、地面から 1 段ずつ登れる切れ目**を、ぐるりに開ける——
 * > **意匠と決まりが同じ方向を向く。**
 */
const BREACH_DEG: readonly number[] = [-158, -119, -73, -28, 17, 58, 101, 139];

/**
 * 切れ目の中心。**帯の厚みのまん中**に取る。
 *
 * **升目の距離で 1 マスずつ上げる**ので、切れ目のまわりは必ず
 * **隣との差が 1 マス**になる——分数で作ると、丸めた拍子に 2 マスの段差が出る。
 */
export function breachPoints(): readonly { readonly x: number; readonly z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const deg of BREACH_DEG) {
    const a = (deg * Math.PI) / 180;
    let best: { x: number; z: number } | undefined;
    let bestD = 1e9;
    for (let r = 30; r <= 49; r += 0.5) {
      const x = Math.round(Math.cos(a) * r);
      const z = Math.round(Math.sin(a) * r);
      if (!isLand(x, z)) continue;
      const d = Math.abs(inset(x, z) - wallWidth(x, z) / 2);
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
    if (best !== undefined) out.push(best);
  }
  return out;
}

/** 外壁の帯の中か */
export function inWall(x: number, z: number): boolean {
  const d = inset(x, z);
  return d >= 0 && d < wallWidth(x, z);
}

// ================================================================ 道

/**
 * 目抜き通りの中心。**必ず x ＝ 0 を含む**（±2 までしか振らない）。
 *
 * > ### 湧く所からゲートまでの見通しは、ここで守る（0-3）
 * >
 * > **建物は見えなくてよい**（0-3 の緩和）が、
 * > **一本道が通っていないと、どちらへ行けばいいのか分からない。**
 */
export function streetX(z: number): number {
  return Math.round(Math.sin(z / 26 + 0.8) * 1.6 + Math.sin(z / 11 - 1.9) * 0.6);
}

/** 目抜き通りの上か。**幅 7** */
export function inStreet(x: number, z: number): boolean {
  return Math.abs(x - streetX(z)) <= 3;
}

/** 横道の通る z。**家並みの帯を切り分ける** */
export const CROSS: readonly number[] = [-16, -5, 8, 20];

/** 横道の上か。**幅 3** */
export function inCross(z: number): boolean {
  for (const c of CROSS) if (Math.abs(z - c) <= 1) return true;
  return false;
}

/** 舗装されている所 */
export function isPaved(x: number, z: number): boolean {
  return inStreet(x, z) || inCross(z);
}

// ================================================================ 材

/** 敷石。**1 マスごとに引く**（0-7） */
const ROAD = ["cobblestone", "cobblestone", "andesite", "mossy_cobblestone", "stone", "coarse_dirt"];

/** 村の地面。**踏み固められた土と、戻りかけの草** */
const SOIL = ["coarse_dirt", "dirt", "podzol", "cobblestone", "moss_block", "grass_path", "clay"];

/** 島の上澄み（地面のすぐ下） */
const SUB = ["dirt", "coarse_dirt", "cobblestone", "clay", "stone"];

/** 島の底。**下ほど古い石にして地層に見せる** */
const DEEP = ["stone", "tuff", "andesite", "deepslate", "cobbled_deepslate", "dripstone_block"];

/** その 1 マスの表面 */
export function groundMat(x: number, z: number): string {
  return isPaved(x, z) ? speckle(SEED + 3, x, z, ROAD) : speckle(SEED + 9, x, z, SOIL);
}

/** 地面のすぐ下 */
export function subMat(x: number, z: number): string {
  return speckle(SEED + 23, x, z, SUB);
}

/** 島の底 */
export function deepMat(x: number, z: number): string {
  return speckle(SEED + 29, x, z, DEEP);
}

/** 島の厚み。**中ほどが厚く、縁で薄くなる** */
export function depthAt(x: number, z: number): number {
  const t = Math.min(1, edgeK(x, z));
  return Math.max(3, Math.round(3 + (1 - t) ** 1.7 * 27 + (noise(SEED + 33, x >> 2, z >> 2) - 0.5) * 5));
}
