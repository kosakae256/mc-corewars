/**
 * 16. 大書庫——本棚の迷路と 2 階の回廊（**屋内**）
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 16 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 * **間取りと材は `map-library-plan.ts`。**
 *
 * ```
 *   z ＝ −45  湧く所（玄関の窪み）
 *   z ＝ −41  玄関の広間      2 層ぶんの高さ。左右に大階段
 *   z ＝ −30  身廊 ──────┐   |x| ≦ 2 は 1 階に何も置かない（0-3 の線）
 *   z ＝ −13  書架の迷路     扇ごとに列の向きを変える
 *   z ＝   1  中央の広間     天球儀を吊り、大机を並べる（吹き抜け 21 マス）
 *   z ＝ +14  書架の迷路
 *   z ＝ +30  前室 ──────┘   2 層ぶんの高さ
 *   z ＝ +39  ゲートの箱      **空けておく**
 * ```
 *
 * ```
 * massOps()          八角の塊と段丘の屋根を置く
 * hollowOps()        部屋のぶんだけ中を彫る
 * faceOps()          面を石に張り替え、吹き抜けの縁に蛇腹を回す
 *   …壁 → 2 階 → 階段 → 書架 → 広間の順に飾る…
 * ```
 *
 * > ### **積まずに彫る**（`map-stronghold.ts` と同じ）
 * >
 * > 積むと**外壁だけが天井より高く残り**、上から見た高さが不連続になって
 * > 0-8 で数百マスが「歩いて行けない面」になる。
 * > **八角の塊を置いてから彫れば、天面はどこも屋根**で、段丘は 1 マスずつ。
 *
 * > ### 飾る順は、**下地 → 上物**
 * >
 * > 面を張ったあとに意匠を置く。**逆にすると張り替えに消される。**
 * > 梯子と柱は書架より**後**——書架の列を貫いて立たせたいため。
 */

import type { BuildOp } from "./build.js";
import { clearBox, gateBack, openGate, spawnPad } from "./map-frame.js";
import { faceOps, hollowOps, massOps, spawnFloorOps } from "./map-library-shell.js";
import { wallOps } from "./map-library-wall.js";
import { deckOps } from "./map-library-deck.js";
import { stairOps } from "./map-library-stair.js";
import { shelvesHighOps, shelvesLowOps } from "./map-library-shelf.js";
import { atriumOps, endHallsOps } from "./map-library-hall.js";

/** 組み立ての手順 */
export function libraryOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  massOps(ops);
  hollowOps(ops);
  faceOps(ops);
  wallOps(ops);
  deckOps(ops);
  shelvesLowOps(ops);
  shelvesHighOps(ops);
  // **階段と柱は書架のあと**——列を貫いて立たせ、道を塞がせない
  stairOps(ops);
  atriumOps(ops);
  endHallsOps(ops);
  // **足場は半径 4**——5 だと z ＝ −45 の壁を貫いて、外へ抜ける穴になる
  spawnPad(ops, "stone_bricks", 4);
  spawnFloorOps(ops);
  // **裏を塞いでから箱を空ける**——逆にすると `gateBack` が敷居を塗り潰す
  gateBack(ops, "stone_bricks");
  openGate(ops);
  return ops;
}
