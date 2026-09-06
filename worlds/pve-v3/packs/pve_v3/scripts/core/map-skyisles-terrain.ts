/**
 * 戦場 02「雲の上の浮島」——**島を積む。純粋。**
 *
 * ```
 * terrain()  柱を 1 本ずつ、地層に分けて積む
 * collar()   島の底に雲をまとわせる（**縁から下を覗いたときの見え方**）
 * roots()    底から岩の根を垂らす
 * smooth()   最後に段差を埋める（0-8）
 * ```
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise, speckle, wave } from "./map-frame.js";
import { CLOUD, bodyOf, skinOf } from "./map-skyisles-mat.js";
import { SEED, bottomY, key, surfaceY, type Field } from "./map-skyisles-shape.js";

/**
 * 柱を積む。**帯ごとに `fill` する**——1 マスずつ置くと手順が 4 倍に膨らむ。
 *
 * 下から **深層岩 → 石 → 土 → 表面**。**下ほど古い石**にして、
 * 島の断面が地層に見えるようにする。
 */
export function terrain(ops: BuildOp[], field: Field, tops: Map<string, number>): void {
  for (const g of field.values()) {
    const top = surfaceY(g);
    const bot = bottomY(g);
    const mat = bodyOf(g);

    // 帯の境目。**薄い柱では潰れる**ので、いつも下を優先する
    const soil = Math.max(bot, top - 2);
    const rock = Math.max(bot, top - 8);
    const deep = Math.min(bot + 6, rock - 1);

    if (deep >= bot) ops.push(fill(g.x, bot, g.z, g.x, deep, g.z, mat.deep));
    if (rock - 1 >= deep + 1) ops.push(fill(g.x, deep + 1, g.z, g.x, rock - 1, g.z, mat.rock));
    if (soil - 1 >= rock) ops.push(fill(g.x, rock, g.z, g.x, soil - 1, g.z, mat.soil));
    if (top - 1 >= soil) ops.push(fill(g.x, soil, g.z, g.x, top - 1, g.z, mat.soil));
    ops.push(set(g.x, top, g.z, skinOf(g)));
    tops.set(key(g.x, g.z), top);
  }
}

/**
 * 島の底に雲をまとわせる。
 *
 * > ### 雲は「島の footprint の中」にしか置けない
 * >
 * > **島の外に雲の棚を作ると、その天面が
 * > 「湧く所から歩いて行けない面」になって 0-8 に落ちる。**
 * >
 * > だから**見える雲は裾（`skirt`）で、底の雲は島の真下だけ。**
 * > 底の雲は縁から下を覗いたときに見える——**空の上に居る合図。**
 */
export function collar(ops: BuildOp[], field: Field): void {
  for (const g of field.values()) {
    if (g.t > 1 || g.t < 0.4) continue;
    const n = noise(SEED + 71, g.x, g.z);
    // **まばらにする。** 一様に貼ると、島の底が白い皿になる
    if (n < 0.24) continue;
    const bot = bottomY(g);
    const thick = 2 + Math.round(n * 4 + (wave(SEED + 73, g.x, g.z, 9) + 1) * 1.6);
    ops.push(fill(g.x, bot - thick, g.z, g.x, bot - 1, g.z, speckle(SEED + 75, g.x, g.z, CLOUD)));
  }
}

/** 底から垂れる岩の根。**ここだけ細く尖らせる**と、浮いている感じが出る */
export function roots(ops: BuildOp[], field: Field): void {
  const mats = ["deepslate", "tuff", "cobbled_deepslate", "dripstone_block", "stone"];
  for (const g of field.values()) {
    if (g.t > 0.86 || noise(SEED + 81, g.x, g.z) < 0.972) continue;
    const bot = bottomY(g);
    const len = 3 + Math.round(noise(SEED + 83, g.x, g.z) * 9);
    ops.push(fill(g.x, bot - len, g.z, g.x, bot - 1, g.z, speckle(SEED + 85, g.x, g.z, mats)));
  }
}

/**
 * **登れる高さに均す**（0-8）。
 *
 * > ### 地形と造作を別々に積むと、足し算で段差が出る
 * >
 * > 地形の傾きが 1 マス以内でも、**その上に高さ 1 の壇を置けば、隣との差は 2 になる。**
 * > **最後に高さの表を見て、隣より 2 マス以上低い所を埋める。**
 * > **埋めるだけ**なので、形が崩れることはない。
 *
 * 奈落に面した縁は**隣が居ない**ので、埋まらない——**島は太らない。**
 */
export function smooth(ops: BuildOp[], tops: Map<string, number>): void {
  const before = new Map(tops);
  // **落ち着くまで繰り返す。** 1 回では、埋めた所の隣がまた低くなる
  for (let pass = 0; pass < 20; pass++) {
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
        const n = tops.get(key(x + (dx ?? 0), z + (dz ?? 0)));
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
    const v = noise(SEED + 91, x, z);
    ops.push(fill(x, was + 1, z, x, y, z, v > 0.6 ? "cobblestone" : v > 0.3 ? "andesite" : "stone"));
  }
}

/** 湧く所とゲートを結ぶ線に、**目より上の物を置いてよいか**（0-3） */
export function viewSafe(x: number, z: number): boolean {
  return Math.abs(x) > 1 || z < -41 || z > 35;
}

/** 天面の上に 1 本立てる。**橋の柱・列石・氷柱に使う** */
export function stand(
  ops: BuildOp[],
  tops: Map<string, number>,
  x: number,
  z: number,
  up: number,
  mats: readonly string[],
  cap?: string
): void {
  const base = tops.get(key(x, z));
  if (base === undefined || up < 1 || !viewSafe(x, z)) return;
  for (let i = 1; i <= up; i++) ops.push(set(x, base + i, z, speckle(SEED + 101 + i, x, z, mats)));
  if (cap !== undefined) ops.push(set(x, base + up + 1, z, cap));
}

/** 天面を張り替える。**平らにならすときは `y` を渡す** */
export function level(ops: BuildOp[], tops: Map<string, number>, x: number, z: number, y: number, block: string): void {
  const cur = tops.get(key(x, z));
  if (cur === undefined) return;
  if (cur < y) ops.push(fill(x, cur, z, x, y - 1, z, "stone"));
  ops.push(fill(x, y + 1, z, x, Math.max(y + 5, cur + 1), z, "air"));
  ops.push(set(x, y, z, block));
  tops.set(key(x, z), y);
}

/** そこは陸か（天面が分かっているか） */
export function hasTop(tops: Map<string, number>, x: number, z: number): boolean {
  return tops.has(key(x, z));
}

/** 地面の高さ。**造作は必ずここを見る**——`GROUND` を決め打つと地形から浮く */
export function topOf(tops: Map<string, number>, x: number, z: number): number {
  return tops.get(key(x, z)) ?? GROUND;
}
