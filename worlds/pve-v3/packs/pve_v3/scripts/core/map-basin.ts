/**
 * 戦場 01「宙の窪地」（`basin`）。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 1 番。
 *
 * ## コンセプト
 *
 * > ### **崩れた火口が、そのまま宙に浮いている。**
 * >
 * > 中央は平らで戦いやすく、**転がった岩が遮蔽になる。**
 * > 涸れた川筋が斜めに走り、**低い所を通ると身を隠せる。**
 * > 奥には**誰かが昔組んだ石畳と門**があり、その上にポータルが立つ。
 * >
 * > **縁から先は無い。** 落ちれば奈落。
 *
 */

import { fill, set, type BuildOp } from "./build.js";
import { BOTTOM, CLEAR, CLEAR_TOP, GROUND, HALF, PORTAL_Z, SEED, SPAWN_Z } from "./map-basin-const.js";
import { fbm, noise } from "./noise.js";
import { detailOps } from "./map-basin-detail.js";
import { dais, path, spawnPad } from "./map-basin-spots.js";
import { rocks } from "./map-basin-rock.js";

/** 中心からの隔たり */
function dist(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** 島の縁。**真円にしない**——揺らして、寄り引きを作る */
export function edgeAt(x: number, z: number): number {
  return 46 + (fbm(x, z, 27, SEED + 61, 2) - 0.5) * 8;
}

/** そこに島が有るか */
export function isLand(x: number, z: number): boolean {
  return dist(x, z) <= edgeAt(x, z);
}

/**
 * **湧く所とポータルを結ぶ帯**（0-3）。
 *
 * **間に岩や起伏があると、どこへ行けばいいのか分からない。**
 * **この帯の中は平らにして、遮るものを置かない。**
 */
export function inLane(x: number, z: number): boolean {
  return Math.abs(x) <= 6 && z >= SPAWN_Z - 2 && z <= PORTAL_Z + 2;
}

/** 涸れ川の中心（その z における x） */
function riverX(z: number): number {
  return Math.round(Math.sin((z + 60) / 21) * 15 + 4);
}

/** 涸れ川の中か。**幅 7・深さ 1** */
export function inRiverAt(x: number, z: number): boolean {
  if (dist(x, z) > 34 || inLane(x, z)) return false;
  return Math.abs(x - riverX(z)) <= 3;
}

/**
 * その柱の上面。
 *
 * > ### 傾きを 1 マス以内に収める（0-8）
 * >
 * > **敵も登る。** 段差 2 マスを作ると、そこが安全地帯になる。
 * > **波長を長く、振幅を小さく。** 細かい粒を高さに混ぜない。
 */
export function heightOf(x: number, z: number): number {
  if (inLane(x, z)) return GROUND;
  return GROUND + Math.round((fbm(x, z, 31, SEED, 2) - 0.5) * 5);
}

/**
 * **その柱の本当の天面。**
 *
 * > 涸れ川は 1 マス掘り下げてある。**掘る前の高さで岩を置くと、1 マス浮く。**
 * > **積む側は必ずこちらを見る。**
 */
export function topOf(x: number, z: number): number {
  return heightOf(x, z) - (inRiverAt(x, z) ? 1 : 0);
}

/** その柱の厚み。**中央ほど厚く、縁で薄くなる** */
function depthAt(x: number, z: number): number {
  const t = Math.min(1, dist(x, z) / edgeAt(x, z));
  return Math.max(3, Math.round(4 + (1 - t) ** 1.7 * 30 + (fbm(x, z, 15, SEED + 17, 3) - 0.5) * 7));
}

/**
 * その柱の表面。**1 マスごとに引く**（0-7）。
 *
 * > ### まばら ＝ 1 マスごとに違う
 * >
 * > 区画ごとに主役を決めて塗り分けると、**升目の大きい塗り絵**になる。
 * > **引くのは 1 マスごと。** そのうえで、
 * > **ゆっくり変わる「寄り」**を足して、場所ごとの混ざり方を変える。
 */
function surfaceAt(x: number, z: number): string {
  const r = noise(x, z, 1, SEED + 37);
  const lean = (fbm(x, z, 29, SEED + 31, 2) - 0.5) * 0.44;
  const t = Math.min(1, dist(x, z) / edgeAt(x, z));

  if (inRiverAt(x, z)) return r > 0.72 ? "clay" : r > 0.5 ? "gravel" : r > 0.24 ? "coarse_dirt" : "andesite";

  // **縁は崩れて石が出る**
  if (t > 0.84) {
    const p = r + lean;
    return p > 0.74 ? "gravel" : p > 0.52 ? "cobblestone" : p > 0.3 ? "stone" : p > 0.12 ? "andesite" : "tuff";
  }

  const p = r + lean;
  // 苔は**北（−z）の湿った側**に寄せる
  if (p > 0.86) return z < 6 ? "moss_block" : "podzol";
  if (p > 0.7) return "podzol";
  if (p > 0.55) return "coarse_dirt";
  if (p > 0.4) return "dirt";
  if (p > 0.27) return "gravel";
  if (p > 0.14) return "andesite";
  return "cobblestone";
}

/**
 * 地形を積む。
 *
 * **柱は同じ石が続く帯**でできている。**帯ごとに `fill` する**——
 * 1 マスずつ置くと、手順が 4 倍以上に膨らむ。
 *
 * 下から **深層岩 → 凝灰岩 → 石 → 土 → 表面**。**下ほど古い石**にして地層に見せる。
 */
function terrain(ops: BuildOp[], tops: Map<string, number>): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      if (!isLand(x, z)) continue;
      const top = topOf(x, z);
      const bottom = top - depthAt(x, z);

      // 帯の境目。**薄い柱では潰れる**ので、いつも下を優先する
      const dirt = Math.max(bottom, top - 2);
      const stone = Math.max(bottom, top - 6);
      const deep = Math.min(bottom + 5, stone - 1);

      if (deep >= bottom) ops.push(fill(x, bottom, z, x, deep, z, "deepslate"));
      if (stone - 1 >= deep + 1) ops.push(fill(x, deep + 1, z, x, stone - 1, z, "tuff"));
      if (dirt - 1 >= stone) ops.push(fill(x, stone, z, x, dirt - 1, z, "stone"));
      if (top - 1 >= dirt) ops.push(fill(x, dirt, z, x, top - 1, z, "dirt"));
      ops.push(set(x, top, z, surfaceAt(x, z)));
      tops.set(`${x},${z}`, top);
    }
  }
}

