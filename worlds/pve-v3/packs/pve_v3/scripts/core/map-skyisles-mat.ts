/**
 * 戦場 02「雲の上の浮島」——**材の引き方。純粋。**
 *
 * > ### まばら ＝ 1 マスごとに違う（0-7）
 * >
 * > **区画ごとに主役を決めて塗り分けるのは、升目の大きい塗り絵。**
 * > ここでは **1 マスごとに `speckle` を引き**、そのうえで
 * > **「霜の寄り」だけをゆっくり動かす**——場所によって白の混ざり方が変わる。
 */

import { noise, speckle, wave } from "./map-frame.js";
import { SEED, type Ground, type Kind } from "./map-skyisles-shape.js";

/** 雲の材。**白 1 色にしない**——薄灰と乳白を混ぜると、平らに見えない */
export const CLOUD: readonly string[] = ["snow", "calcite", "quartz_block", "smooth_quartz", "snow", "diorite"];

/** 霜。**日の当たらない側に寄せる**（0-7） */
const FROST: readonly string[] = ["snow", "calcite", "snow", "diorite", "packed_ice", "calcite"];

/** 島ごとの表面。**中と縁で引き分ける**——縁は崩れて石が出る */
const SKIN: Readonly<Record<Kind, { readonly core: readonly string[]; readonly rim: readonly string[] }>> = {
  pave: {
    core: [
      "stone_bricks",
      "stone_bricks",
      "cracked_stone_bricks",
      "mossy_stone_bricks",
      "andesite",
      "chiseled_stone_bricks",
    ],
    rim: ["cobblestone", "andesite", "stone", "cobblestone", "calcite", "mossy_cobblestone"],
  },
  moss: {
    core: ["moss_block", "moss_block", "podzol", "coarse_dirt", "moss_block", "mossy_cobblestone", "andesite"],
    rim: ["andesite", "stone", "cobblestone", "calcite", "tuff", "cobblestone", "snow"],
  },
  ice: {
    // **氷は滑る。** 歩く面は雪と方解石を厚くして、氷は差し色にする
    core: ["snow", "packed_ice", "calcite", "snow", "blue_ice", "snow"],
    rim: ["snow", "calcite", "packed_ice", "diorite", "andesite", "snow"],
  },
  bare: {
    core: ["andesite", "stone", "cobblestone", "tuff", "cobblestone", "diorite"],
    rim: ["cobblestone", "cobblestone", "andesite", "tuff", "calcite", "stone"],
  },
  snow: {
    core: ["snow", "calcite", "snow", "diorite", "polished_diorite", "smooth_stone"],
    rim: ["snow", "calcite", "diorite", "quartz_block", "andesite", "snow"],
  },
  cloud: { core: CLOUD, rim: CLOUD },
};

/** 地層。**下ほど古い石**にすると、崩れた断面が地層に見える */
const BODY: Readonly<
  Record<Kind, { readonly soil: readonly string[]; readonly rock: readonly string[]; readonly deep: readonly string[] }>
> = {
  pave: {
    soil: ["dirt", "coarse_dirt", "cobblestone", "andesite"],
    rock: ["stone", "andesite", "tuff", "cobblestone", "diorite"],
    deep: ["deepslate", "tuff", "cobbled_deepslate", "deepslate"],
  },
  moss: {
    soil: ["dirt", "coarse_dirt", "podzol", "cobblestone"],
    rock: ["stone", "andesite", "tuff", "diorite", "cobblestone"],
    deep: ["deepslate", "tuff", "cobbled_deepslate", "deepslate"],
  },
  ice: {
    soil: ["packed_ice", "calcite", "snow", "blue_ice"],
    rock: ["calcite", "diorite", "stone", "andesite", "packed_ice"],
    deep: ["deepslate", "tuff", "blue_ice", "deepslate"],
  },
  bare: {
    soil: ["cobblestone", "coarse_dirt", "andesite", "tuff"],
    rock: ["stone", "andesite", "cobblestone", "tuff", "diorite"],
    deep: ["deepslate", "cobbled_deepslate", "tuff", "deepslate"],
  },
  snow: {
    soil: ["calcite", "snow", "diorite", "cobblestone"],
    rock: ["calcite", "diorite", "stone", "andesite", "tuff"],
    deep: ["deepslate", "tuff", "cobbled_deepslate", "deepslate"],
  },
  cloud: { soil: CLOUD, rock: CLOUD, deep: CLOUD },
};

/**
 * **霜の寄り。** 長い波で決めたうえに、1 マスごとの粒を足して境目を散らす。
 *
 * **波だけだと、雪の輪郭がくっきり出て塗り絵になる。**
 */
function frosty(x: number, z: number): boolean {
  const lean = (wave(SEED + 41, x, z, 16) + 1) / 2;
  return lean + noise(SEED + 43, x, z) * 0.5 > 0.92;
}

/** そこの表面。**1 マスごとに引く**（0-7） */
export function skinOf(g: Ground): string {
  const kind = g.t > 1 ? "cloud" : g.isle.kind;
  if (kind === "cloud") return speckle(SEED + 75, g.x, g.z, CLOUD);
  const table = SKIN[kind];
  // **縁の境目も 1 マスごとに揺らす**——同心円の輪に見せない
  if (g.t > 0.8 + noise(SEED + 13, g.x, g.z) * 0.2) return speckle(SEED + 5, g.x, g.z, table.rim);
  if (kind !== "ice" && frosty(g.x, g.z)) return speckle(SEED + 17, g.x, g.z, FROST);
  return speckle(SEED + 9, g.x, g.z, table.core);
}

/** そこの地層 3 種。**柱 1 本ぶんまとめて引く**（帯ごとに `fill` するため） */
export function bodyOf(g: Ground): { readonly soil: string; readonly rock: string; readonly deep: string } {
  const kind = g.t > 1 ? "cloud" : g.isle.kind;
  const table = BODY[kind];
  return {
    soil: speckle(SEED + 51, g.x, g.z, table.soil),
    rock: speckle(SEED + 53, g.x, g.z, table.rock),
    deep: speckle(SEED + 55, g.x, g.z, table.deep),
  };
}
