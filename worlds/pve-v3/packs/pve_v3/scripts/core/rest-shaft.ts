/**
 * 休憩所の外殻。
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 6 章。
 *
 * > ### 壁で囲まない（2026-09-04 決定）
 * >
 * > **高い壁を回すと、井戸の底に居るように見える。**
 * > **太い柱を数本立てて、その間をガラスで塞ぐ**——参考にした絵もそうだった。
 *
 * > ### 埋め戻しは、すり鉢の斜面にする
 * >
 * > **床が y ＝ 0 で地表が 60 マス上**。垂直に立てれば、それは壁でしかない。
 * > **外へ向かって段々に上がる斜面**にすれば、囲いではなく観客席に見える。
 *
 * ```
 *                                      ┌── 地表（y ＝ 60）
 *                              ┌───────┘
 *                      ┌───────┘          すり鉢（r 42 → 66）
 *   ‖ ‖   ‖ ‖  ┌───────┘                  ‖ ＝ 太い柱（r 33・高さ 17）
 *   ───────────────────────────────────   y ＝ 0
 * ```
 */

import { circlePoints, cylinder, fill, set, type BuildOp } from "./build.js";

/** 床の半径。**柱より外に、少し余白を取る** */
export const HALL_R = 40;

/** 太い柱の半径 */
const COL_R = 33;

/** 太い柱の本数。**数本でよい** */
const COL_COUNT = 8;

/** 太い柱の太さ（半分） */
const COL_HALF = 1;

/** 太い柱の高さ */
const COL_TOP = 17;

/** すり鉢の内端・外端 */
const BOWL_IN = 42;
const BOWL_OUT = 54;

/**
 * すり鉢の外の高さ。
 *
 * > ### **y ＝ 11 より上に、外の囲いを残さない**（2026-09-04 決定）
 * >
 * > **地表（60 前後）まで斜面を上げると、結局それが壁になる。**
 * > **11 で止めて、その上は全部空にする**——どちらを向いても空が見える。
 */
const BOWL_TOP = 11;

/** すり鉢の段数 */
const BOWL_STEPS = 4;

/** 更地にする半径。**この外は元の地形のまま** */
const WIPE_R = 80;

/** 更地にする上端 */
const WIPE_TOP = 120;

/**
 * 埋め戻しの素材。
 *
 * > ### 石で埋めない（2026-09-04 決定）
 * >
 * > **石で埋め戻していたら、外から生の石の山として見えた。**
 * > **神殿と同じ石材で埋める。** 見えても土台にしか見えない。
 */
const FILL = "smooth_quartz";

/** 段の縁の素材。**段ごとに変えて、のっぺりさせない** */
const EDGES: readonly string[] = [
  "quartz_bricks",
  "light_gray_terracotta",
  "white_terracotta",
  "cyan_terracotta",
  "hardened_clay",
];

/** 柱の足元・ガラスの上下に使う縁 */
const EDGE = "quartz_bricks";

/** 柱の間に張るガラス。**1 枚ずつ色を変える** */
const PANE_COLORS: readonly string[] = [
  "light_blue_stained_glass",
  "cyan_stained_glass",
  "lime_stained_glass",
  "yellow_stained_glass",
  "orange_stained_glass",
  "pink_stained_glass",
  "purple_stained_glass",
  "white_stained_glass",
];

/** 柱 k 本目の角度（度）。**入口（270°）とポータル（90°）を柱で塞がない** */
function pillarAngle(k: number): number {
  return 22.5 + (k * 360) / COL_COUNT;
}

/** ガラス 1 枚ぶんの中心角。**入口とポータルの正面は開ける** */
function paneOpen(k: number): boolean {
  const mid = pillarAngle(k) + 180 / COL_COUNT;
  const a = ((mid % 360) + 360) % 360;
  return !(Math.abs(a - 90) < 12 || Math.abs(a - 270) < 12);
}

/** 前に建てたものを消して、すり鉢を作る */
function bowl(ops: BuildOp[], cz: number): void {
  // ---- いったん y ＝ 11 まで埋める（**前の版が何であっても同じ形になる**）
  cylinder(ops, cz, WIPE_R, 1, BOWL_TOP, FILL);
  // ---- その上は全部空。**外の囲いを残さない**
  cylinder(ops, cz, WIPE_R, BOWL_TOP + 1, WIPE_TOP, "air");
  // ---- 段ごとに抜いて、すり鉢にする
  for (let k = 0; k <= BOWL_STEPS; k++) {
    const r = Math.round(BOWL_IN + ((BOWL_OUT - BOWL_IN) * k) / BOWL_STEPS);
    const g = Math.round((BOWL_TOP * k) / BOWL_STEPS);
    cylinder(ops, cz, r, g + 1, BOWL_TOP, "air");
    // 段の縁に帯を入れて、のっぺりさせない
    const edge = EDGES[k % EDGES.length] ?? EDGE;
    for (const p of circlePoints(cz, r)) ops.push(set(p.x, g, p.z, edge));
  }
  // ---- 床（すり鉢の底）
  cylinder(ops, cz, BOWL_IN, 0, 0, FILL);
}

/** 太い柱と、その間のガラス */
function pillars(ops: BuildOp[], cz: number): void {
  for (let k = 0; k < COL_COUNT; k++) {
    const t = (pillarAngle(k) * Math.PI) / 180;
    const x = Math.round(Math.cos(t) * COL_R);
    const z = Math.round(Math.sin(t) * COL_R) + cz;
    // ---- 3 × 3 の太い柱
    for (let dx = -COL_HALF; dx <= COL_HALF; dx++) {
      for (let dz = -COL_HALF; dz <= COL_HALF; dz++) {
        const edge = Math.abs(dx) === COL_HALF || Math.abs(dz) === COL_HALF;
        ops.push(fill(x + dx, 1, z + dz, x + dx, COL_TOP, z + dz, edge ? "quartz_pillar" : "smooth_quartz"));
        ops.push(set(x + dx, 0, z + dz, "chiseled_quartz_block"));
        ops.push(set(x + dx, COL_TOP + 1, z + dz, "chiseled_quartz_block"));
      }
    }
    ops.push(set(x, COL_TOP + 2, z, "sea_lantern"));

    // ---- 次の柱までガラスを張る
    if (!paneOpen(k)) continue;
    const color = PANE_COLORS[k % PANE_COLORS.length] ?? "white_stained_glass";
    const a0 = pillarAngle(k);
    const a1 = pillarAngle(k + 1);
    const seen = new Set<string>();
    for (let s = 0; s <= 240; s++) {
      const a = ((a0 + ((a1 - a0) * s) / 240) * Math.PI) / 180;
      const px = Math.round(Math.cos(a) * COL_R);
      const pz = Math.round(Math.sin(a) * COL_R) + cz;
      const key = `${px},${pz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.abs(px - x) <= COL_HALF && Math.abs(pz - z) <= COL_HALF) continue;
      ops.push(fill(px, 1, pz, px, COL_TOP, pz, color));
      ops.push(set(px, 0, pz, EDGE));
      ops.push(set(px, COL_TOP + 1, pz, EDGE));
    }
  }
}

/** 外殻を作る */
export function shaftOps(cz: number): BuildOp[] {
  const ops: BuildOp[] = [];
  bowl(ops, cz);
  pillars(ops, cz);
  return ops;
}
