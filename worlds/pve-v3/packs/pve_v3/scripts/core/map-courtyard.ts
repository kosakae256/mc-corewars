/**
 * 戦場 05「城の中庭」（`courtyard`）。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 5 番。
 *
 * ## コンセプト
 *
 * > ### **回廊に囲まれた石畳。回廊は 2 階建て。**
 * >
 * > 四方を**アーチの列柱**が囲み、その上に**2 階の回廊**が乗る。
 * > 見上げれば**粘板岩の屋根と切妻**、その向こうに**胸壁と隅塔**。
 * > 真ん中には**二段の噴水**、四隅には**刈り込みの植え込み。**
 * >
 * > **落ちる所は無い。** 南の広間に湧き、大門をくぐって中庭へ出る。
 * > 奥の門楼の足元にゲートが立つ。
 *
 * ## 割り付け
 *
 * **中心からのチェビシェフ距離だけで決まる**（`map-courtyard-plan.ts`）。
 *
 * ```
 *      ┌────────────────────────────┐  ← 城壁（胸壁 y ＝ 18）
 *      │ ╔══════════════════════╗  │  ← 回廊の屋根（軒 14／棟 17）
 *      │ ║      ▨   ◎   ▨      ║  │  ← 中庭（y ＝ 0）
 *      │ ╚══════════════════════╝  │
 *      └────────────────────────────┘
 * ```
 *
 * > ### **2 階へは、中庭の大階段から**（0-8）
 * >
 * > 東西に 1 本ずつ。**1 マスずつ 14 段**上がって、屋根と城壁の歩廊まで繋がる。
 * > **敵も同じ道で登ってくる。**
 */

import { fill, type BuildOp } from "./build.js";
import { clearBox, gateBack, GROUND, openGate, spawnPad } from "./map-frame.js";
import { WALL_OUT } from "./map-courtyard-plan.js";
import { arcadeOps, detailOps, hollowOps, shellOps } from "./map-courtyard-hall.js";
import { yardOps } from "./map-courtyard-yard.js";

/**
 * 台座。**下へ向かって細る。**
 *
 * > ### 外へ張り出す段を作らない（0-8）
 * >
 * > **城壁の外に棚を出すと、そこが「登れない天面」として残る。**
 * > **下へ細らせれば、天面はどこにも増えない。**
 */
function plinth(ops: BuildOp[]): void {
  for (let d = 1; d <= 20; d++) {
    const s = WALL_OUT - (d - 1);
    ops.push(fill(-s, GROUND - d, -s, s, GROUND - d, s, d <= 2 ? "stone_bricks" : "stone"));
  }
}

/**
 * 組み立ての手順。
 *
 * **詰めてから抜き、最後に湧く所とゲートを空ける**——
 * **順番を変えると、抜いた所が埋め戻される。**
 */
export function courtyardOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  plinth(ops);
  shellOps(ops);
  hollowOps(ops);
  arcadeOps(ops);
  yardOps(ops);
  detailOps(ops);

  spawnPad(ops, "polished_andesite");
  gateBack(ops, "stone_bricks");
  openGate(ops);
  return ops;
}
