/**
 * 廃村——**家の材の組。** 8 通り。
 *
 * > ### 同じ家を並べない（`spec/14-map-build.md` 0-6）
 * >
 * > **石積み・木組み・煉瓦・切石・泥壁・黒石・凝灰岩・漆喰**——
 * > 村の中でも家ごとに建て方が違った、という体にする。
 *
 * > ### 屋根の色は、8 つとも離す
 * >
 * > 最初は焦茶ばかりで、**上から見ると黒い塊が並んでいるだけ**だった。
 * > **素焼き・煉瓦・白樺・樫・唐檜・切石・安山岩・暗樫**——
 * > **明暗と色味の両方を散らす。**
 */

/** 材の組 */
export interface Kit {
  /** 土台（y 1〜2） */
  readonly foot: readonly string[];
  /** 壁（y 3 以上） */
  readonly wall: readonly string[];
  /** 隅の柱 */
  readonly post: string;
  /** 屋根 */
  readonly roof: string;
  /** 床 */
  readonly floor: string;
}

/** 8 通りの材。**家ごとに 1 つ選ぶ** */
export const KITS: readonly Kit[] = [
  {
    foot: ["cobblestone", "mossy_cobblestone", "andesite", "cobblestone"],
    wall: ["cobblestone", "mossy_cobblestone", "cracked_stone_bricks", "andesite"],
    post: "spruce_log",
    roof: "dark_oak_planks",
    floor: "spruce_planks",
  },
  {
    foot: ["cobblestone", "andesite", "cobblestone", "mossy_cobblestone"],
    wall: ["oak_planks", "spruce_planks", "stripped_dark_oak_log", "oak_planks"],
    post: "oak_log",
    roof: "oak_planks",
    floor: "oak_planks",
  },
  {
    foot: ["brick_block", "hardened_clay", "cobblestone", "cobblestone"],
    wall: ["brick_block", "hardened_clay", "brown_terracotta", "granite"],
    post: "dark_oak_log",
    roof: "hardened_clay",
    floor: "brick_block",
  },
  {
    foot: ["stone_bricks", "cracked_stone_bricks", "cobblestone", "andesite"],
    wall: ["stone_bricks", "mossy_stone_bricks", "cracked_stone_bricks", "chiseled_stone_bricks"],
    post: "stone_bricks",
    roof: "stone_brick_slab",
    floor: "stone_bricks",
  },
  {
    foot: ["cobblestone", "tuff", "cobblestone", "andesite"],
    wall: ["packed_mud", "hardened_clay", "brown_terracotta", "packed_mud"],
    post: "oak_log",
    roof: "spruce_planks",
    floor: "coarse_dirt",
  },
  {
    foot: ["cobbled_deepslate", "tuff", "deepslate", "cobblestone"],
    wall: ["deepslate_bricks", "cracked_deepslate_bricks", "cobbled_deepslate", "gray_terracotta"],
    post: "spruce_log",
    roof: "brick_block",
    floor: "cobbled_deepslate",
  },
  {
    foot: ["tuff", "polished_tuff", "andesite", "cobblestone"],
    wall: ["tuff_bricks", "chiseled_tuff", "tuff", "polished_tuff"],
    post: "spruce_log",
    roof: "birch_planks",
    floor: "polished_tuff",
  },
  {
    foot: ["cobblestone", "andesite", "calcite", "cobblestone"],
    wall: ["mushroom_stem", "calcite", "dripstone_block", "mushroom_stem"],
    post: "dark_oak_log",
    roof: "andesite_slab",
    floor: "birch_planks",
  },
];
