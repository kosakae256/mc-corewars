/**
 * 休憩所の門。**ポータルはここ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 6 章。
 *
 * > ### 枠を組んだだけでは、門に見えない（2026-09-04 に建て直し）
 * >
 * > **黒曜石の枠に柱を 2 本添えただけ**だったので、締まらなかった。
 * > **塔・迫り・段・破風**——**門らしい部品を、ひとつずつ足す。**
 *
 * ```
 *          ▲ 尖り（y 24）
 *      ╭───────────╮        迫り（y 15〜20）
 *      ║           ║        塔 3 × 3（x ＝ ±6・y 1〜22）
 *      ║  ▒▒▒▒▒   ║        破風（色ガラス・y 9〜13）
 *      ║   ███    ║        ポータル（3 × 5）
 *   ───┴───────────┴───    壇（y ＝ 1）と段
 * ```
 *
 * **場所は外の柱の切れ目**（半径 33・ポータル側）——
 * **囲いを抜ける所が、そのまま門になる。**
 */

import { fill, set, type BuildOp } from "./build.js";

/** 門を建てる半径。**外の柱と同じ輪の上** */
export const GATE_R = 33;

/** 塔の中心（x） */
const TOWER_X = 6;

/** 塔の高さ */
const TOWER_TOP = 22;

/** 迫りの足元と、盛り上がり */
const ARCH_BASE = 15;
const ARCH_RISE = 5;

/** 破風のガラス。**左右で色を変える** */
const PANE_LEFT = "cyan_stained_glass";
const PANE_RIGHT = "purple_stained_glass";
const PANE_MID = "white_stained_glass";

/** 壇と段 */
function plinth(ops: BuildOp[], z: number): void {
  // ---- 壇（門の足元をひと回り高くする）
  ops.push(fill(-9, 1, z - 3, 9, 1, z + 3, "quartz_bricks"));
  ops.push(fill(-7, 1, z - 4, 7, 1, z + 4, "quartz_bricks"));
  // ---- 上がる段
  ops.push(fill(-5, 1, z - 5, 5, 1, z - 5, "chiseled_quartz_block"));
  // ---- 縁取り
  for (const dx of [-9, 9]) ops.push(fill(dx, 2, z - 3, dx, 2, z + 3, "light_gray_terracotta"));
}

/** 塔 1 本（3 × 3） */
function tower(ops: BuildOp[], cx: number, z: number): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const edge = dx !== 0 || dz !== 0;
      ops.push(fill(cx + dx, 2, z + dz, cx + dx, TOWER_TOP, z + dz, edge ? "quartz_pillar" : "smooth_quartz"));
    }
  }
  // ---- 沓と冠
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      ops.push(set(cx + dx, 2, z + dz, "cyan_terracotta"));
    }
  }
  ops.push(fill(cx - 1, TOWER_TOP + 1, z - 1, cx + 1, TOWER_TOP + 1, z + 1, "chiseled_quartz_block"));
  // ---- 尖り
  ops.push(fill(cx, TOWER_TOP + 2, z, cx, TOWER_TOP + 3, z, "quartz_pillar"));
  ops.push(set(cx, TOWER_TOP + 4, z, "sea_lantern"));
  ops.push(set(cx, TOWER_TOP + 5, z, "end_rod"));
  // ---- 縦の明かり
  for (let y = 5; y <= TOWER_TOP - 3; y += 5) {
    ops.push(set(cx, y, z - 2, "sea_lantern"));
    ops.push(set(cx, y, z + 2, "sea_lantern"));
  }
}

/** 塔と塔を繋ぐ迫り */
function archway(ops: BuildOp[], z: number): void {
  for (let x = -TOWER_X; x <= TOWER_X; x++) {
    const t = x / TOWER_X;
    const y = ARCH_BASE + Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * ARCH_RISE);
    ops.push(fill(x, y, z, x, y + 1, z, "quartz_bricks"));
    ops.push(set(x, y + 2, z, "chiseled_quartz_block"));
    // **迫りの下を、少しだけ埋めて厚みを出す**
    if (Math.abs(x) >= TOWER_X - 1) ops.push(fill(x, ARCH_BASE, z, x, y - 1, z, "smooth_quartz"));
  }
}

/** 門の面（ポータルと破風） */
function face(ops: BuildOp[], z: number): void {
  // ---- 面の下地
  ops.push(fill(-5, 2, z, 5, ARCH_BASE - 1, z, "smooth_quartz"));

  // ---- ポータルの口（3 × 5）
  ops.push(fill(-2, 2, z, -2, 8, z, "chiseled_quartz_block"));
  ops.push(fill(2, 2, z, 2, 8, z, "chiseled_quartz_block"));
  ops.push(fill(-2, 8, z, 2, 8, z, "chiseled_quartz_block"));
  ops.push(fill(-1, 2, z, 1, 7, z, "pve_v3:portal"));

  // ---- 破風（色ガラス）
  for (let x = -4; x <= 4; x++) {
    const top = 13 - Math.round((Math.abs(x) / 4) * 3);
    const color = x < -1 ? PANE_LEFT : x > 1 ? PANE_RIGHT : PANE_MID;
    ops.push(fill(x, 10, z, x, top, z, color));
  }
  ops.push(fill(-5, 9, z, 5, 9, z, "quartz_bricks"));
  ops.push(fill(-5, 14, z, 5, 14, z, "quartz_bricks"));

  // ---- 足元の明かり
  for (const dx of [-4, 4]) {
    ops.push(set(dx, 2, z - 1, "end_rod"));
    ops.push(set(dx, 2, z + 1, "end_rod"));
  }
}

/** 門を建てる */
export function gateOps(cz: number): BuildOp[] {
  const ops: BuildOp[] = [];
  const z = cz + GATE_R;
  plinth(ops, z);
  face(ops, z);
  archway(ops, z);
  for (const sx of [-1, 1]) tower(ops, sx * TOWER_X, z);
  return ops;
}
