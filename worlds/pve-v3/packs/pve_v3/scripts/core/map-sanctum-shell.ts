/**
 * 17「白の神殿」の**外殻。純粋。**
 *
 * 外壁・前面（入口）・後ろの壁・後陣（アプス）。
 *
 * ```
 *   y ＝ 13   付け柱と狭間の天端
 *   y ＝ 12   壁の天端＝**歩ける胸壁。** 上廊（y ＝ 11）から 1 マス
 *   y ＝ 6〜9 ステンドグラスの高窓（水色・白・紫）
 *   y ＝  4   方解石の胴蛇腹
 *   y ＝  1   滑らかなクォーツの沓
 * ```
 *
 * > ### **壁の天端は「登れる」ようにする**（0-8）
 * >
 * > **検査は、辿り着けない天面が 4 マス以上まとまっていると落とす。**
 * > 壁は長いので、**帯のまま取り残されると必ず落ちる。**
 * > **付け柱は 1 マスだけ高くする**——2 マス高いと、そこで道が切れる。
 * > 上廊（y ＝ 11）と壁（y ＝ 12）が 1 マス差なので、**壁の上をぐるりと歩ける。**
 *
 * > ### **崩れ目は、通り抜けられる形にする**
 * >
 * > 天端を **3 → 1 → 0 → 1 → 3** と落とす。
 * > **0 の所で外庭と側廊が直につながる**——横から回り込める道になる。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND } from "./map-frame.js";
import { glassOf, wallStone } from "./map-sanctum-mat.js";
import {
  AISLE_IN,
  APSE_CZ,
  APSE_R,
  BACK_Z,
  breachTop,
  CLERESTORY_TOP,
  FRONT_Z,
  isPier,
  isPilasterX,
  PIER_X,
  PILASTER_TOP,
  roofY,
  WALL_TOP,
  WALL_X,
  wallTop,
} from "./map-sanctum-plan.js";

/** 壁を 1 本立てる。**天端は彫りクォーツ** */
function stack(ops: BuildOp[], x: number, z: number, top: number): void {
  if (top <= 0) return;
  for (let y = 1; y <= top; y++) ops.push(set(x, GROUND + y, z, wallStone(x, y, z, top)));
}

/** 側面の外壁（x ＝ ±27）。**高窓・付け柱・狭間・崩れ目** */
function sideWalls(ops: BuildOp[]): void {
  for (const side of [-1, 1]) {
    const x = side * WALL_X;
    for (let z = FRONT_Z; z <= BACK_Z; z++) {
      const top = wallTop(side, z);
      stack(ops, x, z, top);
      if (breachTop(side, z) !== undefined) continue;
      if (isPier(z)) {
        // ---- 付け柱。**外へ 1 マス出す。** 天端は壁より 1 マスだけ高い
        ops.push(fill(x + side, GROUND + 1, z, x + side, GROUND + PILASTER_TOP - 1, z, "quartz_pillar"));
        ops.push(set(x + side, GROUND + PILASTER_TOP, z, "chiseled_quartz_block"));
        ops.push(set(x, GROUND + PILASTER_TOP, z, "chiseled_quartz_block"));
        continue;
      }
      // ---- 高窓。**休憩所と同じ 3 色**
      for (let y = 6; y <= 9; y++) ops.push(set(x, GROUND + y, z, glassOf(3, side * 9, z)));
    }
  }
}

/** 崩れ目の足元に落ちた瓦礫。**1 マス高**——歩いて越えられる */
function breachRubble(ops: BuildOp[]): void {
  for (const side of [-1, 1]) {
    const x = side * WALL_X;
    for (let z = FRONT_Z; z <= BACK_Z; z++) {
      if (breachTop(side, z) !== 0) continue;
      for (const dx of [-2, -1, 1, 2]) {
        ops.push(set(x + side * dx, GROUND, z, dx % 2 === 0 ? "andesite" : "diorite"));
      }
      ops.push(set(x - side, GROUND + 1, z, "quartz_bricks"));
      ops.push(set(x + side * 2, GROUND + 1, z, "mossy_cobblestone"));
    }
  }
}

