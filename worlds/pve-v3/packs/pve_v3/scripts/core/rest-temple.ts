/**
 * 休憩所の中身——**クォーツとガラスの神殿。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 6 章。
 *
 * ```
 *            z ＝ +50   [ ポータル ]（尖塔 2 本）
 *            z ＝ +32   強化 強化 ショップ 強化 強化
 * 円の中心 →  z ＝ +26      ◎ 中央の光
 *            z ＝ +20   宝箱  宝箱  宝箱
 *            z ＝   0   ▲ 立つ所（円の手前の縁・入口の門）
 * ```
 *
 * **床は壁の内側いっぱい**（半径 32）——**外周に穴を空けない**。
 */

import { circlePoints, disc, fill, halfWidth, set, type BuildOp } from "./build.js";
import { spokeBlock } from "./rest-decor.js";
import { HALL_R } from "./rest-shaft.js";

/** 市松の床の半径 */
export const RADIUS = 26;

/** 列柱の半径 */
const COL_R = 24;

/** 外の尖塔の半径 */
const PYLON_R = 29;

/** 列柱の本数 */
const COLUMNS = 16;

/** 入口（手前）と、ポータル（奥）にあたる柱の番号 */
const GATE_FRONT = [11, 12, 13];
const GATE_BACK = [4];

/** 柱の角度（度）。**0 が ＋x、90 が ＋z** */
function columnAngle(i: number): number {
  return (i / COLUMNS) * 360;
}

function columnPos(cz: number, i: number, r: number): { x: number; z: number } {
  const t = (columnAngle(i) * Math.PI) / 180;
  return { x: Math.round(Math.cos(t) * r), z: Math.round(Math.sin(t) * r) + cz };
}

/** 市松の目の大きさ。**1 マスだと細かすぎて、模様に見えない** */
const TILE = 3;

/** 市松の床。**1 マスずつ置く**——帯では市松にならない */
function checker(ops: BuildOp[], cz: number, r: number): void {
  for (let z = -r; z <= r; z++) {
    const wid = halfWidth(r, z);
    for (let x = -wid; x <= wid; x++) {
      const tx = Math.floor((x + 300) / TILE);
      const tz = Math.floor((z + 300) / TILE);
      const even = ((tx + tz) & 1) === 0;
      ops.push(set(x, 0, cz + z, even ? "quartz_block" : "smooth_quartz"));
    }
  }
}

/** 大きな弧の意匠。**色ごとに 1 本** */
interface GreatArch {
  /** 向き（度） */
  readonly deg: number;
  /** 足元の高さ */
  readonly base: number;
  /** 頂点までの高さ */
  readonly rise: number;
  readonly glass: string;
  readonly rib: string;
}

/**
 * **上を横切る大きな弧。**
 *
 * > ### 参考にした絵で、いちばん効いているのはこれ（2026-09-04）
 * >
 * > 円と柱だけでは、**上が寂しい。**
 * > **端から端へ、色のついた弧を渡す**と、見上げたときに絵になる。
 *
 * **左右対称にしない**——向きも色も高さも、1 本ずつ変える。
 */
const GREAT_ARCHES: readonly GreatArch[] = [
  { deg: 20, base: 13, rise: 17, glass: "cyan_stained_glass", rib: "quartz_bricks" },
  { deg: 78, base: 15, rise: 21, glass: "yellow_stained_glass", rib: "chiseled_quartz_block" },
  { deg: 134, base: 12, rise: 15, glass: "purple_stained_glass", rib: "quartz_bricks" },
];

/** 弧が架かる半径。**列柱より外**（柱の頭を越えて渡る） */
const ARCH_R = 30;

