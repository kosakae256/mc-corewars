/**
 * 18. 雲海——**材の引き方。純粋。**
 *
 * 形は `map-cloudsea-shape.ts`、並べ方は `map-cloudsea.ts`。**ここは材だけ。**
 *
 * > ### 雲は、白い色付きガラスと羊毛でできている（2026-09-06 に決めた）
 * >
 * > **石（`calcite` / `diorite` / `smooth_quartz`）を主役にすると、白い岩に見える。**
 * > **羊毛のもこもこ**と、**ガラスの抜ける光**が、雲を雲に見せる。
 * > **石は脇役**——`snow` / `calcite` / `white_concrete` / `smooth_quartz` を
 * > **少しだけ**混ぜて、白 1 色の単調さだけ避ける。
 *
 * > ### 高さで引き分ける
 * >
 * > | 所 | 何を主に |
 * > | --- | --- |
 * > | **天面**（歩く所） | **羊毛。** ガラスも混ぜる——**踏めるので困らない** |
 * > | **天面の窪み** | 灰の羊毛と粘土。**1 マスの段差を影として読ませる**（0-7） |
 * > | **天面の縁** | **ガラスを多く。** 1 段しかない縁が、溶けて薄くなって見える |
 * > | **胴** | 羊毛と雪 |
 * > | **腹** | 羊毛を灰へ寄せる。**下から見上げたときの陰り** |
 * > | **裾・底** | **ほぼガラス。** 光が抜けるのが、いちばん雲に見える |
 *
 * **落ちるブロックは使わない**（`14-map-build.md` 0-11）——
 * `*_concrete_powder` ではなく **`white_concrete`**。
 */

import { speckle } from "./map-frame.js";

/** 種。**`map-cloudsea-shape.ts` と同じ** */
const SEED = 4507;

/**
 * 天面（歩く所）。**羊毛が主。**
 *
 * > ### 雲は、白い色付きガラスと羊毛でできている（2026-09-06 に決めた）
 * >
 * > **石（`calcite` / `diorite` / `smooth_quartz`）を主役にすると、白い岩に見える。**
 * > **羊毛のもこもこ**と、**ガラスの抜ける光**が、雲を雲に見せる。
 * > **石は脇役**——`snow` / `calcite` / `white_concrete` / `smooth_quartz` を
 * > **少しだけ**混ぜて、白 1 色の単調さだけ避ける。
 *
 * **ガラスも歩ける**ので、踏む面に混ぜて構わない。
 */
const DECK: readonly string[] = [
  "white_wool",
  "white_wool",
  "white_stained_glass",
  "white_wool",
  "snow",
  "white_concrete",
];

/**
 * 天面の窪み。**起伏の低い側だけ、ほんの少し暗い材へ寄せる**（0-7）。
 *
 * > ### 白 1 色だと、1 マスの段差が見えない
 * >
 * > 上面はどのマスも同じ向きなので、**段差があっても明るさが変わらない。**
 * > **窪んだ側を灰の羊毛と粘土に寄せる**と、そこが影として読めて、雲の丸みが出る。
 */
const HOLLOW: readonly string[] = [
  "white_wool",
  "light_gray_wool",
  "white_stained_glass",
  "light_gray_wool",
  "clay",
  "snow",
];

/** 天面の縁。**ガラスを多く**——1 段しかない縁が、溶けて薄くなっていくように見える */
const FRINGE: readonly string[] = [
  "white_stained_glass",
  "white_stained_glass",
  "white_wool",
  "white_stained_glass",
  "calcite",
  "snow",
];

/** 胴。**羊毛と雪。** 白の濃さだけ散らす */
const BODY: readonly string[] = [
  "white_wool",
  "snow",
  "white_wool",
  "white_stained_glass",
  "white_concrete",
  "white_wool",
];

/** 腹。**影の側。** 羊毛を灰に寄せて、下から見上げたときの陰りを作る（0-7） */
const SHADE: readonly string[] = [
  "white_wool",
  "light_gray_wool",
  "white_wool",
  "light_gray_stained_glass",
  "clay",
  "smooth_quartz",
];

/** 裾と底。**ほぼガラス。** 光が抜けるのが、いちばん雲に見える */
const VAPOR: readonly string[] = [
  "white_stained_glass",
  "white_stained_glass",
  "light_gray_stained_glass",
  "white_stained_glass",
  "snow",
  "white_stained_glass",
];

/** 天面。**縁ならガラス寄り、窪みなら灰寄り、ほかは羊毛** */
export function deckOf(seed: number, x: number, z: number, rim: boolean, low: boolean): string {
  return speckle(SEED + seed + 5, x, z, rim ? FRINGE : low ? HOLLOW : DECK);
}

/** 胴 */
export function bodyOf(seed: number, x: number, z: number): string {
  return speckle(SEED + seed + 13, x, z, BODY);
}

/** 腹。**影の側** */
export function shadeOf(seed: number, x: number, z: number): string {
  return speckle(SEED + seed + 17, x, z, SHADE);
}

/** 裾と底。**霞** */
export function vaporOf(seed: number, x: number, z: number): string {
  return speckle(SEED + seed + 9, x, z, VAPOR);
}