/**
 * 端の壁（前面・後ろ）の天端。
 *
 * > ### 端は**破風**にする（2026-09-06）
 * >
 * > 天端を**屋根の勾配に合わせて 1 マスずつ上げる**と、神殿の切妻の顔になる。
 * > **傾きは屋根と同じ 2 マスに 1 マス**なので、軒から歩いて登れる（0-8）。
 * > **身廊の正面（|x| ≦ 12）は、高窓より 1 マス高い平らな壁**——
 * > 西構え（ウェストワーク）。ここに大窓を開ける。
 */
function endTop(x: number): number {
  const ax = Math.abs(x);
  if (ax >= WALL_X) return WALL_TOP;
  if (ax >= AISLE_IN) return roofY(ax) + 1;
  return CLERESTORY_TOP + 1;
}

/**
 * 端の壁を 1 本ぶん。
 *
 * **付け柱は上へ伸ばさない**——伸ばすと隣との差が 2 になって天端の道が切れる。
 * **手前（z 方向）へ 1 マス出す**ほうで陰影を付ける。
 */
function endWall(ops: BuildOp[], z: number, x: number, out: number): void {
  const top = endTop(x);
  for (let y = 1; y <= top; y++) ops.push(set(x, GROUND + y, z, wallStone(x, y, z, top)));
  if (isPilasterX(x)) {
    for (let y = 1; y <= top; y++) ops.push(set(x, GROUND + y, z + out, wallStone(x, y, z, top)));
    ops.push(set(x, GROUND + top, z + out, "chiseled_quartz_block"));
    ops.push(set(x, GROUND + top, z, "chiseled_quartz_block"));
    return;
  }
  for (let y = 6; y <= Math.min(9, top - 2); y++) ops.push(set(x, GROUND + y, z, glassOf(9, x, z)));
}

/** 入口の大扉の幅（半分）。**参道はここを抜ける** */
const DOOR_HALF = 5;

/**
 * 前面（入口）。**x ＝ −5〜+5 は空へ抜ける大扉。**
 *
 * > ### 扉に鴨居を渡してはいけない（2026-09-06 に検査で落ちた）
 * >
 * > **0-8 の検査は、柱の天面しか見ない。**
 * > 扉の上に梁を渡すと、その柱の天面は**梁の高さ**になり、
 * > **床が地続きでも「歩いて行けない」と判定される。**
 * > 実際、身廊まるごと（1668 マス）が取り残された。
 * >
 * > **通り道の上には何も置かない。** 代わりに
 * > **扉の両脇（|x| ＝ 6〜12）を高い壁の塊にして**、大窓を開ける——
 * > 塔門（パイロン）の構えになる。
 */
function front(ops: BuildOp[]): void {
  for (let x = -WALL_X; x <= WALL_X; x++) {
    if (Math.abs(x) <= DOOR_HALF) continue;
    endWall(ops, FRONT_Z, x, -1);
  }
  // ---- 扉の両脇の塊に、縦長の大窓
  for (const side of [-1, 1]) {
    for (let ax = DOOR_HALF + 2; ax <= PIER_X - 1; ax++) {
      const x = side * ax;
      for (let y = 12; y <= CLERESTORY_TOP - 1; y++) ops.push(set(x, GROUND + y, FRONT_Z, glassOf(29, x, y)));
      ops.push(set(x, GROUND + 11, FRONT_Z, "chiseled_quartz_block"));
    }
    // ---- 扉の枠。**柱形で縁取る**
    const jamb = side * (DOOR_HALF + 1);
    ops.push(fill(jamb, GROUND + 1, FRONT_Z, jamb, GROUND + CLERESTORY_TOP, FRONT_Z, "quartz_pillar"));
    ops.push(set(jamb, GROUND + CLERESTORY_TOP + 1, FRONT_Z, "chiseled_quartz_block"));
    ops.push(set(jamb, GROUND + 4, FRONT_Z, "calcite"));
    ops.push(set(jamb, GROUND + 8, FRONT_Z, "sea_lantern"));
  }
  // ---- 門の脇に立つ 1 マス角の塔。**天面が 1 マスなら取り残されない**（0-8）
  for (const side of [-1, 1]) {
    const x = side * 15;
    const top = side > 0 ? 21 : 23;
    ops.push(fill(x, GROUND + 1, FRONT_Z, x, GROUND + top, FRONT_Z, "quartz_pillar"));
    ops.push(set(x, GROUND + 4, FRONT_Z, "calcite"));
    ops.push(set(x, GROUND + top + 1, FRONT_Z, "chiseled_quartz_block"));
    ops.push(set(x, GROUND + top + 2, FRONT_Z, "sea_lantern"));
    ops.push(set(x, GROUND + top + 3, FRONT_Z, "end_rod"));
    // ---- 持ち送り。**前後に 1 マスずつ**（塔と合わせて 3 マス。0-8 の上限内）
    for (const y of [13, 18]) {
      ops.push(set(x, GROUND + y, FRONT_Z - 1, "chiseled_quartz_block"));
      ops.push(set(x, GROUND + y, FRONT_Z + 1, "chiseled_quartz_block"));
    }
  }
}

