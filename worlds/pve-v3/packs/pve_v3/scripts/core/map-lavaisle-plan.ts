/**
 * 3. 溶岩の島——**どこに、どんな橋を架けるか。**
 *
 * 決まりは `spec/14-map-build.md` 0-6。**架け方は `map-lavaisle-span.ts`。**
 *
 * > ### 表だけを分けた理由
 * >
 * > **架け方（`span`）と、架ける場所（`SPANS`）は直す理由が違う。**
 * > 島の形を変えたら表だけ、橋の作りを変えたら向こうだけを触る。
 * > **1 ファイル 300 行**（`docs/imp.md` 10-8）にも収まる。
 */

import { SEED } from "./map-lavaisle-land.js";

/** 手すりの作り */
type Rail = "none" | "wall" | "bars";

/** 1 本の橋 */
export interface Span {
  readonly name: string;
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  /** 幅の半分（0 なら 1 マス幅） */
  readonly half: number;
  /** 真ん中の持ち上がり。**0 なら平らな土手** */
  readonly arch: number;
  readonly rail: Rail;
  readonly deck: readonly string[];
  /** 縁の材。**光らせると、橋の輪郭が夜でも出る** */
  readonly edge?: string;
  /** **そこで途切れる**（0〜1）。崩れかけの橋 */
  readonly cut?: number;
  readonly seed: number;
}

/** 人が敷いた床 */
const PAVE = ["polished_blackstone", "polished_blackstone_bricks", "blackstone", "cracked_polished_blackstone_bricks"];
/** 石の橋の床 */
const ARCH = ["polished_blackstone_bricks", "blackstone", "polished_blackstone", "gilded_blackstone"];
/** 自然にできた岩の背 */
const RAW = ["basalt", "blackstone", "smooth_basalt", "obsidian", "magma"];
/** 崩れかけ */
const BROKE = ["cracked_polished_blackstone_bricks", "blackstone", "polished_blackstone", "magma"];

/**
 * 架かっている橋。
 *
 * **帯（|x| ≤ 7）を通る 2 本は、平らな土手にしてある**——
 * **アーチにすると、湧く所から門が見えなくなる**（0-3）。
 * **代わりに縁をマグマにして、輪郭で橋だと分かるようにした。**
 */
export const SPANS: readonly Span[] = [
  // ---- 帯（|x| ≤ 7）を通る 2 本。**平らな土手**にして、門への見通しを残す（0-3）
  { name: "岸から中央へ", x1: 0, z1: -38, x2: 0, z2: -14, half: 4, arch: 0, rail: "none", deck: PAVE, edge: "magma", seed: SEED + 410 }, // prettier-ignore
  { name: "中央から門へ", x1: 0, z1: 2, x2: 0, z2: 30, half: 3, arch: 0, rail: "none", deck: PAVE, edge: "magma", seed: SEED + 420 }, // prettier-ignore
  // ---- 脇の 6 本。**幅も高さも作りも変える**（0-6）
  { name: "西の石橋", x1: -14, z1: -12, x2: -24, z2: -18, half: 1, arch: 3, rail: "wall", deck: ARCH, seed: SEED + 430 }, // prettier-ignore
  { name: "東の岩の背", x1: 14, z1: -11, x2: 24, z2: -16, half: 2, arch: 1, rail: "none", deck: RAW, seed: SEED + 440 }, // prettier-ignore
  { name: "北西の細橋", x1: -13, z1: 0, x2: -22, z2: 11, half: 0, arch: 2, rail: "bars", deck: ARCH, seed: SEED + 450 }, // prettier-ignore
  { name: "北東の石橋", x1: 9, z1: 26, x2: 24, z2: 19, half: 1, arch: 3, rail: "wall", deck: ARCH, seed: SEED + 460 }, // prettier-ignore
  { name: "南西の岩の背", x1: -11, z1: -31, x2: -19, z2: -27, half: 1, arch: 1, rail: "none", deck: RAW, seed: SEED + 490 }, // prettier-ignore
  { name: "南西の細橋", x1: -18, z1: -21, x2: -12, z2: -15, half: 0, arch: 2, rail: "bars", deck: ARCH, seed: SEED + 500 }, // prettier-ignore
  { name: "南東の岩の背", x1: 11, z1: -31, x2: 19, z2: -27, half: 0, arch: 1, rail: "none", deck: RAW, seed: SEED + 510 }, // prettier-ignore
  { name: "南東の石橋", x1: 19, z1: -21, x2: 12, z2: -15, half: 1, arch: 3, rail: "wall", deck: ARCH, seed: SEED + 520 }, // prettier-ignore
  // ---- **途中で途切れる 2 本。** 東の丘と吹き出し口は、もう繋がっていない
  { name: "崩れた橋・南から", x1: 25, z1: -10, x2: 26, z2: 9, half: 1, arch: 0, rail: "none", deck: BROKE, cut: 0.44, seed: SEED + 470 }, // prettier-ignore
  { name: "崩れた橋・北から", x1: 26, z1: 9, x2: 25, z2: -10, half: 0, arch: 0, rail: "none", deck: BROKE, cut: 0.36, seed: SEED + 480 }, // prettier-ignore
];

/** 橋脚の塔。**溶岩の中に立てる**——高さを 1 本ずつ変える（0-6） */
export const PYLONS: ReadonlyArray<readonly [number, number, number]> = [
  [-8, -24, 4],
  [8, -24, 6],
  [-8, 9, 7],
  [8, 9, 5],
  [-8, 20, 6],
  [8, 20, 4],
];
