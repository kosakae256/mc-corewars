/**
 * 深淵の橋の**材**——どのマスに、どの石を置くか。**純粋。**
 *
 * > ### **1 マスごとに引く**（`14-map-build.md` 0-7）
 * >
 * > 区画ごとに主役を決めて塗り分けると、**升目の大きい塗り絵**になる。
 * > **場所ごとに引く表を変える**だけにして、引くのは 1 マスずつ。
 *
 * > ### 色で道を示す
 * >
 * > 橋も奈落も黒い。**真ん中の踏み跡と、門前の敷石だけを明るく**して、
 * > **どちらへ進むのかが床の色で分かる**ようにしてある（0-3）。
 */

import { speckle } from "./map-frame.js";
import { SEED, type Kind } from "./map-netherspan-shape.js";

/** 橋の敷石。**踏まれて磨り減った黒い石。**奈落の上なので、暗く落とす */
const PAVE = [
  "deepslate_tiles",
  "cracked_deepslate_tiles",
  "polished_deepslate",
  "deepslate_bricks",
  "cobbled_deepslate",
  "basalt",
];

/** 踊り場の敷石。**時代の違う石が継ぎ足されている** */
const PLAZA = [
  "polished_blackstone",
  "polished_blackstone_bricks",
  "cracked_polished_blackstone_bricks",
  "deepslate_tiles",
  "blackstone",
  "chiseled_polished_blackstone",
];

/** 踊り場の輪と筋の象嵌。**暗い床にはっきり出るよう、明るい石を使う** */
const INLAY = ["polished_andesite", "andesite", "tuff_bricks", "polished_tuff", "smooth_stone"];

/**
 * 踏み跡。**真ん中だけ磨り減って、下の明るい石が出ている。**
 *
 * > ### 明るい筋が、そのまま道しるべになる
 * >
 * > **湧いた所からゲートまで、床の色で線が引かれている**状態にしたい（0-3）。
 * > 暗い橋の上で、**どちらへ進むのかが色で分かる。**
 */
const TRACK = ["polished_andesite", "andesite", "tuff", "polished_tuff", "cobblestone"];

/** 手前の岩棚の地面。**割れた岩と砂利。**橋より明るくして、渡る先を暗く見せる */
const ROCK_TOP = ["cobbled_deepslate", "tuff", "basalt", "cobblestone", "andesite", "deepslate"];

/**
 * 門前の敷石。**ここだけ明るい石**にする。
 *
 * > ### 行き先が、床の色で分かるようにする
 * >
 * > 橋も奈落も黒いので、**暗い中に明るい四角が 1 つ**あれば、
 * > **そこがゴールだと遠くから分かる**（0-3 の狙い）。
 */
const COURT = [
  "polished_andesite",
  "andesite",
  "tuff_bricks",
  "chiseled_stone_bricks",
  "stone_bricks",
  "polished_tuff",
];

/** 奥の橋台。**同じ岩でも、こちらは人が積んだ石**——ゲートに近づくほど作り物になる */
const BASTION = [
  "polished_blackstone_bricks",
  "cracked_polished_blackstone_bricks",
  "deepslate_bricks",
  "cobbled_deepslate",
  "tuff_bricks",
  "blackstone",
];

/** 継ぎ直した板。**そこだけ木の色になる** */
const PLANK = ["dark_oak_planks", "spruce_planks", "dark_oak_planks", "oak_planks"];

/** 縁の立ち上がりと柱の石 */
export const RIM = [
  "cobbled_deepslate",
  "deepslate_bricks",
  "tuff",
  "basalt",
  "cracked_deepslate_bricks",
  "blackstone",
];
export const PILLAR = [
  "polished_blackstone_bricks",
  "deepslate_bricks",
  "cracked_deepslate_bricks",
  "polished_deepslate",
];
export const GATE_MAT = [
  "polished_blackstone_bricks",
  "cracked_polished_blackstone_bricks",
  "polished_blackstone",
  "blackstone",
];

/**
 * その 1 マスの敷石。**1 マスごとに引く**（0-7）。
 *
 * 区画ごとに主役を決めて塗り分けると、**升目の大きい塗り絵**になる。
 * ここでは**場所ごとに引く表を変える**だけで、引くのは 1 マスずつ。
 */
export function paveAt(x: number, z: number, kind: Kind): string {
  if (kind === "plank") return speckle(SEED + 51, x, z, PLANK);
  if (kind === "rock") return rockAt(x, z);
  if (Math.abs(x) <= 1 && kind !== "spur") return speckle(SEED + 53, x, z, TRACK);
  if (kind === "landing") return landingAt(x, z);
  return speckle(SEED + 56, x, z, PAVE);
}

/** 両端の岩の床。**手前は生の岩、奥は積んだ石、その芯に門前の敷石** */
function rockAt(x: number, z: number): string {
  if (z <= 26) return speckle(SEED + 52, x, z, ROCK_TOP);
  if (Math.hypot(x, z - 40) < 8.5) return speckle(SEED + 59, x, z, COURT);
  return speckle(SEED + 57, x, z, BASTION);
}

/**
 * 踊り場の床。**輪の象嵌と、12 本の放射の筋を敷く。**
 *
 * > ### 平らな広間は、上から見ると一枚の板になる
 * >
 * > **人が作った所は揃っていてよい**（0-7 の但し書き）。
 * > **模様を敷いて、ここが「造られた場所」だと分かるようにする。**
 */
function landingAt(x: number, z: number): string {
  const d = Math.hypot(x, z);
  if (d > 6.4 && d < 8.2) return speckle(SEED + 54, x, z, INLAY);
  const a = Math.atan2(z, x);
  const k = Math.round((a * 6) / Math.PI);
  if (d > 2.6 && d < 6.4 && Math.abs(a - (k * Math.PI) / 6) < 0.11) return speckle(SEED + 54, x, z, INLAY);
  if (d < 2.2) return speckle(SEED + 58, x, z, INLAY);
  return speckle(SEED + 55, x, z, PLAZA);
}
