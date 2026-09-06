/**
 * 深淵の橋の**下部構造**——アーチ・橋脚・垂れた鎖。**純粋。**
 *
 * > ### **橋は必ず何かで支える**（`14-map-build.md` 0-5）
 * >
 * > **宙に浮いた板にしない。** 甲板の下には
 * > **アーチの環**が続き、その脚は**底へ細っていく橋脚**になる。
 * > 崩れた所だけは石が無く、**木の梁と鎖**で継いである。
 */

import { fill, set, type BuildOp } from "./build.js";
import { BOTTOM, noise, speckle, wave } from "./map-frame.js";
import {
  DECK,
  inCollapse,
  inRockFar,
  inRockNear,
  ROCK_FAR,
  ROCK_NEAR,
  rockT,
  SEED,
  SOFFIT,
  type Kind,
} from "./map-netherspan-shape.js";

/**
 * アーチ。**環の頂は甲板のすぐ下、脚は橋脚まで落ちる。**
 *
 * 3 つとも半径を変えてある——**同じ迫りを並べると作り物に見える**（0-6）。
 */
const ARCHES = [
  { zc: -26, r: 5.5 },
  { zc: -16, r: 4.5 },
  { zc: 28, r: 6 },
] as const;

/**
 * 橋脚。**下へ細っていって、闇に消える。**
 *
 * `kx` `kz` は潰し具合。**x に広く z に薄い刃**にすると、
 * 横から見て橋脚らしくなる。`drop` は**芯から 1 マス離れるごとに浅くなる深さ**——
 * 大きいほど鋭い錐になる。
 */
const PIERS = [
  // **両端の橋台の受け。** アーチの脚がここに載る
  { x: 0, z: -31, r: 5.4, kx: 0.55, kz: 2.4, drop: 8 },
  { x: 0, z: 34, r: 5.2, kx: 0.55, kz: 2.2, drop: 7 },
  // **細い橋脚。** 2 つのアーチが載る
  { x: 0, z: -20, r: 6.0, kx: 0.5, kz: 3.0, drop: 9 },
  // **中央の大橋脚。** 踊り場をまるごと支えて、底まで届く
  { x: 0, z: 0, r: 14, kx: 1, kz: 0.9, drop: 5.2 },
  // **崩れた側の橋脚。** ここでアーチが折れている
  { x: 0, z: 22, r: 6.2, kx: 0.5, kz: 2.8, drop: 9 },
  // **枝の足**——桟道の途中と、枝の踊り場の下
  { x: -24, z: -5, r: 5.6, kx: 1, kz: 1, drop: 6.4 },
  { x: 23, z: 7, r: 4.8, kx: 1, kz: 1, drop: 7.2 },
  { x: -15, z: -5, r: 3.4, kx: 1.1, kz: 1.7, drop: 8 },
  { x: 15, z: 7, r: 3.0, kx: 1.1, kz: 1.7, drop: 8 },
] as const;

/** 甲板のすぐ下——**積んだ石。**継ぎ足した跡が混ざる */
const FACE = [
  "deepslate_bricks",
  "cracked_deepslate_bricks",
  "polished_blackstone_bricks",
  "tuff_bricks",
  "cobbled_deepslate",
  "stone_bricks",
];

/** 中ほど——**古い石。**日も苔も届かない */
const MID = ["deepslate_bricks", "cobbled_deepslate", "blackstone", "tuff", "basalt", "deepslate"];

/** 底へ——**闇に溶ける。**深いほど黒くする */
const DEEP = ["deepslate", "blackstone", "smooth_basalt", "sculk", "deepslate_coal_ore", "obsidian"];

/** 岩の腹 */
const ROCK_BODY = ["cobbled_deepslate", "tuff", "basalt", "deepslate", "cobblestone", "andesite"];
const ROCK_DEEP = ["deepslate", "smooth_basalt", "blackstone", "deepslate_coal_ore", "sculk", "tuff"];

/** アーチの環。**頂で甲板に届き、脚で落ちる** */
function archBottom(z: number): number {
  for (const a of ARCHES) {
    const dz = z - a.zc;
    if (Math.abs(dz) > a.r) continue;
    return SOFFIT - (a.r - Math.sqrt(a.r * a.r - dz * dz));
  }
  return SOFFIT;
}

