/**
 * 15. 地下墓所——**沈んだ中央の墓室。** 円堂・天蓋・大石棺。
 *
 * 間取りは `map-crypt-plan.ts`、材は `map-crypt-mat.ts`、造作は `map-crypt-fit.ts`。
 *
 * ```
 *            ┌── 丸天井（縁 9 → 中央 12）──┐
 *   ‖  ‖     │      天蓋（梁 y ＝ 7）      │     ‖  ‖   ← 輪の柱 8 本
 *   ────────┤  壇（y ＝ 0）＋ 大石棺       ├────────
 *            └── 床 y ＝ −1。**1 段だけ沈む**（敵も降りて登れる）
 * ```
 *
 * > ### **1 段しか沈めない**
 * >
 * > **2 マス落とすと、敵が上がれない安全地帯になる**（0-8）。
 * > **段差 1 マス**なら、下りても囲まれる。
 *
 * > ### **天蓋の梁は y ＝ 7 に架ける**
 * >
 * > 0-3 の線は、この辺りで **y ＝ 3〜5** を通る（`map-crypt-plan.ts`）。
 * > **梁を 7 に上げれば、線の上を跨げる**——道も視線も断たない。
 */

import { fill, set, type BuildOp } from "./build.js";
import { smoothWave } from "./map-frame.js";
import { ROT, ROT_FLOOR, SEED, ceilAt, isOpen } from "./map-crypt-plan.js";
import { INLAY, pillarAt, stoneAt } from "./map-crypt-mat.js";
import { cobweb, coffin, hang, niche, pick, stand } from "./map-crypt-fit.js";

/** 天蓋の梁の段。**0-3 の線（y ＝ 3〜5）より上** */
const CANOPY = 7;

/** 輪の柱。**45 度ずつだが、22.5 度ずらして x ＝ 0 を外してある**（0-3 の線） */
const RING: readonly (readonly [number, number])[] = [
  [10, -1],
  [4, 5],
  [-4, 5],
  [-10, -1],
  [-10, -9],
  [-4, -15],
  [4, -15],
  [10, -9],
];

/** 円堂ぜんぶ。**副作用: `ops` に手順を足す。** */
export function rotundaOps(ops: BuildOp[]): void {
  seepage(ops);
  domeRibs(ops);
  ringColumns(ops);
  canopy(ops);
  greatTomb(ops);
  rimNiches(ops);
  rotWebs(ops);
}

/**
 * 染みと水溜まり。**低い所に水が溜まり、その周りが苔むす。**
 *
 * **一様に撒かない**（0-7）——**溜まりの縁ほど濃い。**
 */
function seepage(ops: BuildOp[]): void {
  for (let x = -13; x <= 13; x++) {
    for (let z = -18; z <= 8; z++) {
      if (!isOpen(x, z) || ceilAt(x, z) < 9) continue;
      const d = Math.hypot(x - ROT.x, z - ROT.z);
      if (d < 5.5 || d > 12.5) continue;
      // > ### **溜まりは、まとまった形にする**
      // >
      // > **1 マスごとに引くと、水と苔が胡麻塩に散って沼に見えた**（2026-09-06 に絵で見つけた）。
      // > **`smoothWave` で塊にする**——縁が苔、真ん中が水になる。
      const w = smoothWave(SEED + 211, x, z, 7);
      // ---- 溜まり。**深さ 1**。跨げるし、落ちても上がれる
      if (w > 0.44) {
        ops.push(set(x, ROT_FLOOR - 1, z, "cobbled_deepslate"));
        ops.push(set(x, ROT_FLOOR, z, "water"));
        continue;
      }
      if (w > 0.3) ops.push(set(x, ROT_FLOOR, z, "mossy_cobblestone"));
      else if (w > 0.24 && pick(109, x, 2, z) < 0.3) ops.push(set(x, ROT_FLOOR + 1, z, "moss_carpet"));
    }
  }
}

