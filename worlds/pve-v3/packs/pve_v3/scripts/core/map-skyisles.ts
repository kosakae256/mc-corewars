/**
 * 戦場 02「雲の上の浮島」（`skyisles`）。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 2 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **雲海の上に、砕けた大地が 8 つ浮いている。**
 * >
 * > **島は 10、橋は 14。** 湧く所は小さな**発着の島**。そこから**石の桟橋**を渡ると、
 * > 苔と環状列石の**主島**に出る。**そこから 6 方へ橋が伸びる**——
 * > 氷柱の立つ島、崩れた小屋の島、雪に埋もれた島、**踏める雲の小島**、
 * > 崩れた見張り塔の岩、そして寄り道の 2 島。
 * > 奥の**門の島**には神殿の残骸が残り、その正面の壁にゲートが開く。
 * >
 * > **門へは 3 通りで行ける**（大橋・氷の島まわり・止まり木）。一本道にしない。
 * >
 * > **島の底は雲をまとい、岩の根が垂れている。**
 * > **縁から先は無い。** 落ちれば奈落。
 *
 * ## 組み方
 *
 * ```
 * fieldOf()   島の地図を引く（縁の揺らぎで飛び離れた 1 マスは捨てる）
 * terrain()   柱を地層に分けて積む
 * collar()    底に雲をまとわせ、roots() で岩の根を垂らす
 * …島ごとの意匠…
 * spans()     10 本の橋を架ける（**橋は地形の後**——甲板が埋まらないように）
 * smooth()    段差を埋める（0-8）
 * ```
 *
 * **コードは 5 枚に分かれている**（1 枚 300 行の決まり）。
 *
 * | | |
 * | --- | --- |
 * | `map-skyisles-shape.ts` | 島の形（楕円 ＋ 揺らぎ）と、天面・底の高さ |
 * | `map-skyisles-mat.ts` | 材の引き方（1 マスごと・霜の寄り） |
 * | `map-skyisles-terrain.ts` | 積む・雲・段差ならし・造作の道具 |
 * | `map-skyisles-span.ts` | 橋 10 本 |
 * | `map-skyisles-deco.ts` / `-spots.ts` | 島ごとの意匠と、決まった場所 |
 */

import type { BuildOp } from "./build.js";
import { clearBox, openGate, spawnPad } from "./map-frame.js";
import { iceIsle, mainIsle } from "./map-skyisles-deco.js";
import { fieldOf } from "./map-skyisles-shape.js";
import {
  cloudIsle,
  gateIsle,
  launchIsle,
  litter,
  smallIsles,
  southIsle,
  spurIsle,
  westIsle,
} from "./map-skyisles-spots.js";
import { spans } from "./map-skyisles-span.js";
import { collar, roots, smooth, terrain } from "./map-skyisles-terrain.js";

/** 組み立ての手順 */
export function skyislesOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);

  // **島の地図は 1 度だけ引く。** 以降の工程は全部これを見る
  const field = fieldOf();
  // **天面の表。** 造作は必ずここを見る——`GROUND` を決め打つと地形から浮く
  const tops = new Map<string, number>();

  terrain(ops, field, tops);
  collar(ops, field);
  roots(ops, field);

  launchIsle(ops, field, tops);
  mainIsle(ops, tops);
  iceIsle(ops, tops);
  westIsle(ops, tops);
  southIsle(ops, tops);
  spurIsle(ops, tops);
  cloudIsle(ops, tops);
  smallIsles(ops, tops);
  gateIsle(ops, tops);

  // **橋は意匠のあと。** 甲板を敷いてから意匠を置くと、道が埋まる
  const paved = spans(ops, tops);
  litter(ops, field, tops, paved);
  smooth(ops, tops);

  // **湧く所は地形のあとに置き直す**（0-2）。**門の箱は最後に空ける**（0-2-1）
  spawnPad(ops, "stone_bricks", 3);
  openGate(ops);
  return ops;
}
