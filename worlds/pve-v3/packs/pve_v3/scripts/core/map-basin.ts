/**
 * 戦場 01「岩山の窪地」（`basin`）。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 1 番。
 *
 * ## コンセプト
 *
 * > ### **崩れた火口を、そのまま闘技場にした場所。**
 * >
 * > 四方を岩壁に囲まれた擂鉢。**外は見えない。**
 * > 中央は平らで戦いやすく、**転がった岩が遮蔽になる。**
 * > 涸れた川筋が斜めに走り、**低い所を通ると身を隠せる。**
 * > 奥には**誰かが昔組んだ石段と壇**があり、その上にポータルが立つ。
 *
 * ```
 *              奥（＋z）
 *      ／￣￣ 岩壁（＋30）￣￣＼
 *     ｜      [ 壇 ＋ ポータル ]  ｜   z ＝ +42
 *     ｜   岩   涸れ川   岩      ｜
 *     ｜        中央（平ら）      ｜   0, 0
 *     ｜   岩          岩        ｜
 *     ｜      ▲ 湧く所           ｜   z ＝ −40
 *      ＼＿＿ 岩壁 ＿＿＿＿＿＿／
 *              手前（−z）
 * ```
 *
 * ## 地形の骨
 *
 * | 帯 | 半径 | 高さ |
 * | --- | --- | --- |
 * | **中央**（戦う所） | 〜30 | **12**（±1 の凹凸だけ） |
 * | **斜面** | 30〜44 | 12 → 30。**登れるが、登りにくい** |
 * | **岩壁** | 44〜 | 30 → 46。**外を隠す** |
 *
 * ## 使う石
 *
 * **下ほど古い石**にして、崩れた地層に見せる。
 *
 * | | |
 * | --- | --- |
 * | 地下 | 深層岩 |
 * | 岩体 | 石・安山岩・凝灰岩 |
 * | 崩れ | 丸石・苔むした丸石・砂利 |
 * | 地面 | 粗い土・砂利・苔（北側だけ） |
 */

import { fill, set, type BuildOp } from "./build.js";
import { fbm, noise, spot } from "./noise.js";
import { detailOps } from "./map-basin-detail.js";

/** 端（x・z とも −50 〜 49） */
const HALF = 50;

/** 掘り抜く外側。**空を通すために、マップより少し広く取る** */
const CLEAR = 64;
const CLEAR_TOP = 150;

/** 中央の高さ */
export const GROUND = 12;

/** 湧く所とポータル（`../02-map.md` 4 章） */
export const SPAWN_Z = -40;
export const PORTAL_Z = 42;

/** 壇の高さ */
const DAIS = GROUND + 4;

/** 種。**変えれば別の凹凸になる** */
const SEED = 1337;

