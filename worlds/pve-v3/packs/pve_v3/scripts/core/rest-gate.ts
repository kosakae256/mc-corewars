/**
 * 休憩所の**入口の門**——クォーツの大アーチと尖塔 2 本。
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 6 章。
 *
 * ```
 *        ▲ ▲          尖塔（x ＝ ±6）
 *      ╭─────╮        アーチ
 *      │ ▓▓▓ │        ステンドグラス
 *      │  ▉  │        ポータル（飾り）
 *      ╰─────╯
 * ```
 *
 * **次の相手を選ぶ 3 つの門はこれではない**（`core/gate-choice.ts`）。
 */

import { fill, set, type BuildOp } from "./build.js";

/** 中心からの距離 */
const GATE_R = 33;

/** 尖塔の x */
const TOWER_X = 6;

/** 尖塔の高さ */
const TOWER_TOP = 22;

/** アーチの足元と、盛り上がり */
const ARCH_BASE = 15;
const ARCH_RISE = 5;

/** ステンドグラスの色 */
const PANE_LEFT = "cyan_stained_glass";
const PANE_RIGHT = "purple_stained_glass";
const PANE_MID = "white_stained_glass";

/** 土台 */
function plinth(ops: BuildOp[], z: number): void {
  ops.push(fill(-9, 1, z - 3, 9, 1, z + 3, "quartz_bricks"));
  ops.push(fill(-7, 1, z - 4, 7, 1, z + 4, "quartz_bricks"));
  ops.push(fill(-5, 1, z - 5, 5, 1, z - 5, "chiseled_quartz_block"));
  for (const dx of [-9, 9]) ops.push(fill(dx, 2, z - 3, dx, 2, z + 3, "light_gray_terracotta"));
}

/** 尖塔 1 本 */
function tower(ops: BuildOp[], cx: number, z: number): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const edge = dx !== 0 || dz !== 0;
      ops.push(fill(cx + dx, 2, z + dz, cx + dx, TOWER_TOP, z + dz, edge ? "quartz_pillar" : "smooth_quartz"));
    }
  }
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      ops.push(set(cx + dx, 2, z + dz, "cyan_terracotta"));
    }
  }
  ops.push(fill(cx - 1, TOWER_TOP + 1, z - 1, cx + 1, TOWER_TOP + 1, z + 1, "chiseled_quartz_block"));
  ops.push(fill(cx, TOWER_TOP + 2, z, cx, TOWER_TOP + 3, z, "quartz_pillar"));
  ops.push(set(cx, TOWER_TOP + 4, z, "sea_lantern"));
  ops.push(set(cx, TOWER_TOP + 5, z, "end_rod"));
  for (let y = 5; y <= TOWER_TOP - 3; y += 5) {
    ops.push(set(cx, y, z - 2, "sea_lantern"));
    ops.push(set(cx, y, z + 2, "sea_lantern"));
  }
}

/** アーチ */
function archway(ops: BuildOp[], z: number): void {
  for (let x = -TOWER_X; x <= TOWER_X; x++) {
    const t = x / TOWER_X;
    const y = ARCH_BASE + Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * ARCH_RISE);
    ops.push(fill(x, y, z, x, y + 1, z, "quartz_bricks"));
    ops.push(set(x, y + 2, z, "chiseled_quartz_block"));
    if (Math.abs(x) >= TOWER_X - 1) ops.push(fill(x, ARCH_BASE, z, x, y - 1, z, "smooth_quartz"));
  }
}

/** 正面——ポータル（飾り）とステンドグラス */
function face(ops: BuildOp[], z: number): void {
  ops.push(fill(-5, 2, z, 5, ARCH_BASE - 1, z, "smooth_quartz"));
  ops.push(fill(-2, 2, z, -2, 8, z, "chiseled_quartz_block"));
  ops.push(fill(2, 2, z, 2, 8, z, "chiseled_quartz_block"));
  ops.push(fill(-2, 8, z, 2, 8, z, "chiseled_quartz_block"));
  ops.push(fill(-1, 2, z, 1, 7, z, "pve_v3:portal"));
  for (let x = -4; x <= 4; x++) {
    const top = 13 - Math.round((Math.abs(x) / 4) * 3);
    const color = x < -1 ? PANE_LEFT : x > 1 ? PANE_RIGHT : PANE_MID;
    ops.push(fill(x, 10, z, x, top, z, color));
  }
  ops.push(fill(-5, 9, z, 5, 9, z, "quartz_bricks"));
  ops.push(fill(-5, 14, z, 5, 14, z, "quartz_bricks"));
  for (const dx of [-4, 4]) {
    ops.push(set(dx, 2, z - 1, "end_rod"));
    ops.push(set(dx, 2, z + 1, "end_rod"));
  }
}

/** 入口の門を組む手順 */
export function gateOps(cz: number): BuildOp[] {
  const ops: BuildOp[] = [];
  const z = cz + GATE_R;
  plinth(ops, z);
  face(ops, z);
  archway(ops, z);
  for (const sx of [-1, 1]) tower(ops, sx * TOWER_X, z);
  return ops;
}
