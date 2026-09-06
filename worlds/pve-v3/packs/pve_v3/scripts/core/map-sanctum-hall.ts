/**
 * 17「白の神殿」の**列柱と屋根。純粋。**
 *
 * ```
 *   y ＝ 22  ▲ 柱頭のシーランタン
 *   y ＝20〜22 折れた迫りの起こし（身廊へ 2 マスだけ突き出す）
 *   y ＝  18 高窓の天端 ─┐
 *   y ＝12〜17 ステンドグラスの高窓  └ 屋根（17 → 11 の片流れ）
 *   y ＝ 1〜8 迫りの抜け（身廊と側廊が行き来できる）
 * ```
 *
 * > ### **天面は「登れる」か「3 マス以下」のどちらか**（0-8）
 * >
 * > 検査は**辿り着けない天面が 4 マス以上まとまっている**と落とす。
 * > **高さの差ではなく、まとまりの広さを見ている。**
 * >
 * > | | どう逃げたか |
 * > | --- | --- |
 * > | 屋根・胸壁・高窓 | **傾きを 2 マスに 1 マスに抑えて、外の大階段から登れるようにした** |
 * > | 柱＋折れた迫り | **3 マスで止める**（柱 1 ＋ 起こし 2） |
 * > | 高窓 | **屋根から 1 マス**なので、天面として取り残されない |
 *
 * > ### 身廊を跨ぐ迫りは渡さない
 * >
 * > 渡すと**天端が長い帯**になって取り残される。
 * > **起こしだけ残して落とす**——崩れた神殿として正しく、決まりも満たす。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND } from "./map-frame.js";
import { glassOf, roofTile } from "./map-sanctum-mat.js";
import {
  AISLE_IN,
  AISLE_OUT,
  BACK_Z,
  CLERESTORY_TOP,
  FRONT_Z,
  hasSpringer,
  isBrokenPier,
  isGlazedBay,
  isPier,
  PIER_X,
  roofY,
  STAIR_STEPS,
  STAIRS,
  WALL_X,
} from "./map-sanctum-plan.js";

/** 柱頭の高さ（灯りを載せる段） */
const PIER_TOP = 21;

/** 柱 1 本。**折れているものを混ぜる**（戦場なので手入れされていない） */
function pillar(ops: BuildOp[], x: number, z: number, broken: boolean): void {
  if (broken) {
    const top = 6 + ((Math.abs(z) * 7) % 6);
    ops.push(fill(x, GROUND + 1, z, x, GROUND + top, z, "quartz_pillar"));
    ops.push(set(x, GROUND + top, z, "calcite"));
    return;
  }
  ops.push(fill(x, GROUND + 1, z, x, GROUND + PIER_TOP - 1, z, "quartz_pillar"));
  ops.push(set(x, GROUND + 4, z, "calcite"));
  ops.push(set(x, GROUND + 9, z, "chiseled_quartz_block"));
  ops.push(set(x, GROUND + CLERESTORY_TOP, z, "chiseled_quartz_block"));
  ops.push(set(x, GROUND + PIER_TOP, z, "chiseled_quartz_block"));
  ops.push(set(x, GROUND + PIER_TOP + 1, z, "sea_lantern"));
}

/** 折れた迫りの起こし。**身廊へ 2 マスだけ**（3 マス以上は 0-8 に落ちる） */
function springer(ops: BuildOp[], side: number, z: number): void {
  const x = side * (PIER_X - 1);
  ops.push(fill(x, GROUND + PIER_TOP - 1, z, x, GROUND + PIER_TOP + 1, z, "quartz_bricks"));
  ops.push(fill(x - side, GROUND + PIER_TOP - 1, z, x - side, GROUND + PIER_TOP, z, "smooth_quartz"));
}

/**
 * 柱間 1 マスぶん。**下は側廊への抜け、上は高窓の壁。**
 *
 * **屋根（x ＝ ±13 で y ＝ 17）から 1 マス**なので、
 * **高窓の天端も歩いて行ける**——3 マス制限を気にせず、窓を並べられる。
 */