function dist(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** その柱の高さ */
export function heightOf(x: number, z: number): number {
  const d = dist(x, z);
  const rough = fbm(x, z, 18, SEED, 3) - 0.5;

  if (d <= 30) return GROUND + Math.round(rough * 2.4);

  if (d <= 44) {
    // **斜面**。外へ向かって二次曲線で上がる
    const t = (d - 30) / 14;
    return GROUND + Math.round(t * t * 18 + rough * 3);
  }

  // **岩壁**。荒く、外ほど高い
  const t = Math.min(1, (d - 44) / 8);
  return GROUND + Math.round(18 + t * 16 + (fbm(x, z, 9, SEED + 7, 4) - 0.5) * 7);
}

/** 涸れ川の中心（その z における x） */
function riverX(z: number): number {
  return Math.round(Math.sin((z + 60) / 21) * 15 + 4);
}

/** 涸れ川の中か。**幅 7・深さ 2** */
export function inRiverAt(x: number, z: number): boolean {
  if (dist(x, z) > 34) return false;
  return Math.abs(x - riverX(z)) <= 3;
}

/** その柱の表面 */
function surfaceAt(x: number, z: number, y: number): string {
  const d = dist(x, z);
  const v = fbm(x, z, 11, SEED + 31, 3);

  if (inRiverAt(x, z)) return v > 0.55 ? "clay" : "gravel";

  if (d <= 30) {
    // **中央は土と砂利。** 北側（−z）だけ苔を混ぜて、方向が分かるようにする
    if (z < -12 && v > 0.62) return "moss_block";
    if (v > 0.66) return "gravel";
    if (v > 0.38) return "coarse_dirt";
    return "andesite";
  }

  if (d <= 38) {
    // **斜面の裾は崩れた石**
    if (v > 0.62) return "gravel";
    if (v > 0.4) return "cobblestone";
    return "stone";
  }

  if (d <= 46) {
    if (v > 0.66) return "tuff";
    if (v > 0.34) return "stone";
    return "andesite";
  }

  // **岩壁の上のほう**
  if (v > 0.6) return "cobblestone";
  if (v > 0.3) return "stone";
  return "tuff";
}

/** 柱の中身 */
function coreAt(y: number): string {
  return y <= 5 ? "deepslate" : "stone";
}

/** 地形を積む */
function terrain(ops: BuildOp[]): void {
  for (let x = -HALF; x < HALF; x++) {
    for (let z = -HALF; z < HALF; z++) {
      let h = heightOf(x, z);
      if (inRiverAt(x, z)) h -= 2;
      // **地下は深層岩、その上は石**
      ops.push(fill(x, 0, z, x, 5, z, coreAt(0)));
      if (h > 6) ops.push(fill(x, 6, z, x, h - 1, z, coreAt(6)));
      ops.push(set(x, h, z, surfaceAt(x, z, h)));
    }
  }
}

/** 転がった岩。**遮蔽になる** */
function boulders(ops: BuildOp[]): void {
  for (let x = -34; x <= 34; x += 2) {
    for (let z = -34; z <= 34; z += 2) {
      const d = dist(x, z);
      if (d < 11 || d > 32) continue;
      if (spot(x, z, SEED) > 0.045) continue;
      // **湧く所とポータルの前は空ける**
      if (Math.abs(x) < 7 && (z < SPAWN_Z + 10 || z > PORTAL_Z - 12)) continue;
      const base = heightOf(x, z);
      const r = 1 + Math.floor(spot(x, z, SEED + 3) * 2);
      const top = 2 + Math.floor(spot(x, z, SEED + 5) * 3);
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + r) continue;
          const cut = Math.round((1 - (dx * dx + dz * dz) / (r * r + r + 1)) * top);
          if (cut <= 0) continue;
          const v = noise(x + dx, z + dz, 4, SEED + 9);
          const block = v > 0.62 ? "mossy_cobblestone" : v > 0.34 ? "cobblestone" : "andesite";
          ops.push(fill(x + dx, base + 1, z + dz, x + dx, base + cut, z + dz, block));
        }
      }
    }
  }
}

/** 岩の尖り。**遠くから見たときの目印** */
function spires(ops: BuildOp[]): void {
  const at: readonly (readonly [number, number])[] = [
    [-31, -18],
    [26, -25],
    [-24, 21],
    [33, 12],
    [8, 33],
  ];
  for (const [x, z] of at) {
    const base = heightOf(x, z);
    const top = 9 + Math.floor(spot(x, z, SEED + 11) * 6);
    for (let i = 0; i <= top; i++) {
      const r = i > top - 3 ? 0 : 1;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx !== 0 && dz !== 0) continue;
          const block = i > top - 4 ? "dripstone_block" : i % 4 === 0 ? "tuff" : "stone";
          ops.push(set(x + dx, base + i, z + dz, block));
        }
      }
    }
    ops.push(set(x, base + top + 1, z, "lantern"));
  }
}