/** 大きな弧を 1 本架ける */
function greatArch(ops: BuildOp[], cz: number, a: GreatArch): void {
  const t = (a.deg * Math.PI) / 180;
  const dirX = Math.cos(t);
  const dirZ = Math.sin(t);
  // **厚みを持たせる向き**（水平に直交）
  const perpX = -dirZ;
  const perpZ = dirX;
  const seen = new Set<string>();
  const steps = 480;
  for (let i = 0; i <= steps; i++) {
    const u = -1 + (2 * i) / steps;
    const y = a.base + Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * a.rise);
    for (const off of [-1, 0, 1]) {
      const x = Math.round(dirX * u * ARCH_R + perpX * off);
      const z = Math.round(dirZ * u * ARCH_R + perpZ * off) + cz;
      const key = `${x},${y},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // **真ん中は色ガラス、両脇は骨**
      ops.push(set(x, y, z, off === 0 ? a.glass : a.rib));
    }
  }
  // ---- 足元の台
  for (const sign of [-1, 1]) {
    const x = Math.round(dirX * sign * ARCH_R);
    const z = Math.round(dirZ * sign * ARCH_R) + cz;
    ops.push(fill(x, 0, z, x, a.base - 1, z, "quartz_pillar"));
    ops.push(set(x, a.base - 1, z, "chiseled_quartz_block"));
  }
}

/** 中央から放射状に伸びる筋 */
function spokes(ops: BuildOp[], cz: number, inner: number, outer: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    for (let d = inner; d <= outer; d++) {
      const x = Math.round(Math.cos(t) * d);
      const z = Math.round(Math.sin(t) * d) + cz;
      // **筋は色つきのテラコッタ**（`rest-decor.ts`）
      ops.push(set(x, 0, z, spokeBlock(i)));
    }
  }
}

/** 柱と柱の間に、**丸い迫り**を渡す */
function arch(ops: BuildOp[], cz: number, a0: number, a1: number, yBase: number, rise: number): void {
  const seen = new Set<string>();
  for (let s = 0; s <= 60; s++) {
    const t = s / 60;
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
    const x = Math.round(Math.cos(a) * COL_R);
    const z = Math.round(Math.sin(a) * COL_R) + cz;
    const y = yBase + Math.round(Math.sin(Math.PI * t) * rise);
    const key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ops.push(set(x, y, z, "quartz_bricks"));
    if (y > yBase) ops.push(set(x, y - 1, z, "smooth_quartz"));
  }
}

/** 列柱。**入口とポータルの前は空ける** */
function colonnade(ops: BuildOp[], cz: number): void {
  for (let i = 0; i < COLUMNS; i++) {
    if (GATE_FRONT.includes(i) || GATE_BACK.includes(i)) continue;
    const p = columnPos(cz, i, COL_R);
    ops.push(set(p.x, 0, p.z, "chiseled_quartz_block"));
    ops.push(fill(p.x, 1, p.z, p.x, 11, p.z, "quartz_pillar"));
    ops.push(set(p.x, 12, p.z, "chiseled_quartz_block"));
    ops.push(set(p.x, 13, p.z, "sea_lantern"));

    // ---- 次の柱へ迫りを渡す（**両方が立っているときだけ**）
    const next = (i + 1) % COLUMNS;
    if (GATE_FRONT.includes(next) || GATE_BACK.includes(next)) continue;
    arch(ops, cz, columnAngle(i), columnAngle(next), 12, 3);
  }
}

/** 外に立てる尖塔。**上まで伸ばして、見上げたときの高さを出す** */
function pylons(ops: BuildOp[], cz: number): void {
  const colors = ["light_blue_stained_glass", "pink_stained_glass", "lime_stained_glass", "yellow_stained_glass"];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.round(Math.cos(t) * PYLON_R);
    const z = Math.round(Math.sin(t) * PYLON_R) + cz;
    ops.push(fill(x, 0, z, x, 19, z, "quartz_pillar"));
    ops.push(set(x, 20, z, "chiseled_quartz_block"));
    ops.push(fill(x, 21, z, x, 24, z, colors[i % colors.length] as string));
    ops.push(set(x, 25, z, "sea_lantern"));
  }
}

/** 中央の光。**床には置かない**——歩ける */
function beacon(ops: BuildOp[], cz: number): void {
  disc(ops, cz, 6, 0, "chiseled_quartz_block");
  disc(ops, cz, 3, 0, "sea_lantern");
  ops.push(fill(0, 9, cz, 0, 46, cz, "sea_lantern"));
  for (const d of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const dx = d[0] as number;
    const dz = d[1] as number;
    ops.push(fill(dx, 9, cz + dz, dx, 30, cz + dz, "light_blue_stained_glass"));
  }
}

/** 入口の門（手前）。**広く開ける** */
function frontGate(ops: BuildOp[], cz: number): void {
  const z = cz - COL_R;
  for (const sx of [-6, 6]) {
    ops.push(fill(sx, 0, z, sx, 13, z, "quartz_pillar"));
    ops.push(set(sx, 14, z, "chiseled_quartz_block"));
  }
  ops.push(fill(-6, 14, z, 6, 14, z, "quartz_bricks"));
  ops.push(fill(-5, 15, z, 5, 15, z, "smooth_quartz"));
  for (const sx of [-4, 0, 4]) ops.push(set(sx, 16, z, "sea_lantern"));
}

/** 置き物 */
function fittings(ops: BuildOp[], cz: number): void {
  for (const dx of [-6, 0, 6]) {
    ops.push(set(dx, 0, cz - 6, "chiseled_quartz_block"));
    ops.push(set(dx, 1, cz - 6, "chest"));
    ops.push(set(dx + 2, 1, cz - 6, "end_rod"));
    ops.push(set(dx - 2, 1, cz - 6, "end_rod"));
  }
  const sz = cz + 6;
  ops.push(fill(-12, 0, sz, 12, 0, sz, "quartz_bricks"));
  ops.push(set(0, 1, sz, "enchanting_table"));
  for (const dx of [-10, -5, 5, 10]) {
    ops.push(set(dx, 1, sz, "lodestone"));
    ops.push(set(dx, 2, sz, "end_rod"));
  }
  // **ポータルは門として別に建てる**（`core/rest-gate.ts`）
}

/** 神殿の中身 */
export function templeOps(cz: number): BuildOp[] {
  const ops: BuildOp[] = [];
  // ---- 床は**壁の内側いっぱい**。外周に穴を作らない
  // **すり鉢の底いっぱいまで敷く**——足りないと、縁に地の色が残る
  disc(ops, cz, HALL_R + 2, 0, "smooth_quartz");
  for (const p of circlePoints(cz, HALL_R - 1)) ops.push(set(p.x, 0, p.z, "quartz_bricks"));
  disc(ops, cz, RADIUS + 1, 0, "quartz_bricks");
  checker(ops, cz, RADIUS);
  spokes(ops, cz, 7, RADIUS - 1, 16);
  beacon(ops, cz);
  colonnade(ops, cz);
  for (const a of GREAT_ARCHES) greatArch(ops, cz, a);
  pylons(ops, cz);
  frontGate(ops, cz);
  fittings(ops, cz);
  ops.push(fill(-2, 0, 0, 2, 0, 6, "quartz_bricks"));
  disc(ops, 0, 4, 0, "smooth_quartz");
  return ops;
}
