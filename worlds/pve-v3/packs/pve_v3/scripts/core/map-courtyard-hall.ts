/**
 * 5「城の中庭」の**躯体。純粋。**
 *
 * **柱の高さの表**（`map-courtyard-plan.ts`）を、そのままブロックに起こす。
 *
 * ```
 *   ▲ y ＝ 18   胸壁（狭間）
 *   │    17     棟／控え柱
 *   │    14     軒（回廊の屋根の縁）
 *   │     7     2 階の床
 *   │     0     地面
 * ```
 *
 * ## 手順
 *
 * ```
 * shellOps    表のとおりに柱を立てる（中身は詰まっている）
 * hollowOps   歩廊と 2 階の中を抜く
 * arcadeOps   柱列にアーチを開ける
 * detailOps   床の模様・吊り灯り・旗・広間・門の通路
 * ```
 *
 * > ### **詰めてから抜く**
 * >
 * > 天面の表さえ守れば、**外から見た形は必ず決まりを満たす。**
 * > **中を抜くのはその後**——順番を逆にすると、抜いた所が埋め戻される。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, HALF } from "./map-frame.js";
import {
  AISLE_IN,
  AISLE_OUT,
  ARC,
  BACK_IN,
  cheb,
  crownAt,
  isPier,
  ringT,
  toPier,
  TURRETS,
  turretTop,
} from "./map-courtyard-plan.js";

/** 表のとおりに柱を立てる */
export function shellOps(ops: BuildOp[]): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      const cr = crownAt(x, z);
      if (cr === undefined) continue;
      ops.push(fill(x, GROUND - 1, z, x, cr.top - 1, z, cr.body));
      ops.push(set(x, cr.top, z, cr.cap));
    }
  }
}

/**
 * 歩廊（1 階）と 2 階の中を抜く。
 *
 * **2 階の天井は屋根の裏**——奥へ行くほど高くなる。
 *
 * > ### 歩廊の床は y ＝ 1（2026-09-06）
 * >
 * > **中庭より 1 段高い礎壇の上に柱が立つ。**
 * > **床を y ＝ 0 のままにすると、礎壇と歩廊の間が溝になる。**
 */
export function hollowOps(ops: BuildOp[]): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      const c = cheb(x, z);
      if (c < AISLE_IN || c > AISLE_OUT) continue;
      const cr = crownAt(x, z);
      if (cr === undefined || cr.kind !== "roof") continue;
      ops.push(fill(x, GROUND + 2, z, x, GROUND + 6, z, "air"));
      ops.push(fill(x, GROUND + 8, z, x, cr.top - 2, z, "air"));
    }
  }
}

/**
 * 柱列。**1 階は大きな迫り、2 階は欄干つきの小さな迫り。**
 *
 * 迫りの立ち上がりは**いちばん近い柱までの距離**で決める——
 * **間口が広いほど高く抜ける。**
 */
export function arcadeOps(ops: BuildOp[]): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      if (cheb(x, z) !== ARC) continue;
      const cr = crownAt(x, z);
      if (cr === undefined || cr.kind !== "roof") continue;
      const t = ringT(x, z);
      if (isPier(t)) {
        ops.push(set(x, GROUND + 2, z, "chiseled_stone_bricks"));
        ops.push(set(x, GROUND + 6, z, "chiseled_stone_bricks"));
        ops.push(set(x, GROUND + 8, z, "chiseled_stone_bricks"));
        ops.push(set(x, GROUND + 12, z, "chiseled_stone_bricks"));
        continue;
      }
      const rise = Math.min(3, toPier(t));
      ops.push(fill(x, GROUND + 2, z, x, GROUND + Math.min(6, 4 + rise), z, "air"));
      ops.push(fill(x, GROUND + 9, z, x, GROUND + 8 + rise, z, "air"));
      ops.push(set(x, GROUND + 8, z, rise >= 3 ? "cobblestone_wall" : "chiseled_stone_bricks"));
    }
  }
}

/** 歩廊の床と、天井から吊る灯り */
function aisleFloor(ops: BuildOp[]): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      const c = cheb(x, z);
      if (c < AISLE_IN || c > AISLE_OUT) continue;
      const cr = crownAt(x, z);
      if (cr === undefined || cr.kind !== "roof") continue;
      const t = ringT(x, z);
      const tile = ((t + c) & 1) === 0 ? "polished_andesite" : "stone_bricks";
      ops.push(set(x, GROUND + 1, z, c === AISLE_IN || c === AISLE_OUT ? "polished_diorite" : tile));
      if (c === AISLE_IN + 1 && t % 7 === 0) ops.push(set(x, GROUND + 6, z, "lantern"));
      if (c === AISLE_OUT && t % 7 === 3) ops.push(set(x, GROUND + 12, z, "lantern"));
    }
  }
}

/** 背面の壁の壁龕と、垂れ幕 */
function niches(ops: BuildOp[]): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      if (cheb(x, z) !== BACK_IN) continue;
      const cr = crownAt(x, z);
      if (cr === undefined || cr.kind !== "roof") continue;
      const t = ringT(x, z);
      const m = ((t % 9) + 9) % 9;
      if (m === 0) {
        ops.push(fill(x, GROUND + 2, z, x, GROUND + 4, z, "air"));
        ops.push(set(x, GROUND + 2, z, "sea_lantern"));
      }
      if (m === 4) ops.push(fill(x, GROUND + 3, z, x, GROUND + 5, z, "red_wool"));
      if (m === 5) ops.push(fill(x, GROUND + 3, z, x, GROUND + 5, z, "chiseled_stone_bricks"));
    }
  }
}

