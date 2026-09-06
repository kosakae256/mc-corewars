/**
 * 戦場 14「円形闘技場」の**面の意匠。**
 *
 * 外壁の内面・段差の立ち上がり・歩廊の明かり・門の面。
 *
 * > ### **平らな一枚壁にはしない**（`14-map-build.md` 0-4）
 * >
 * > **付け柱・胴の帯・窪み**だけで見せる。**質素なまま、目を持たせる。**
 *
 * > ### **面を貼るだけで、天面には触らない**
 * >
 * > 高さを変えないので、**外へ出られる足がかりは 1 マスも増えない。**
 * > 出っ張りも作らない——**窪みは、暗い石に替えて表す。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import {
  arcOf,
  CAP_OUT,
  CAP_Y,
  distOf,
  FLOOR_R,
  FLOOR_Y,
  LEDGE_IN,
  LEDGE_Y,
  SEED,
  topAt,
  WALL_IN,
  WALL_Y,
} from "./map-arena-form.js";
import { GATE } from "./places.js";

/**
 * 段差の立ち上がり——**段差下と段差上を分ける 6 マスの崖。**
 *
 * **等間隔でない窪み**を刻む（0-6）。1 マスごとに引いた乱数で
 * 窪ませる所を決めるので、**同じ間隔で並ばない。**
 * 天端には**縁石**を 1 本通して、崖の上端を線にする。
 */
function stepFace(ops: BuildOp[]): void {
  for (let x = -LEDGE_IN - 1; x <= LEDGE_IN + 1; x++) {
    for (let z = -LEDGE_IN - 1; z <= LEDGE_IN + 1; z++) {
      const r = distOf(x, z);
      if (r < FLOOR_R + 0.5 || r > LEDGE_IN + 1.2) continue;
      if (topAt(x, z) !== LEDGE_Y) continue;
      const a = arcOf(x, z, r);
      // ---- 付け柱。**7 マスおきだが、乱数で 1 本ずつ抜く**——並びを揃えない
      if (a % 7 === 0 && noise(SEED + 111, a, 0) > 0.28) {
        ops.push(fill(x, FLOOR_Y + 1, z, x, LEDGE_Y - 2, z, "chiseled_stone_bricks"));
        ops.push(set(x, LEDGE_Y - 1, z, "polished_andesite"));
        continue;
      }
      ops.push(fill(x, FLOOR_Y + 1, z, x, LEDGE_Y - 2, z, "stone_bricks"));
      // ---- 窪み。**まばらに、深さも変える**
      const dent = noise(SEED + 113, a, 1);
      if (dent > 0.62) ops.push(fill(x, FLOOR_Y + 2, z, x, LEDGE_Y - (dent > 0.84 ? 3 : 4), z, "cobblestone"));
      // ---- 縁石。**崖の天端を 1 本の線にする**
      ops.push(set(x, LEDGE_Y - 1, z, "polished_andesite"));
    }
  }
}

/**
 * 外壁の内面——**12 マスの垂直な壁。**
 *
 * **付け柱を 8 マスおき**に立て、そのあいだを**上下 2 段の窪み**にする。
 * 中ほどに**胴の帯**を 1 本通す。**明かりは付け柱の隣にだけ**——
 * 一周ぐるりと灯すと、質素に見えなくなる。
 */
function wallFace(ops: BuildOp[]): void {
  for (let x = -WALL_IN - 1; x <= WALL_IN + 1; x++) {
    for (let z = -WALL_IN - 1; z <= WALL_IN + 1; z++) {
      const r = distOf(x, z);
      if (r < WALL_IN - 0.5 || r > WALL_IN + 1.2) continue;
      if (topAt(x, z) !== WALL_Y) continue;
      const m = arcOf(x, z, r) % 8;
      if (m === 0) {
        ops.push(fill(x, LEDGE_Y + 1, z, x, WALL_Y - 1, z, "chiseled_stone_bricks"));
        continue;
      }
      ops.push(fill(x, LEDGE_Y + 1, z, x, WALL_Y - 1, z, "stone_bricks"));
      // ---- 上下 2 段の窪み。**本当に彫ると足がかりになる**ので、暗い石で表す（0-4）
      if (m >= 2 && m <= 6) {
        ops.push(fill(x, LEDGE_Y + 1, z, x, LEDGE_Y + 4, z, "cobblestone"));
        ops.push(fill(x, LEDGE_Y + 7, z, x, WALL_Y - 2, z, "cobblestone"));
      }
      // ---- 胴の帯
      ops.push(fill(x, LEDGE_Y + 5, z, x, LEDGE_Y + 6, z, m === 4 ? "andesite" : "polished_andesite"));
      // ---- 明かり。**付け柱の隣、4 本に 1 本だけ**
      if (m === 1 && arcOf(x, z, r) % 32 === 1) ops.push(set(x, LEDGE_Y + 6, z, "glowstone"));
    }
  }
}

