/**
 * 戦場 14「円形闘技場」の**材**。**純粋な計算だけ**——手順は積まない。
 *
 * **形は `map-arena-form.ts`。** そこが決めた高さを見て、
 * **1 マスごとに石を引く**（`14-map-build.md` 0-7）。
 *
 * > ### **石レンガ調で、質素に**（2026-09-06 決定）
 * >
 * > **灰色に収める。** 砂岩・煉瓦・暖色は使わない。
 * > **模様はまばら**——石レンガを主にして、ひび・苔・丸石をときどき混ぜる程度。
 * > **凝った紋様は入れない。**
 *
 * > ### **落ちるブロックを使わない**（0-11）
 * >
 * > `gravel` / `sand` / `*_concrete_powder` は**下が空だと崩れる。**
 *
 * > ### **半ブロックは使わない**
 * >
 * > `stone_brick_slab` は向きが付く。**置いた向きで見え方が変わる**ので入れない。
 */

import { noise, speckle } from "./map-frame.js";
import { CAP_OUT, distOf, FLOOR_R, inGatePier, LEDGE_OUT, SEED, WALL_MID } from "./map-arena-form.js";

/**
 * 段差下（広い床）。**石レンガを主にして、まばらに崩す。**
 *
 * 6 枠のうち **3 枠を `stone_bricks`** にしてあるので、
 * **半分は素の石レンガ**になる——それが「まばら」の意味（0-7）。
 */
const FLOOR_MATS = ["stone_bricks", "stone_bricks", "cobblestone", "cracked_stone_bricks", "stone_bricks", "andesite"];
/** 床にたまに出る苔。**輪にしない。ただまばらに散らす**（0-7） */
const FLOOR_MOSS = [
  "mossy_stone_bricks",
  "mossy_cobblestone",
  "mossy_stone_bricks",
  "cobblestone",
  "stone",
  "andesite",
];

/**
 * 段差上（歩廊）。**床よりはっきり明るくする。**
 *
 * > ### 段差が明るさでも分かるようにする（2026-09-06 に絵を見て直した）
 * >
 * > 上も下も同じ石レンガで塗ったら、**上から見て 2 段になっていることが読めなかった。**
 * > **形は変えず、明るさだけで分ける。**
 */
const LEDGE_MATS = [
  "smooth_stone",
  "polished_andesite",
  "smooth_stone",
  "andesite",
  "polished_andesite",
  "stone_bricks",
];
/** 段差上の内外の縁。**暗い 2 本の線で歩廊を挟む**——それだけで縁が締まる */
const EDGE_MATS = ["andesite", "cobblestone", "stone", "andesite", "cracked_stone_bricks", "cobblestone"];

/** 外壁の天。**歩廊より暗く落として、壁の厚みを見せる** */
const WALL_MATS = ["stone_bricks", "cracked_stone_bricks", "stone_bricks", "cobblestone", "andesite", "stone"];
/** 笠石。**壁の頭を明るい 1 本の輪にして、外形を締める** */
const CAP_MATS = ["smooth_stone", "polished_andesite", "smooth_stone", "polished_andesite", "andesite", "smooth_stone"];
/** 門の控え壁 */
const PIER_MATS = [
  "stone_bricks",
  "chiseled_stone_bricks",
  "stone_bricks",
  "polished_andesite",
  "stone_bricks",
  "cracked_stone_bricks",
];
/** 中身（見えない所）。**掘れば違う石が出る** */
const BODY_MATS = ["stone", "cobblestone", "andesite", "stone", "tuff", "stone_bricks"];

/**
 * その柱の表面。**1 マスごとに引く**（0-7）。
 *
 * **区画で塗り分けない。** 引く先を場所ごとに変えるだけで、
 * **同じ灰色の中に、石レンガの目がまばらに散る。**
 */
export function surfaceAt(x: number, z: number): string {
  const r = distOf(x, z);
  if (inGatePier(x, z) && r <= LEDGE_OUT) return speckle(SEED + 97, x, z, PIER_MATS);
  if (r <= FLOOR_R) {
    // ---- 苔は**輪にも塊にもしない。** 1 マスずつ、たまに出るだけ
    return speckle(SEED + 79, x, z, noise(SEED + 7, x, z) > 0.88 ? FLOOR_MOSS : FLOOR_MATS);
  }
  if (r <= LEDGE_OUT) {
    // ---- 歩廊の内外 1 マスだけ、明るい縁石にする
    return r < 39 || r > 42.4 ? speckle(SEED + 31, x, z, EDGE_MATS) : speckle(SEED + 43, x, z, LEDGE_MATS);
  }
  if (r <= WALL_MID) return speckle(SEED + 101, x, z, WALL_MATS);
  return speckle(SEED + 29, x, z, CAP_MATS);
}

/** その柱の中身 */
export function bodyAt(x: number, z: number): string {
  return speckle(SEED + 17, x, z, BODY_MATS);
}

/** いちばん外の輪か。**笠石の面を貼るときに使う** */
export function onCapEdge(r: number): boolean {
  return r > CAP_OUT - 1.2;
}