/** 後ろの壁（側廊の突き当たり）。**上廊の欄干も兼ねる** */
function back(ops: BuildOp[]): void {
  for (let x = AISLE_IN; x <= WALL_X; x++) {
    for (const side of [-1, 1]) endWall(ops, BACK_Z, side * x, 1);
  }
}

/** 四隅の塔。**1 マス角**——天面 1 マスなら 0-8 に落ちない */
function corners(ops: BuildOp[]): void {
  const spots: readonly (readonly [number, number, number])[] = [
    [-WALL_X, FRONT_Z, 19],
    [WALL_X, FRONT_Z, 23],
    [-WALL_X, BACK_Z, 24],
    [WALL_X, BACK_Z, 20],
  ];
  for (const [x, z, top] of spots) {
    ops.push(fill(x, GROUND + 1, z, x, GROUND + top, z, "quartz_pillar"));
    ops.push(set(x, GROUND + 4, z, "calcite"));
    ops.push(set(x, GROUND + top + 1, z, "chiseled_quartz_block"));
    ops.push(set(x, GROUND + top + 2, z, "sea_lantern"));
    ops.push(set(x, GROUND + top + 3, z, "end_rod"));
  }
}

/**
 * 後陣の天端。**弦（|x| ＝ 11〜12）で 18、奥（|x| ≦ 8）で 21。**
 *
 * > ### 起こしの高さは、隣り合う物に合わせる（0-8）
 * >
 * > 弦の外側は**破風の天端（x ＝ 13 で 18）**。ここを 12 にしていたら、
 * > **差が 5 になって半円まるごと（90 マス）が取り残された。**
 * > **18 から始めて 1 マスずつ上げる**と、破風から歩いて回れる。
 */
function apseTop(x: number): number {
  return CLERESTORY_TOP + Math.min(3, Math.max(0, APSE_R - Math.abs(x)));
}

/**
 * 後陣（アプス）。**ゲートはこの半円の中に立つ。**
 *
 * > ### 輪を 2 本引くだけでは、壁に穴が空く（2026-09-06 に検査で落ちた）
 * >
 * > `circlePoints` を半径 11 と 12 で引いたら、**丸めの都合で 1 マス抜けた。**
 * > **抜けた所で天端の道が切れて、半円まるごと（44 マス）が取り残された。**
 * > **距離の帯（10.5〜12.2）で塗る**と、必ず繋がる。
 *
 * **ポータルの裏へは回れない**（0-3）——半円が閉じている。
 */
function apse(ops: BuildOp[]): void {
  const reach = APSE_R + 2;
  for (let dz = 1; dz <= reach; dz++) {
    for (let x = -reach; x <= reach; x++) {
      const d = Math.hypot(x, dz);
      if (d < APSE_R - 0.5 || d > APSE_R + 1.2) continue;
      const z = APSE_CZ + dz;
      const top = apseTop(x);
      for (let y = 1; y <= top; y++) ops.push(set(x, GROUND + y, z, wallStone(x, y, z, top)));
      // ---- 大窓は背面だけ。**ゲートの真後ろに光を溜める**
      if (Math.abs(x) > 5) continue;
      for (let y = 6; y < top; y++) ops.push(set(x, GROUND + y, z, glassOf(23, x, z)));
    }
  }
}

/** 外殻を組む */
export function shellOps(ops: BuildOp[]): void {
  sideWalls(ops);
  front(ops);
  back(ops);
  apse(ops);
  corners(ops);
  breachRubble(ops);
}
