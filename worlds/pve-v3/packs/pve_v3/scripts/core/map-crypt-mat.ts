/**
 * 15. 地下墓所——**材の引き方。**
 *
 * 間取りは `map-crypt-plan.ts`。決まりは `spec/14-map-build.md` 0-7。
 *
 * > ### **深層岩で組む**
 * >
 * > `stronghold` が石レンガ、`aqueduct` が苔むした玉石なので、
 * > **墓所は深層岩**にして、**同じ地下でも別の場所だと分かる**ようにする。
 * > 灰色が濃いぶん、**苔の緑と魂のランタンの青が効く。**
 *
 * > ### **苔は「低い所・水際」に寄せる**
 * >
 * > 一様に撒くと塗り絵に見える（0-7）。
 * > **沈んだ墓室のまわりと、水の納骨廊**を湿った一帯にする。
 */

import { GROUND, noise, smoothWave } from "./map-frame.js";
import { ROT, SEED } from "./map-crypt-plan.js";

/**
 * **湿り**（0〜1）。苔をどれだけ引くか。
 *
 * **床際ほど濃い**のは、水が下に溜まるから。
 * **`smoothWave` の寄り**を掛けて、湿った一帯と乾いた一帯を作る。
 */
export function damp(x: number, y: number, z: number): number {
  const low = y <= GROUND + 1 ? 1 : y <= GROUND + 3 ? 0.5 : 0.1;
  const bias = (smoothWave(SEED + 29, x, z, 20) + 1) / 2;
  // **水際だけを濃くする。** 沈んだ墓室の縁と、西の水の納骨廊
  const d = Math.hypot(x - ROT.x, z - ROT.z);
  const near = (d > 4 && d < ROT.r + 4) || (x < -28 && z > 0) ? 1 : 0;
  // **離れた所はほとんど乾いている**——一様に苔を撒くと塗り絵になる（0-7）
  return Math.min(1, low * (0.12 + 0.3 * bias) + near * low * 0.6 * bias);
}

/**
 * 壁と柱の石。**1 マスごとに引く**（0-7）。
 *
 * **深層岩を 4 種混ぜる**——同じ灰色でも、割れ・磨き・玉石で肌が変わる。
 */
export function stoneAt(x: number, y: number, z: number): string {
  const wet = damp(x, y, z);
  const r = noise(SEED + 17, x, y, z);
  if (r < 0.04 + 0.18 * wet) return "mossy_cobblestone";
  if (r < 0.07 + 0.26 * wet) return "mossy_stone_bricks";
  if (r < 0.22) return "cracked_deepslate_bricks";
  if (r < 0.3) return "deepslate_tiles";
  if (r < 0.36) return "cobbled_deepslate";
  if (r < 0.42) return "polished_deepslate";
  return "deepslate_bricks";
}

/** 床。**踏まれる所なので、割れと砂利を多めに** */
export function floorAt(x: number, z: number): string {
  const wet = damp(x, GROUND, z);
  const r = noise(SEED + 31, x, 3, z);
  if (r < 0.01 + 0.13 * wet) return "mossy_cobblestone";
  if (r < 0.08) return "cobblestone";
  if (r < 0.2) return "cracked_deepslate_tiles";
  if (r < 0.29) return "cobbled_deepslate";
  if (r < 0.4) return "polished_deepslate";
  return "deepslate_tiles";
}

/** 天井。**苔は付きにくい**ので、ひびと玉石を主にする */
export function ceilAt(x: number, z: number): string {
  const r = noise(SEED + 43, x, 9, z);
  if (r < 0.16) return "cracked_deepslate_bricks";
  if (r < 0.22) return "cobbled_deepslate";
  if (r < 0.24) return "mossy_cobblestone";
  if (r < 0.34) return "deepslate_tiles";
  return "deepslate_bricks";
}

/** 塊の天面に混ぜる材。**上から見たとき、のっぺりした円盤にしない** */
export const CAP_MATS = ["stone", "andesite", "deepslate", "cobbled_deepslate", "cobblestone", "dirt", "tuff"];

/** 骨堂の壁。**骨と、それを押さえる石を混ぜる** */
export function boneAt(x: number, y: number, z: number): string {
  const r = noise(SEED + 53, x, y, z);
  if (r < 0.62) return "bone_block";
  if (r < 0.72) return "skeleton_skull";
  if (r < 0.84) return "cobbled_deepslate";
  return "deepslate_tiles";
}

/**
 * 崩れて流れ込んだ土。
 *
 * > ### **土だけで積むと、墓所の中に土手ができる**（2026-09-06 に絵で見つけた）
 * >
 * > `dirt` と `podzol` は暗い墓所の中で**明るい橙**として浮き、
 * > **崩れた所ではなく、花壇に見えた。**
 * > **砂利・泥・深層岩を半分以上混ぜて、落ちてきた瓦礫に寄せる。**
 */
export function soilAt(x: number, y: number, z: number): string {
  const r = noise(SEED + 59, x, y, z);
  if (r < 0.16) return "coarse_dirt";
  if (r < 0.28) return "dirt";
  if (r < 0.48) return "cobblestone";
  if (r < 0.62) return "mud";
  if (r < 0.82) return "cobbled_deepslate";
  return "packed_mud";
}

/**
 * 柱の石。**壁より明るい石を主にする。**
 *
 * > ### **柱と壁を同じ石で作ると、柱が消える**（2026-09-06 に絵で見つけた）
 * >
 * > 深層岩は 4 種とも同じ濃さの灰色なので、
 * > **暗い部屋では柱が壁に溶けて、ただの黒い板に見えた。**
 * > **玄武岩（`polished_basalt`）を混ぜて、柱だけ 1 段明るくする。**
 */
export function pillarAt(x: number, y: number, z: number): string {
  const r = noise(SEED + 67, x, y, z);
  if (y <= GROUND + 1 && r < 0.2) return "mossy_cobblestone";
  if (r < 0.13) return "cracked_deepslate_bricks";
  if (r < 0.26) return "deepslate_tiles";
  if (r < 0.6) return "polished_basalt";
  return "polished_deepslate";
}

/**
 * **白い象嵌。**
 *
 * **暗い墓所では、細い白の筋だけが遠くから見える。**
 * 参道の縁・沈んだ墓室の口・玄室の輪に使う。**面で使わない**——帯と輪だけ。
 */
export const INLAY = "calcite";