/**
 * 丸天井の稜。**輪の柱から頂へ、放射に 8 本走らせる。**
 *
 * > ### **丸天井は、彫っただけでは丸く見えない**（2026-09-06 に絵で見つけた）
 * >
 * > 段で刻んであっても、**同じ灰色だと平らな天井にしか見えない。**
 * > **稜だけ明るい石にする**と、はじめて丸みが読める。
 */
function domeRibs(ops: BuildOp[]): void {
  for (const [px, pz] of RING) {
    const a = Math.atan2(pz - ROT.z, px - ROT.x);
    for (let r = 12; r >= 1; r -= 0.6) {
      const x = Math.round(ROT.x + Math.cos(a) * r);
      const z = Math.round(ROT.z + Math.sin(a) * r);
      if (!isOpen(x, z)) continue;
      ops.push(set(x, ceilAt(x, z), z, "polished_basalt"));
    }
  }
  // ---- 頂の冠。**上から降る火**——沈んだ墓室でいちばん高い所を光らせる
  for (const [dx, dz] of [
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ]) {
    const x = ROT.x + dx;
    const z = ROT.z + dz;
    if (isOpen(x, z)) ops.push(set(x, ceilAt(x, z), z, "glowstone"));
  }
}

/** 輪の柱 8 本。**丸天井の縁を受ける** */
function ringColumns(ops: BuildOp[]): void {
  for (const [x, z] of RING) {
    if (!isOpen(x, z)) continue;
    const top = ceilAt(x, z) - 1;
    ops.push(fill(x, ROT_FLOOR + 1, z, x, top, z, "polished_deepslate"));
    for (let y = ROT_FLOOR + 1; y <= top; y++) {
      const b = pillarAt(x, y, z);
      if (b !== "polished_deepslate") ops.push(set(x, y, z, b));
    }
    ops.push(set(x, ROT_FLOOR + 1, z, "chiseled_deepslate"));
    ops.push(set(x, top, z, "chiseled_deepslate"));
    ops.push(set(x, top - 3, z, "chiseled_deepslate"));
    // ---- 柱に埋める灯り。**出っ張らせない**
    ops.push(set(x, ROT_FLOOR + 5, z, pick(113, x, 5, z) < 0.5 ? "glowstone" : "soul_lantern"));
  }
}

/**
 * 天蓋。**4 本の柱に梁を架けて、大石棺の上を覆う。**
 *
 * **梁は y ＝ 7**（`CANOPY`）——0-3 の線の上を跨ぐ。
 */
function canopy(ops: BuildOp[]): void {
  const xs = [-5, 5];
  const zs = [-10, 0];
  for (const x of xs) {
    for (const z of zs) {
      ops.push(fill(x, ROT_FLOOR + 1, z, x, CANOPY - 1, z, "polished_basalt"));
      for (let y = ROT_FLOOR + 2; y < CANOPY - 1; y++) {
        const b = pillarAt(x, y, z);
        if (b !== "polished_basalt") ops.push(set(x, y, z, b));
      }
      ops.push(set(x, ROT_FLOOR + 1, z, "chiseled_deepslate"));
      ops.push(set(x, CANOPY - 1, z, "chiseled_deepslate"));
      ops.push(set(x, CANOPY + 1, z, "chiseled_deepslate"));
      stand(ops, x, ROT_FLOOR + 1, z + (z === -10 ? -1 : 1), 2, "soul_lantern");
    }
  }
  // ---- 梁。**四方に回す**（要石を落とさないので、下は通り抜けられる）
  for (const z of zs) ops.push(fill(-5, CANOPY, z, 5, CANOPY, z, "chiseled_deepslate"));
  for (const x of xs) ops.push(fill(x, CANOPY, -10, x, CANOPY, 0, "chiseled_deepslate"));
  // ---- 天蓋の中央から吊る灯り。**墓室でいちばん明るい所にする**
  hang(ops, 0, -5, ceilAt(0, -5), 3, "lantern");
  for (const [x, z] of [
    [-3, -5],
    [3, -5],
  ]) {
    hang(ops, x, z, ceilAt(x, z), 2, "soul_lantern");
  }
}

