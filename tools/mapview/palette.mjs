/**
 * ブロック → 色の対応。
 *
 * **見た目の判断に使うので、実際の色に寄せる。**
 * 正確な再現は目指さない。「木か石か」「明るいか暗いか」が分かれば足りる。
 */
export const PALETTE = {
  air: null,

  // 木材（明るい〜暗い）
  oak_planks:      [162, 130, 78],
  spruce_planks:   [114,  84,  48],
  dark_oak_planks: [ 66,  43,  20],
  oak_log:         [109,  85,  50],
  spruce_log:      [ 58,  38,  20],
  oak_stairs:      [162, 130, 78],
  cobblestone_stairs: [127, 127, 127],
  stone_stairs:       [126, 126, 126],
  oak_slab:        [162, 130, 78],
  oak_fence:       [140, 112, 67],

  // 石レンガ
  stone_bricks:         [122, 122, 122],
  mossy_stone_bricks:   [111, 122, 103],
  cracked_stone_bricks: [113, 113, 113],
  chiseled_stone_bricks:[118, 118, 118],
  stone_brick_stairs:   [122, 122, 122],
  stone_brick_slab:     [122, 122, 122],
  stone_brick_wall:     [115, 115, 115],
  smooth_stone:         [158, 158, 158],
  cobblestone:          [127, 127, 127],

  // 葉（木の一部として使う）
  oak_leaves:    [ 62, 112,  42],
  spruce_leaves: [ 47,  79,  47],
  azalea_leaves: [ 88, 122,  49],
  moss_block:    [ 89, 109,  45],
  vine:          [ 60,  98,  38],

  // 石をもう少し混ぜる（単調さを避ける）
  stone:              [126, 126, 126],
  andesite:           [136, 136, 137],
  polished_andesite:  [132, 135, 134],
  deepslate_bricks:   [ 71,  71,  75],
  deepslate_tiles:    [ 54,  54,  57],
  gravel:             [131, 127, 126],
  mud_bricks:         [137, 105,  80],

  // ガラス
  glass_pane:   [200, 224, 228],
  glass:        [190, 218, 222],

  // 目印になるもの
  glowstone:   [248, 215, 137],
  lantern:     [235, 176,  92],
  white_concrete: [207, 213, 214],
  red_concrete:   [142,  32,  32],
  blue_concrete:  [ 44,  46, 143],
  light_blue_concrete: [ 58, 175, 217],

  // 資源（ジェネレータの位置を示す仮のブロック）
  iron_block:    [220, 220, 220],
  gold_block:    [246, 208,  61],
  diamond_block: [ 98, 219, 214],
  emerald_block: [ 41, 205,  90],
};

/** 未登録のブロックが来たら目立つ色にする。見落とさないため */
export const UNKNOWN = [255, 0, 255];

export function colorOf(id) {
  if (id === "air" || id === undefined || id === null) return null;
  return PALETTE[id] ?? UNKNOWN;
}