/** 橋脚。**芯に近いほど深い**ので、下ほど細って見える */
function pierBottom(x: number, z: number): number {
  let b = SOFFIT;
  for (const p of PIERS) {
    const d = Math.hypot((x - p.x) * p.kx, (z - p.z) * p.kz);
    if (d >= p.r) continue;
    b = Math.min(b, SOFFIT - (p.r - d) * p.drop);
  }
  return b;
}

/** 両端の岩の腹。**縁は薄く、芯は深い**——棚の下が竜骨のように垂れる */
function keel(x: number, z: number): number {
  let b = SOFFIT;
  if (inRockNear(x, z)) b = Math.min(b, DECK - 4 - (1 - Math.min(1, rockT(x, z, ROCK_NEAR))) ** 1.5 * 40);
  if (inRockFar(x, z)) b = Math.min(b, DECK - 4 - (1 - Math.min(1, rockT(x, z, ROCK_FAR))) ** 1.5 * 32);
  return b;
}

/**
 * その柱の、石の下端。**`null` なら崩れていて何も無い。**
 *
 * アーチ・橋脚・岩の腹の**いちばん深いもの**を採る——
 * 重ねると、アーチの脚がそのまま橋脚の肩に飲み込まれて繋がる。
 */
export function underBottom(x: number, z: number): number | null {
  if (inCollapse(z)) return null;
  // **切り口をぎざぎざにする**——真っ平らな底面は、切り取った紙に見える
  const jag = Math.round(wave(SEED + 41, x, z, 5) * 2.5);
  const b = Math.min(archBottom(z), pierBottom(x, z), keel(x, z)) + jag;
  return Math.max(BOTTOM, Math.round(Math.min(b, SOFFIT)));
}

/** 帯を 1 本塗る。**1 マスずつ置くと手順が 10 倍に膨らむ** */
function band(
  ops: BuildOp[],
  x: number,
  z: number,
  yTop: number,
  yBottom: number,
  seed: number,
  mats: readonly string[]
): void {
  if (yBottom > yTop) return;
  ops.push(fill(x, yBottom, z, x, yTop, z, speckle(seed, x, z, mats)));
}

/** 垂れた鎖と、その先の灯り。**縁寄りにだけ吊る**——真下は誰にも見えない */
function chain(ops: BuildOp[], x: number, z: number, bottom: number): void {
  if (Math.abs(x) < 3 || noise(SEED + 71, x, z) > 0.07) return;
  const len = 4 + Math.floor(noise(SEED + 73, x, z) * 8);
  const y0 = Math.max(BOTTOM, bottom - len);
  if (y0 > bottom - 3) return;
  ops.push(fill(x, y0 + 1, z, x, bottom - 1, z, "iron_chain"));
  ops.push(set(x, y0, z, "lantern"));
}

/**
 * 崩れた所を継ぐ、木の梁。**板だけを渡さない**——
 * **下に梁を通して、両岸の石に掛ける。**
 */
function joist(ops: BuildOp[], x: number, z: number): void {
  if (x !== 0 && Math.abs(x) !== 3) return;
  ops.push(set(x, DECK - 1, z, x === 0 ? "dark_oak_log" : "spruce_log"));
  if (Math.abs(x) !== 3 || (z !== 16 && z !== 19)) return;
  ops.push(fill(x, DECK - 8, z, x, DECK - 2, z, "iron_chain"));
  ops.push(set(x, DECK - 9, z, "lantern"));
}

/**
 * 甲板の下を積む。**帯ごとに `fill` する。**
 *
 * 帯の境目を**柱ごとにずらす**——同じ高さで色が変わると、
 * 地層ではなく**貼り合わせた板**に見える。
 */
export function underOps(ops: BuildOp[], x: number, z: number, top: number, kind: Kind): void {
  const bottom = underBottom(x, z);
  if (bottom === null) {
    joist(ops, x, z);
    return;
  }
  const rock = kind === "rock";
  const m1 = DECK - 7 + Math.round(wave(SEED + 43, x, z, 7) * 2);
  const m2 = DECK - 25 + Math.round(wave(SEED + 45, x, z, 11) * 4);
  band(ops, x, z, top - 1, Math.max(bottom, m1), SEED + 61, rock ? ROCK_BODY : FACE);
  if (bottom < m1) band(ops, x, z, m1 - 1, Math.max(bottom, m2), SEED + 63, rock ? ROCK_BODY : MID);
  if (bottom < m2) band(ops, x, z, m2 - 1, bottom, SEED + 65, rock ? ROCK_DEEP : DEEP);
  chain(ops, x, z, bottom);
}