/** 城壁の外面に、腰の帯を 2 本回す。**平らな一枚壁にしない**（0-4） */
function stringCourse(ops: BuildOp[]): void {
  for (const y of [GROUND + 8, GROUND + 13]) {
    ops.push(fill(-46, y, -46, 46, y, -46, "chiseled_stone_bricks"));
    ops.push(fill(-46, y, 46, 46, y, 46, "chiseled_stone_bricks"));
    ops.push(fill(-46, y, -46, -46, y, 46, "chiseled_stone_bricks"));
    ops.push(fill(46, y, -46, 46, y, 46, "chiseled_stone_bricks"));
  }
}

/** 塔の頂に旗を立てる */
function flags(ops: BuildOp[]): void {
  for (const t of TURRETS) {
    const top = turretTop(t);
    ops.push(fill(t.x, top + 1, t.z, t.x, top + 2, t.z, "dark_oak_fence"));
    ops.push(set(t.x, top + 3, t.z, "red_wool"));
  }
}

/**
 * 南の広間。**ここに湧く。**
 *
 * **奥（＋z）に大きな門があり、そこを抜けると中庭。**
 * 城壁の外面（z ＝ −46）は抜かない——**外へ出られてはいけない**（0-4）。
 */
function greatHall(ops: BuildOp[]): void {
  ops.push(fill(-7, GROUND + 1, -45, 7, GROUND + 6, -35, "air"));
  ops.push(fill(-7, GROUND, -45, 7, GROUND, -35, "polished_andesite"));
  // ---- 広間の柱。**湧く所（半径 5）には掛からない位置に置く**
  for (const cx of [-6, 6]) {
    for (const cz of [-43, -39]) {
      ops.push(fill(cx, GROUND + 1, cz, cx, GROUND + 6, cz, "chiseled_stone_bricks"));
      ops.push(set(cx, GROUND + 5, cz, "lantern"));
    }
  }
  // ---- 中庭へ抜ける大門
  ops.push(fill(-4, GROUND + 1, -34, 4, GROUND + 6, -34, "air"));
  ops.push(fill(-5, GROUND + 1, -34, -5, GROUND + 7, -34, "chiseled_stone_bricks"));
  ops.push(fill(5, GROUND + 1, -34, 5, GROUND + 7, -34, "chiseled_stone_bricks"));
  for (let dx = -4; dx <= 4; dx++) {
    ops.push(set(dx, GROUND + 7 - (Math.abs(dx) >= 3 ? 1 : 0), -34, "chiseled_stone_bricks"));
  }
  ops.push(set(-3, GROUND + 5, -45, "sea_lantern"));
  ops.push(set(3, GROUND + 5, -45, "sea_lantern"));
}

/** 北の門の通路。**ゲートの箱まで、まっすぐ抜く** */
function gateWay(ops: BuildOp[]): void {
  ops.push(fill(-2, GROUND + 1, 34, 2, GROUND + 6, 40, "air"));
  ops.push(fill(-2, GROUND + 1, 34, 2, GROUND + 1, 38, "polished_andesite"));
  ops.push(fill(-2, GROUND, 39, 2, GROUND, 40, "polished_andesite"));
  ops.push(fill(-3, GROUND + 1, 34, -3, GROUND + 7, 39, "chiseled_stone_bricks"));
  ops.push(fill(3, GROUND + 1, 34, 3, GROUND + 7, 39, "chiseled_stone_bricks"));
  ops.push(fill(-3, GROUND + 7, 34, 3, GROUND + 7, 39, "chiseled_stone_bricks"));
  for (const dz of [35, 38]) {
    ops.push(set(-2, GROUND + 5, dz, "lantern"));
    ops.push(set(2, GROUND + 5, dz, "lantern"));
  }
  // ---- 門の面の飾り。**箱（−1〜1・y 1〜5）には触らない**
  ops.push(fill(-2, GROUND + 6, 39, 2, GROUND + 6, 39, "chiseled_stone_bricks"));
  ops.push(fill(-2, GROUND + 1, 39, -2, GROUND + 5, 39, "polished_blackstone"));
  ops.push(fill(2, GROUND + 1, 39, 2, GROUND + 5, 39, "polished_blackstone"));
}

/** 床の模様・灯り・旗・広間・通路。**躯体を抜いたあとに置く** */
export function detailOps(ops: BuildOp[]): void {
  aisleFloor(ops);
  niches(ops);
  stringCourse(ops);
  flags(ops);
  greatHall(ops);
  gateWay(ops);
  // ---- 歩廊の隅に、上へ抜ける天窓。**2 階が暗くなりすぎないように**
  for (const [sx, sz] of [
    [-1, -1],
    [1, 1],
  ] as const) {
    ops.push(fill(sx * 37, GROUND + 7, sz * 30, sx * 37, GROUND + 7, sz * 26, "air"));
  }
}
