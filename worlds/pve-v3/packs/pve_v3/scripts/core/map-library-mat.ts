/**
 * 16. 大書庫——**材の引き方だけ。** 床・2 階の床・天井・石。
 *
 * 寸法と間取りは `map-library-plan.ts`。
 *
 * > ### **1 マスごとに引く**（`spec/14-map-build.md` 0-7）
 * >
 * > 区画で塗り分けると、**升目の大きい塗り絵**になる。
 * > **木と石の対比**が大書庫の見どころなので、混ざり方だけは場所で変える。
 */

import { noise } from "./map-frame.js";
import { AMBULATORY_R, SEED, octR } from "./map-library-plan.js";

/**
 * 床。**木と石を対比させる**——書架のあたりは板、外周の回廊は石。
 *
 * **1 マスごとに引く**（0-7）。区画で塗り分けない。
 */
export function floorAt(x: number, z: number): string {
  const r = noise(SEED + 31, x, 3, z);
  if (octR(x, z) >= AMBULATORY_R) {
    if (r < 0.14) return "andesite";
    if (r < 0.26) return "polished_andesite";
    if (r < 0.32) return "cobblestone";
    return "stone_bricks";
  }
  // **明るい石を撒きすぎると市松に見えた**（0-8-1 で絵にして分かった）。
  // **板を主にして、差し色は 1 割まで。**
  if (r < 0.08) return "spruce_planks";
  if (r < 0.11) return "stripped_dark_oak_log";
  if (r < 0.13) return "polished_andesite";
  return "dark_oak_planks";
}

/** 2 階の床。**踏まれる所なので、擦れた板を混ぜる** */
export function deckAt(x: number, z: number): string {
  const r = noise(SEED + 37, x, 5, z);
  if (r < 0.09) return "spruce_planks";
  if (r < 0.12) return "stripped_spruce_log";
  return "dark_oak_planks";
}

/** 翼の天井。**板張り。梁は `map-library-deck.ts` が載せる** */
export function ceilAt(x: number, z: number): string {
  const r = noise(SEED + 43, x, 9, z);
  if (r < 0.12) return "spruce_planks";
  if (r < 0.18) return "stripped_dark_oak_log";
  return "dark_oak_planks";
}

/**
 * 石。**壁と吹き抜けの天井。**
 *
 * **苔は低い所へ寄せる**——床際ほど湿る。
 */
export function stoneAt(x: number, y: number, z: number): string {
  const wet = y <= 2 ? 1 : y <= 5 ? 0.5 : 0;
  const r = noise(SEED + 17, x, y, z);
  if (r < 0.07 + 0.12 * wet) return "mossy_stone_bricks";
  if (r < 0.13 + 0.16 * wet) return "mossy_cobblestone";
  if (r < 0.22) return "cracked_stone_bricks";
  if (r < 0.34) return "polished_andesite";
  return "stone_bricks";
}