function bay(ops: BuildOp[], side: number, z: number, glazed: boolean, nearPier: boolean): void {
  const x = side * PIER_X;
  if (nearPier) ops.push(set(x, GROUND + 8, z, "smooth_quartz"));
  ops.push(set(x, GROUND + 9, z, "quartz_bricks"));
  ops.push(fill(x, GROUND + 10, z, x, GROUND + CLERESTORY_TOP - 1, z, "quartz_bricks"));
  ops.push(set(x, GROUND + 11, z, "calcite"));
  ops.push(set(x, GROUND + CLERESTORY_TOP, z, "chiseled_quartz_block"));
  if (!glazed) return;
  for (let y = 12; y <= CLERESTORY_TOP - 1; y++) ops.push(set(x, GROUND + y, z, glassOf(37, side * 5, z)));
}

/** 身廊の両側に立つ柱列 */
function colonnade(ops: BuildOp[]): void {
  for (const side of [-1, 1]) {
    for (let z = FRONT_Z + 1; z < BACK_Z; z++) {
      const x = side * PIER_X;
      // **後陣の弦（z ＝ 36）には柱を立てない**——半円の起こしと高さを揃える（0-8）
      if (!isPier(z) || z === BACK_Z - 1) {
        bay(ops, side, z, isGlazedBay(side, z), isPier(z - 1) || isPier(z + 1));
        continue;
      }
      const broken = isBrokenPier(side, z);
      pillar(ops, x, z, broken);
      if (!broken && hasSpringer(side, z)) springer(ops, side, z);
    }
  }
}

/**
 * 側廊の片流れ屋根。**下から見上げれば側廊の天井。**
 *
 * **軒（外壁側）が低く、身廊側が高い**——本来の会堂の断面。
 * **2 マスに 1 マスしか上がらない**ので、そのまま歩いて登れる（0-8）。
 */
function roof(ops: BuildOp[]): void {
  for (const side of [-1, 1]) {
    for (let z = FRONT_Z + 1; z < BACK_Z; z++) {
      for (let x = AISLE_IN; x <= AISLE_OUT; x++) {
        ops.push(set(side * x, GROUND + roofY(x), z, roofTile(side * x, z)));
      }
      // ---- 天井から吊る灯り。**まばらに**（0-6）
      if ((z + (side > 0 ? 0 : 3)) % 7 !== 0) continue;
      const lx = AISLE_IN + 5;
      ops.push(set(side * lx, GROUND + roofY(lx) - 1, z, "iron_chain"));
      ops.push(set(side * lx, GROUND + roofY(lx) - 2, z, "lantern"));
    }
  }
}

/** 屋根に立てる燈明。**1 マス角**——間を空けて、天面が繋がらないようにする */
function lamps(ops: BuildOp[]): void {
  for (const side of [-1, 1]) {
    for (let z = FRONT_Z + 4; z < BACK_Z; z += 6) {
      const x = AISLE_OUT - 2;
      ops.push(set(side * x, GROUND + roofY(x) + 1, z, "sea_lantern"));
      ops.push(set(side * x, GROUND + roofY(x) + 2, z, "end_rod"));
    }
  }
}

/**
 * 外の大階段。**胸壁（y ＝ 12）へ 1 段ずつ 12 段**。
 *
 * > ### **屋根へは、外から登る**
 * >
 * > 側廊の中に階段を置くと、屋根にぶつかって天井が足りなくなる。
 * > **外壁に沿って外から登る**ほうが素直で、戦いの動線としても分かりやすい。
 * > **敵も同じ道で登ってくる**（0-8）。
 */
function stairs(ops: BuildOp[]): void {
  for (const s of STAIRS) {
    const x0 = s.side * (WALL_X + 1);
    const x1 = s.side * (WALL_X + 6);
    for (let k = 0; k < STAIR_STEPS; k++) {
      const z = s.z0 + k;
      const y = GROUND + 1 + k;
      ops.push(fill(x0, GROUND + 1, z, x1, y, z, "quartz_bricks"));
      ops.push(set(x0, y, z, "calcite"));
      ops.push(set(x1, y, z, "polished_diorite"));
    }
    // ---- 登り口の両脇に灯り
    for (const dx of [1, 6]) {
      ops.push(set(s.side * (WALL_X + dx), GROUND + 1, s.z0 - 1, "chiseled_quartz_block"));
      ops.push(set(s.side * (WALL_X + dx), GROUND + 2, s.z0 - 1, "sea_lantern"));
    }
  }
}

/** 列柱と屋根を組む */
export function hallOps(ops: BuildOp[]): void {
  colonnade(ops);
  roof(ops);
  stairs(ops);
  lamps(ops);
}