/** 空を通す。**マップより外まで抜く**（前のマップを消すため） */
function sky(ops: BuildOp[]): void {
  for (let x = -CLEAR; x <= CLEAR; x++) {
    ops.push(fill(x, BOTTOM, -CLEAR, x, CLEAR_TOP, CLEAR, "air"));
  }
}

/**
 * **登れる高さに均す**（0-8）。
 *
 * > ### 地形と構造物を別々に積むと、足し算で段差が出る
 * >
 * > 地形の傾きが 1 マス以内でも、**その上に高さ 1 の岩を置けば、隣との差は 2 になる。**
 * >
 * > **最後に高さの表を見て、隣より 2 マス以上低い所を埋める。**
 * > **埋めるだけ**なので、削って形が崩れることはない。
 */
function smooth(ops: BuildOp[], tops: Map<string, number>): void {
  const before = new Map(tops);
  const at = (x: number, z: number): number | undefined => tops.get(`${x},${z}`);

  // **落ち着くまで繰り返す。** 1 回では、埋めた所の隣がまた低くなる
  for (let pass = 0; pass < 24; pass++) {
    let moved = 0;
    for (const [k, y] of tops) {
      const [x, z] = k.split(",").map(Number);
      if (x === undefined || z === undefined) continue;
      let need = -999;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = at(x + (dx ?? 0), z + (dz ?? 0));
        if (n !== undefined) need = Math.max(need, n - 1);
      }
      if (y < need) {
        tops.set(k, need);
        moved++;
      }
    }
    if (moved === 0) break;
  }

  for (const [k, y] of tops) {
    const was = before.get(k) ?? y;
    if (y <= was) continue;
    const [x, z] = k.split(",").map(Number);
    if (x === undefined || z === undefined) continue;
    const v = noise(x, z, 1, SEED + 51);
    ops.push(fill(x, was + 1, z, x, y, z, v > 0.6 ? "cobblestone" : v > 0.3 ? "andesite" : "stone"));
  }
}

/** 組む手順 */
export function basinOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  const tops = new Map<string, number>();
  sky(ops);
  terrain(ops, tops);
  rocks(ops, tops);
  path(ops, tops);
  dais(ops, tops);
  spawnPad(ops, tops);
  smooth(ops, tops);
  ops.push(...detailOps());
  return ops;
}

// **数は `map-basin-const.ts` に置いてある。** ここから出しておく（読む側の import を 1 つにする）
export { GROUND, PORTAL_Z, SEED, SPAWN_Z } from "./map-basin-const.js";