/** 笠石の外面。**いちばん外の輪を、下まで 1 色で落として輪郭を締める** */
function capFace(ops: BuildOp[]): void {
  for (let x = -CAP_OUT; x <= CAP_OUT; x++) {
    for (let z = -CAP_OUT; z <= CAP_OUT; z++) {
      const r = distOf(x, z);
      if (r < CAP_OUT - 1 || r > CAP_OUT) continue;
      const a = arcOf(x, z, r);
      ops.push(fill(x, CAP_Y - 3, z, x, CAP_Y - 1, z, a % 6 === 0 ? "chiseled_stone_bricks" : "stone_bricks"));
    }
  }
}

/**
 * 歩廊の明かり。**ところどころに 1 本ずつ。**
 *
 * **1 マス角の柱**だけ。横木も天板も渡さない。
 * **`|x| ≦ 8` の帯には置かない**——湧く所からゲートへの線を遮る（0-3）。
 */
const LAMPS: readonly number[] = [22, 47, 68, 112, 133, 158, 202, 227, 248, 292, 313, 338];

function lamps(ops: BuildOp[]): void {
  for (const deg of LAMPS) {
    const a = (deg * Math.PI) / 180;
    const x = Math.round(Math.cos(a) * 41);
    const z = Math.round(Math.sin(a) * 41);
    if (topAt(x, z) !== LEDGE_Y || Math.abs(x) <= 8) continue;
    ops.push(fill(x, LEDGE_Y + 1, z, x, LEDGE_Y + 2, z, "stone_bricks"));
    ops.push(set(x, LEDGE_Y + 3, z, "glowstone"));
  }
}

/**
 * 門の面——**ゲートの真後ろに立つ控え壁。**
 *
 * **ゲートの箱（1,1,39 〜 −1,5,39）には何も置かない**（`14-map-build.md` 0-2-1）——
 * **倒し切ったときに進行の側が置く。** 飾りは**箱の外側**だけ。
 * 奥を暗く落としておかないと、**ポータルが灰色の壁に貼り付いて見える。**
 */
function gateFace(ops: BuildOp[]): void {
  const z = GATE.z + 1;
  for (let x = -5; x <= 5; x++) {
    const pil = Math.abs(x) === 3 || Math.abs(x) === 5;
    ops.push(fill(x, LEDGE_Y + 1, z, x, WALL_Y - 1, z, pil ? "chiseled_stone_bricks" : "stone_bricks"));
    if (Math.abs(x) <= 2) ops.push(fill(x, LEDGE_Y + 1, z, x, LEDGE_Y + 6, z, "cobblestone"));
    if (Math.abs(x) === 4) ops.push(fill(x, LEDGE_Y + 2, z, x, LEDGE_Y + 5, z, "cobblestone"));
  }
  ops.push(fill(-2, LEDGE_Y + 7, z, 2, LEDGE_Y + 7, z, "polished_andesite"));
  // ---- 門の灯。**ここだけは明るくする**——
  //      **段差下は暗いので、灯が無いとどこへ向かえばいいのか分からない**（0-3）
  for (const [x, y] of [
    [-3, 5],
    [3, 5],
    [-4, 3],
    [4, 3],
    [-2, 7],
    [2, 7],
  ] as const) {
    ops.push(set(x, LEDGE_Y + y, z, "glowstone"));
  }
  // ---- 門の前の敷石。**高さは変えない**
  ops.push(fill(-4, LEDGE_Y, GATE.z - 2, 4, LEDGE_Y, GATE.z - 1, "polished_andesite"));
}

/**
 * 湧く所の目印。**左右に 1 本ずつ立てるだけ。**
 *
 * **足場（`spawnPad`）が空けるのは y ＝ 1〜3 だけ**なので、
 * **`|x| ≦ 2 かつ z ＝ −42〜−38` には何も置かない。**
 * **x ＝ 0 の柱も空ける**——ゲートまでの視線が通る（0-3）。
 */
export function arenaSpawnOps(ops: BuildOp[]): void {
  for (const x of [-4, 4]) {
    for (const z of [-43, -37]) {
      if (topAt(x, z) !== LEDGE_Y) continue;
      ops.push(fill(x, LEDGE_Y + 1, z, x, LEDGE_Y + 2, z, "stone_bricks"));
      ops.push(set(x, LEDGE_Y + 3, z, "glowstone"));
    }
  }
  ops.push(fill(-3, LEDGE_Y, -37, 3, LEDGE_Y, -37, "polished_andesite"));
}

/** 面の意匠を、まとめて積む */
export function arenaDecoOps(ops: BuildOp[]): void {
  stepFace(ops);
  wallFace(ops);
  capFace(ops);
  gateFace(ops);
  lamps(ops);
}
