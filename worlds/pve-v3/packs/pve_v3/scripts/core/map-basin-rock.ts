/**
 * 岩山の窪地——**岩。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 0-5・0-6。
 *
 * > ### 岩は「同じ型の置き直し」にしない（0-6）
 * >
 * > 前は**格子に 2 マス刻みで、同じ丸い塊**を撒いていた。
 * > 大きさが 2 通り・高さが 3 通りしかなく、**どれも同じ形**に見えた。
 * >
 * > **形を 3 種、置き場所も間隔も散らす。**
 *
 * > ### 浮かせない（0-5）
 * >
 * > 前は**塊の中心の地面の高さ**から積んでいたので、
 * > **斜面では外側の柱が宙に浮いていた。**
 * > **柱ごとに、その柱の地面から積む。**
 */

import { fill, type BuildOp } from "./build.js";
import { PORTAL_Z, SEED, SPAWN_Z } from "./map-basin-const.js";
import { inLane, inRiverAt, isLand, topOf } from "./map-basin.js";
import { noise, spot } from "./noise.js";

/** 岩の肌 */
function skin(x: number, z: number, seed: number): string {
  const v = noise(x, z, 4, seed);
  return v > 0.66 ? "mossy_cobblestone" : v > 0.36 ? "cobblestone" : v > 0.16 ? "andesite" : "tuff";
}

/**
 * 1 本の柱を、**その柱の地面から**積む。
 *
 * **これが「浮かせない」の全部。** 高さは呼ぶ側が形で決める。
 */
function pillar(ops: BuildOp[], tops: Map<string, number>, x: number, z: number, up: number, seed: number): void {
  if (up <= 0) return;
  const base = topOf(x, z);
  ops.push(fill(x, base + 1, z, x, base + up, z, skin(x, z, seed)));
  // **いちばん上を覚えておく**（あとで「登れる高さ」に均す）
  const k = `${x},${z}`;
  tops.set(k, Math.max(tops.get(k) ?? -999, base + up));
}

/**
 * **登れる形にする**（0-8）。
 *
 * > ### 縁から 1 マスずつしか上がらない
 * >
 * > 「中心が高く外が低い」だけでは足りない。
 * > **縁からの隔たりより高くしない**——そうすれば、
 * > **どの向きから寄っても 1 マスずつで登れる。**
 *
 * @param rim 縁までの隔たり（マス）
 */
function step(top: number, rim: number): number {
  return Math.max(0, Math.min(top, rim));
}

/** 低い塚。**縦横を別々に伸ばす**ので、真円にならない */
function mound(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, s: number): void {
  const rx = 3 + Math.floor(spot(cx, cz, s + 1) * 5);
  const rz = 3 + Math.floor(spot(cx, cz, s + 2) * 5);
  const top = 2 + Math.floor(spot(cx, cz, s + 3) * 2);
  for (let dx = -rx; dx <= rx; dx++) {
    for (let dz = -rz; dz <= rz; dz++) {
      const t = (dx / rx) ** 2 + (dz / rz) ** 2;
      if (t > 1) continue;
      // 縁は乱数で欠けさせる
      if (t > 0.6 && noise(cx + dx, cz + dz, 3, s + 4) > 0.62) continue;
      const rim = Math.round((1 - Math.sqrt(t)) * Math.min(rx, rz));
      pillar(ops, tops, cx + dx, cz + dz, step(top, rim), s);
    }
  }
}

/** 角ばった段。**向きを 4 通りから引く** */
function slab(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, s: number): void {
  const long = 4 + Math.floor(spot(cx, cz, s + 5) * 5);
  const short = 2 + Math.floor(spot(cx, cz, s + 6) * 3);
  const top = 1 + Math.floor(spot(cx, cz, s + 7) * 3);
  const turn = Math.floor(spot(cx, cz, s + 8) * 4);
  for (let a = -long; a <= long; a++) {
    for (let b = -short; b <= short; b++) {
      // **回す。** 縦横を入れ替え、符号も変える
      const dx = turn % 2 === 0 ? a : b;
      const dz = turn % 2 === 0 ? b : a;
      const sx = turn < 2 ? dx : -dx;
      const rim = Math.min(long - Math.abs(a), short - Math.abs(b));
      pillar(ops, tops, cx + sx, cz + dz, step(top, rim), s);
    }
  }
}

/** 崩れた石の帯。**細長く、1 マスだけ** */
function scree(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, s: number): void {
  const len = 5 + Math.floor(spot(cx, cz, s + 9) * 8);
  const turn = spot(cx, cz, s + 10);
  const ux = Math.cos(turn * Math.PI * 2);
  const uz = Math.sin(turn * Math.PI * 2);
  for (let i = -len; i <= len; i++) {
    const w = noise(cx + i, cz, 2, s + 11) > 0.55 ? 1 : 0;
    for (let b = -w; b <= w; b++) {
      const x = Math.round(cx + ux * i - uz * b);
      const z = Math.round(cz + uz * i + ux * b);
      if (noise(x, z, 2, s + 12) > 0.7) continue;
      pillar(ops, tops, x, z, 1, s);
    }
  }
}

/** そこに置いてよいか。**通り道と要所は空ける** */
function free(x: number, z: number): boolean {
  const d = Math.hypot(x, z);
  if (d < 10 || d > 33) return false;
  if (!isLand(x, z)) return false;
  if (inRiverAt(x, z)) return false;
  // **湧く所からポータルまでの見通しを塞がない**（0-3）
  if (inLane(x, z)) return false;
  return true;
}

/**
 * 岩を撒く。
 *
 * > ### 等間隔に置かない（0-6）
 * >
 * > **升目の交点に置くと、間隔そのものが模様になる。**
 * > **升目ごとに、位置を升目の幅ぶん揺らす。**
 * > **置かない升目**も作る。
 */
export function rocks(ops: BuildOp[], tops: Map<string, number>): void {
  const STEP = 8;
  const N = 5;
  for (let gx = -N; gx <= N; gx++) {
    for (let gz = -N; gz <= N; gz++) {
      const roll = spot(gx * 37, gz * 19, SEED + 101);
      if (roll > 0.66) continue; // **3 つに 1 つは置かない**
      const x = gx * STEP + Math.round((spot(gx * 13, gz * 29, SEED + 103) - 0.5) * STEP);
      const z = gz * STEP + Math.round((spot(gx * 23, gz * 41, SEED + 107) - 0.5) * STEP);
      if (!free(x, z)) continue;
      const s = SEED + 200 + gx * 61 + gz * 97;
      const kind = Math.floor(spot(x, z, s) * 3);
      if (kind === 0) mound(ops, tops, x, z, s);
      else if (kind === 1) slab(ops, tops, x, z, s);
      else scree(ops, tops, x, z, s);
    }
  }
}
