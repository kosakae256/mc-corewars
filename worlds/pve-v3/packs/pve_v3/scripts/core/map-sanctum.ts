/**
 * 戦場 17「白の神殿」（`sanctum`）。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 17 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **休憩所が「安全な神殿」なら、こちらは「戦う神殿」。**
 * >
 * > **材も意匠も休憩所と同じ**（`core/rest-temple.ts` ほか）——
 * > クォーツ、市松の床、列柱、ステンドグラス、シーランタン、エンドロッド、尖塔。
 * > **同じ姿の場所が 2 つあることで、世界に筋が通る。**
 * >
 * > **違うのは手入れの度合い。**
 * > 屋根は落ち、壁は崩れ、柱は折れ、床には苔が乗っている。
 *
 * ## 立体の断面（x の向きに切った図）
 *
 * ```
 *                       ▲ 16  柱頭
 *   ▲ 10 付け柱          │
 *   █  9 胸壁 ═══════════╪═══   ← 上廊（y ＝ 8）から 1 マス。歩ける
 *   █    ┌─ 上廊 y ＝ 8 ─┐│
 *   █    │  側廊（天井 8）││        身廊は**空へ抜ける**（屋根は落ちた）
 *   ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  y ＝ 0
 *  −18   −17 …… −8   −7   0
 * ```
 *
 * ## 手順
 *
 * ```
 * plinth    基壇（下へ細る円錐）。**外は奈落**（0-4）
 * floorOps  島の天面。市松・敷石・交差部の輪
 * ruinOps   倒れた柱・瓦礫・苔（**建物より先**。あとで上書きされてよい）
 * shellOps  外壁・前面・後ろの壁・後陣
 * hallOps   列柱・上廊・外の大階段
 * propOps   尖塔・参道の門・内陣の天蓋
 * ```
 *
 * > ### **外は奈落**（0-4）
 * >
 * > 神殿の外壁は「登れない壁」ではない——**上廊へ登れないと戦えない**（0-8）。
 * > **盤面の外へ出さない役目は、島の縁（半径 46）に持たせた。**
 * > 縁の外は落ちるだけなので、**壁を意匠として自由に作れる。**
 */

import { cylinder, fill, type BuildOp } from "./build.js";
import { clearBox, gateBack, GROUND, openGate, spawnPad } from "./map-frame.js";
import { ISLE_R } from "./map-sanctum-plan.js";
import { floorOps, ruinOps } from "./map-sanctum-decor.js";
import { shellOps } from "./map-sanctum-shell.js";
import { hallOps } from "./map-sanctum-hall.js";
import { propOps } from "./map-sanctum-props.js";

/** 基壇の段。**下へ細る**——外へ張り出す棚を作らない（0-5） */
const TIERS: readonly (readonly [number, number, number, string])[] = [
  [-4, -1, ISLE_R, "smooth_quartz"],
  [-8, -5, ISLE_R - 2, "quartz_bricks"],
  [-14, -9, ISLE_R - 5, "calcite"],
  [-22, -15, ISLE_R - 10, "smooth_quartz"],
  [-32, -23, ISLE_R - 17, "diorite"],
  [-44, -33, ISLE_R - 26, "andesite"],
  [-50, -45, ISLE_R - 35, "stone"],
];

/** 基壇。**神殿を載せる岩。** 段の縁だけ材を変えて、のっぺりさせない */
function plinth(ops: BuildOp[]): void {
  for (const [y0, y1, r, block] of TIERS) {
    cylinder(ops, 0, r, y0, y1, block);
    cylinder(ops, 0, r, y1, y1, block === "smooth_quartz" ? "quartz_bricks" : "calcite");
  }
}

/**
 * 参道の帯を空ける。
 *
 * **湧く所からゲートが見えること**（0-3）——
 * **x ＝ 0 の帯の y ＝ 2〜7 には、何も残さない。**
 */
function openNave(ops: BuildOp[]): void {
  ops.push(fill(-1, GROUND + 2, -45, 1, GROUND + 7, 34, "air"));
}

/** 組み立ての手順 */
export function sanctumOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  plinth(ops);
  floorOps(ops);
  ruinOps(ops);
  shellOps(ops);
  hallOps(ops);
  propOps(ops);
  openNave(ops);

  spawnPad(ops, "quartz_bricks");
  gateBack(ops, "quartz_bricks");
  openGate(ops);
  return ops;
}