/** 平らにならす */
function flatten(ops: BuildOp[], cx: number, cz: number, radius: number, y: number, block: string): void {
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      if (dist(x - cx, z - cz) > radius) continue;
      ops.push(fill(x, 6, z, x, y - 1, z, "stone"));
      ops.push(fill(x, y, z, x, y + 6, z, "air"));
      const v = noise(x, z, 5, SEED + 21);
      ops.push(set(x, y, z, v > 0.6 ? "mossy_stone_bricks" : v > 0.3 ? "stone_bricks" : "cracked_stone_bricks"));
    }
  }
}

/** 奥の壇と、そこへ上がる石段 */
function dais(ops: BuildOp[]): void {
  flatten(ops, 0, PORTAL_Z, 9, DAIS, "stone_bricks");
  // ---- 石段（4 段）
  for (let i = 0; i < 4; i++) {
    const z = PORTAL_Z - 10 - i;
    const y = DAIS - 1 - i;
    for (let x = -4; x <= 4; x++) {
      ops.push(fill(x, 6, z, x, y - 1, z, "stone"));
      ops.push(fill(x, y, z, x, y + 5, z, "air"));
      ops.push(set(x, y, z, "stone_bricks"));
    }
  }
  // ---- 壇の縁の柱
  for (const sx of [-8, 8]) {
    for (const dz of [-6, 0, 6]) {
      ops.push(fill(sx, DAIS + 1, PORTAL_Z + dz, sx, DAIS + 4, PORTAL_Z + dz, "cobblestone"));
      ops.push(set(sx, DAIS + 5, PORTAL_Z + dz, "lantern"));
    }
  }
  // ---- ポータル
  for (const dx of [-2, 2]) ops.push(fill(dx, DAIS + 1, PORTAL_Z, dx, DAIS + 5, PORTAL_Z, "stone_bricks"));
  ops.push(fill(-2, DAIS + 6, PORTAL_Z, 2, DAIS + 6, PORTAL_Z, "stone_bricks"));
  ops.push(fill(-1, DAIS + 1, PORTAL_Z, 1, DAIS + 5, PORTAL_Z, "pve_v3:portal"));
}

/** 手前の湧く所 */
function spawnPad(ops: BuildOp[]): void {
  flatten(ops, 0, SPAWN_Z, 7, GROUND, "stone_bricks");
  ops.push(set(0, GROUND + 1, SPAWN_Z, "campfire"));
  for (const sx of [-5, 5]) {
    ops.push(fill(sx, GROUND + 1, SPAWN_Z, sx, GROUND + 3, SPAWN_Z, "cobblestone"));
    ops.push(set(sx, GROUND + 4, SPAWN_Z, "lantern"));
  }
}

/** 湧く所から壇までの道 */
function path(ops: BuildOp[]): void {
  for (let z = SPAWN_Z + 7; z <= PORTAL_Z - 14; z++) {
    const bend = Math.round(Math.sin((z + 40) / 26) * 5);
    for (let dx = -2; dx <= 2; dx++) {
      const x = bend + dx;
      const h = heightOf(x, z);
      if (inRiverAt(x, z)) continue;
      ops.push(set(x, h, z, Math.abs(dx) === 2 ? "coarse_dirt" : "gravel"));
    }
  }
}

/** 空を通す。**マップより外まで抜く** */
function sky(ops: BuildOp[]): void {
  for (let x = -CLEAR; x <= CLEAR; x++) {
    ops.push(fill(x, 1, -CLEAR, x, CLEAR_TOP, CLEAR, "air"));
  }
  // ---- 底。**マップの外に落ちても、真っ暗にならない**
  ops.push(fill(-CLEAR, 0, -CLEAR, CLEAR, 0, CLEAR, "deepslate"));
}

/** 組む手順 */
export function basinOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  sky(ops);
  terrain(ops);
  boulders(ops);
  spires(ops);
  path(ops);
  dais(ops);
  spawnPad(ops);
  ops.push(...detailOps());
  return ops;
}
