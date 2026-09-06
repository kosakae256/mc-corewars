/**
 * 戦場 02「雲の上の浮島」——**橋の網。純粋。**
 *
 * **どの島とどの島を、どんな橋で結ぶか**だけを書く。
 * **架け方は `map-skyisles-span.ts`。**
 *
 * > ### 橋は 14 本、**1 本ずつ姿を変える**（0-6）
 * >
 * > 石の桟・大橋・木の桟・雪の道・氷の橋・雲の道・岩の桟。
 * > **幅・材・欄干・迫りの厚み・灯柱の間隔を、全部ずらしてある。**
 *
 * > ### 一本道にしない
 * >
 * > **門へは 3 通り**（大橋・氷の島まわり・止まり木）。
 * > 逃げ道と回り込みが要る——**橋の上で挟まれて終わり、にしない。**
 */

import { CLOUD } from "./map-skyisles-mat.js";

export interface Span {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  /** 甲板の半幅。**1 なら 3 マス、2 なら 5 マス** */
  readonly half: number;
  readonly deck: readonly string[];
  readonly arch: readonly string[];
  /** 迫りの厚み。**橋のたわみ方が変わる** */
  readonly thick: number;
  /**
   * 欄干。**必ず高さ 1**——2 マスにすると登れない面になる（0-8）。
   *
   * **書かない橋もある。** 欄干の無い細い桟は、それだけで怖い。
   */
  readonly rail?: string;
  /** 灯柱の材と、**何マスおきに立てるか** */
  readonly post?: { readonly mat: string; readonly every: number };
}

const STONE = ["stone_bricks", "cracked_stone_bricks", "andesite", "cobblestone", "mossy_stone_bricks"];
const WOOD = ["spruce_planks", "spruce_planks", "dark_oak_planks", "spruce_planks"];
// **渡る所に滑る氷を敷き詰めない。** 雪を主にして、氷は縞に混ぜる
const FROSTED = ["snow", "calcite", "snow", "packed_ice", "blue_ice", "snow"];

/**
 * 橋の網。**主島を中心に、外周をぐるりと回れる**——一本道にしない。
 *
 * ```
 *   西 ─── 主島 ── 氷の島 ── 東奥 ── 門
 *    │      │ ╲ ╲      ╱        │
 *    │     南   ╲ 雲の小島 ─────┘
 *    │      │    止まり木 ───────┘
 *   窪み ─ 発着（湧く所）
 * ```
 */