/**
 * 壇と大石棺。
 *
 * **高さは y ＝ 2 まで**——0-3 の線（この辺りで y ＝ 4）に触れない。
 */
function greatTomb(ops: BuildOp[]): void {
  ops.push(fill(-3, ROT_FLOOR + 1, -9, 3, ROT_FLOOR + 1, -1, "polished_deepslate"));
  // ---- 壇の縁。**白く縁取る**——暗い中で、ここが中心だと分かる
  for (let x = -3; x <= 3; x++) {
    for (let z = -9; z <= -1; z++) {
      if (Math.abs(x) !== 3 && z !== -9 && z !== -1) continue;
      ops.push(set(x, ROT_FLOOR + 1, z, INLAY));
    }
  }
  // ---- 大石棺。**蓋を 1 マスずらして、中を見せる**
  ops.push(fill(-1, ROT_FLOOR + 2, -7, 1, ROT_FLOOR + 2, -3, "chiseled_deepslate"));
  ops.push(fill(-1, ROT_FLOOR + 3, -6, 1, ROT_FLOOR + 3, -3, INLAY));
  ops.push(set(0, ROT_FLOOR + 3, -7, "skeleton_skull"));
  // ---- 四隅の低い柱。**壇の角を締める**
  for (const [x, z] of [
    [-3, -9],
    [3, -9],
    [-3, -1],
    [3, -1],
  ]) {
    ops.push(fill(x, ROT_FLOOR + 2, z, x, ROT_FLOOR + 3, z, "chiseled_deepslate"));
    // **手前の 2 本は黄、奥の 2 本は青**——大石棺を、二色の火で挟む
    ops.push(set(x, ROT_FLOOR + 4, z, z === -1 ? "lantern" : "soul_lantern"));
  }
}

/**
 * 円堂の縁の壁龕。**輪の柱と柱の間に棺を納める。**
 *
 * **2 マス目が岩であることを確かめてから彫る**——抜けると隣へ穴が開く。
 */
function rimNiches(ops: BuildOp[]): void {
  for (let a = 0; a < 360; a += 9) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(Math.cos(rad) * 14);
    const z = ROT.z + Math.round(Math.sin(rad) * 14);
    if (isOpen(x, z)) continue;
    const nx = x + Math.sign(Math.round(Math.cos(rad) * 2));
    const nz = z - ROT.z === 0 ? z : z + Math.sign(Math.round(Math.sin(rad) * 2));
    if (isOpen(nx, nz)) continue;
    if (!isOpen(x - Math.sign(x || 1), z)) continue;
    niche(ops, x, ROT_FLOOR + 1, z, 2, 127);
  }
  // ---- 縁に沿って並ぶ棺。**円堂は葬るための部屋だと分かるように**
  for (const [x, z] of [
    [-8, -14],
    [8, -14],
    [-8, 3],
    [8, 3],
    [-12, -5],
    [12, -5],
  ]) {
    if (!isOpen(x, z)) continue;
    coffin(ops, x, ROT_FLOOR + 1, z, "z", 3, 131);
  }
}

/** 丸天井の隅の巣と、壁の染み */
function rotWebs(ops: BuildOp[]): void {
  for (const [x, z] of [
    [-9, -12],
    [9, 2],
    [-11, -3],
    [7, -15],
  ]) {
    if (!isOpen(x, z)) continue;
    cobweb(ops, x, ceilAt(x, z) - 1, z);
  }
  for (let a = 0; a < 360; a += 6) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(Math.cos(rad) * 14);
    const z = ROT.z + Math.round(Math.sin(rad) * 14);
    if (isOpen(x, z)) continue;
    for (let y = ROT_FLOOR; y <= ROT_FLOOR + 3; y++) {
      if (pick(137, x, y, z) > 0.34) continue;
      ops.push(set(x, y, z, stoneAt(x, y, z)));
    }
  }
}
