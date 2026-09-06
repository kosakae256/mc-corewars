/**
 * 11. 森の洋館——廊下と部屋が並ぶ（**屋内**）。部屋ごとに分断される
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 11 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **ダークオークの館。丸ごと屋内。**
 * >
 * > 湧く所は**玄関大広間**——正面に暖炉、左右に**大階段**。
 * > 奥へ進むと**窓の並ぶ廊下**、その内側に**部屋列**、真ん中に**2 層吹き抜けの大広間。**
 * > 部屋は**赤い部屋・彫像の間・牢・茸の間・食堂・寝間・偽の部屋**（口が無い）。
 * > **2 階も同じ間取り**で、置いてあるものだけが違う。
 * > 突き当たりが**ゲート前の広間**。
 *
 * ```
 *  z ＝ −45  ┌───────┐   北棟   玄関大広間（吹き抜け）＋ 大階段
 *  z ＝ −23  │  ┌────┴──────────┐   北の窓廊下
 *  z ＝ −12  │  │   部屋列 N    │
 *  z ＝   0  │  │  ■ 大広間 ■   │   2 層吹き抜け・回廊・柱・吊り灯り
 *  z ＝ +17  │  │   部屋列 S    │
 *  z ＝ +22  │  └────┬──────────┘   南の窓廊下
 *  z ＝ +45  └───────┘   南棟   ゲート前の広間
 * ```
 *
 * ## 組み立ての順
 *
 * **詰める → 彫る → 塗る → 置く → 口を開ける。**
 * **口を最後にする**のが要点——飾りを先に置くと、扉を塞いでしまう。
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, gateBack, GROUND, openGate, spawnPad } from "./map-frame.js";
import { TOP2 } from "./map-mansion-plan.js";
import { wallColumn } from "./map-mansion-mat.js";
import { carveOps, deckOps, doorOps, faceOps, facadeOps, massOps, roofOps, windowOps } from "./map-mansion-shell.js";
import { corridorOps, galleryOps, roomOps } from "./map-mansion-rooms.js";
import { entranceOps, gateHallOps, grandStairs, greatHallOps, linkOps, stairHalls } from "./map-mansion-halls.js";

/**
 * 湧く所を置き直す。
 *
 * > ### `spawnPad` は z ＝ −45 まで空気で抜く
 * >
 * > **北の外壁は z ＝ −45〜−43。** そのままだと**壁に低い穴が開いて、外へ出られる。**
 * > **足場を置いたあと、必ず塞ぎ直す。**
 */
function spawnHall(ops: BuildOp[]): void {
  spawnPad(ops, "dark_oak_planks");
  ops.push(fill(-6, GROUND + 1, -45, 6, TOP2 - 1, -43, "dark_oak_planks"));
  for (let x = -6; x <= 6; x++) {
    ops.push(fill(x, GROUND + 1, -43, x, TOP2 - 1, -43, wallColumn(x, -43)));
  }
  // **奥へ向かう赤い筋。** 着いた瞬間に「どちらへ行くのか」が分かる
  for (let z = -42; z <= -32; z++) {
    for (let x = -2; x <= 2; x++) ops.push(set(x, GROUND, z, "red_wool"));
  }
}

/** 組み立ての手順 */
export function mansionOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  massOps(ops);
  roofOps(ops);
  carveOps(ops);
  faceOps(ops);
  facadeOps(ops);
  deckOps(ops);
  roomOps(ops);
  corridorOps(ops);
  galleryOps(ops);
  entranceOps(ops);
  greatHallOps(ops);
  gateHallOps(ops);
  grandStairs(ops);
  stairHalls(ops);
  windowOps(ops);
  doorOps(ops);
  linkOps(ops);
  spawnHall(ops);
  gateBack(ops, "dark_oak_planks");
  openGate(ops);
  return ops;
}