export const SPANS: readonly Span[] = [
  // **発着 → 主島。** 太い石の桟。ここだけ広くして、渡り始めを不安にしない
  {
    ax: 0,
    az: -38,
    bx: 0,
    bz: -13,
    half: 2,
    thick: 5,
    deck: STONE,
    arch: ["stone", "andesite", "cobblestone", "tuff"],
    rail: "stone_brick_wall",
    post: { mat: "chiseled_stone_bricks", every: 7 },
  },
  // **主島を貫く参道。** 橋ではないので欄干を付けない——踏み固めた道に見せる
  {
    ax: 0,
    az: -13,
    bx: 1,
    bz: 3,
    half: 2,
    thick: 3,
    deck: ["cobblestone", "coarse_dirt", "cobblestone", "andesite", "cobblestone"],
    arch: ["stone", "andesite", "tuff"],
  },
  // **主島 → 門。** いちばん長く、いちばん立派。白い石を混ぜる
  {
    ax: 1,
    az: 3,
    bx: 0,
    bz: 32,
    half: 2,
    thick: 7,
    deck: ["stone_bricks", "quartz_block", "smooth_quartz", "calcite", "stone_bricks"],
    arch: ["stone_bricks", "stone", "andesite", "calcite"],
    rail: "stone_brick_wall",
    post: { mat: "quartz_pillar", every: 6 },
  },
  // **主島 → 氷の島。** 木の桟。柵が付いているぶん、まだ渡りやすい
  {
    ax: 5,
    az: -2,
    bx: 30,
    bz: 5,
    half: 2,
    thick: 3,
    deck: WOOD,
    arch: ["spruce_log", "spruce_planks", "spruce_log"],
    rail: "spruce_fence",
    post: { mat: "spruce_log", every: 8 },
  },
  // **主島 → 西の小島。** 岩を削っただけ。**欄干が無い**
  {
    ax: -12,
    az: -9,
    bx: -34,
    bz: -15,
    half: 1,
    thick: 4,
    deck: ["cobblestone", "andesite", "cobblestone", "mossy_cobblestone"],
    arch: ["stone", "andesite", "tuff", "cobblestone"],
  },
  // **主島 → 南の島。** 雪が積もって、欄干があったのか分からない
  {
    ax: -8,
    az: 1,
    bx: -26,
    bz: 24,
    half: 1,
    thick: 4,
    deck: ["snow", "calcite", "diorite", "snow"],
    arch: ["calcite", "diorite", "stone", "andesite"],
  },
  // **主島 → 雲の小島。** 雲を踏んで渡る。欄干も柱も無い
  { ax: 4, az: -13, bx: 20, bz: -26, half: 1, thick: 3, deck: CLOUD, arch: CLOUD },
  // **雲の小島 → 氷の島。** いちばん長い橋。凍って光る
  {
    ax: 21,
    az: -24,
    bx: 31,
    bz: -2,
    half: 2,
    thick: 5,
    deck: FROSTED,
    arch: ["packed_ice", "calcite", "blue_ice", "diorite"],
    rail: "snow",
    post: { mat: "packed_ice", every: 9 },
  },
  // **発着 → 窪みの小島。** 脇道。細く、欄干も無い
  {
    ax: -6,
    az: -37,
    bx: -24,
    bz: -30,
    half: 1,
    thick: 4,
    deck: ["cobblestone", "cobblestone", "andesite", "coarse_dirt"],
    arch: ["stone", "tuff", "andesite"],
  },
  // **窪みの小島 → 西の小島。** 同じ脇道の続き
  {
    ax: -26,
    az: -32,
    bx: -34,
    bz: -16,
    half: 1,
    thick: 4,
    deck: ["coarse_dirt", "cobblestone", "cobblestone", "mossy_cobblestone"],
    arch: ["stone", "andesite", "tuff", "cobblestone"],
  },
  // **主島 → 止まり木。** 参道から east 側へ分かれる
  {
    ax: 2,
    az: -1,
    bx: 13,
    bz: 17,
    half: 1,
    thick: 5,
    deck: ["andesite", "cobblestone", "stone_bricks", "cobblestone"],
    arch: ["stone", "andesite", "cobblestone"],
    rail: "cobblestone_wall",
  },
  // **止まり木 → 門。** 門へ着くもう 1 本
  {
    ax: 14,
    az: 15,
    bx: 4,
    bz: 28,
    half: 2,
    thick: 6,
    deck: ["stone_bricks", "andesite", "cracked_stone_bricks", "calcite"],
    arch: ["stone_bricks", "stone", "andesite"],
    rail: "stone_brick_wall",
    post: { mat: "stone_bricks", every: 8 },
  },
  // **氷の島 → 東奥の岩。** 短い木の桟。**欄干が落ちている**
  { ax: 31, az: 12, bx: 26, bz: 25, half: 1, thick: 3, deck: WOOD, arch: ["spruce_log", "spruce_planks"] },
  // **東奥の岩 → 門。** 苔むした石橋
  {
    ax: 24,
    az: 27,
    bx: 10,
    bz: 30,
    half: 2,
    thick: 4,
    deck: ["mossy_stone_bricks", "stone_bricks", "cracked_stone_bricks", "mossy_cobblestone"],
    arch: ["stone", "mossy_cobblestone", "andesite", "cobblestone"],
    rail: "mossy_cobblestone",
    post: { mat: "cracked_stone_bricks", every: 7 },
  },
];
