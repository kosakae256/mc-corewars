/**
 * 15. 地下墓所——**繰り返し使う造作。** 灯り・棺・壁龕・鎖。
 *
 * 間取りは `map-crypt-plan.ts`、材は `map-crypt-mat.ts`。
 *
 * > ### **明かりの置き方が、そのまま意匠になる**
 * >
 * > 墓所は**暗さで見せる**。だから
 * > **どこに火を置くかが、どこを見せるかを決める。**
 * > **床置きの燭・壁の腕木・天井から吊る鎖**を撒き分ける。
 *
 * > ### **蝋燭（`candle`）は使えない**
 * >
 * > `setBlockType` は**ブロックの状態（`lit`）を渡せない**（`services/builder.ts`）ので、
 * > **置いても火が点かない。** 代わりに**松明**を燭として使い、
 * > **魂のランタン**（青い炎）を墓所の色に当てる。
 *
 * > ### **浮かせない**（0-5）
 * >
 * > 灯りも巣も、**必ず壁か天井に接した所へ置く。**
 * > 塊から切り離されたブロックがあると、検査に落ちる。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { SEED } from "./map-crypt-plan.js";

/**
 * 燭台。**床から `h` 段の台を積み、その上に灯りを載せる。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function stand(ops: BuildOp[], x: number, y: number, z: number, h: number, lamp: string): void {
  ops.push(fill(x, y, z, x, y + h - 1, z, "cobblestone_wall"));
  ops.push(set(x, y + h, z, lamp));
}

/**
 * 天井から吊るす灯り。**鎖を `drop` 段垂らして、先に灯りを付ける。**
 *
 * **鎖の頭は天井のブロックに接する**——1 マスでも離すと浮く（0-5）。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function hang(ops: BuildOp[], x: number, z: number, ceil: number, drop: number, lamp: string): void {
  const top = ceil - 1;
  const at = top - drop;
  // **鎖は 1 段以上のときだけ。** 0 段で `fill` すると、天井の上へ 1 マスはみ出す
  if (drop >= 1) ops.push(fill(x, at + 1, z, x, top, z, "iron_chain"));
  ops.push(set(x, at, z, lamp));
}

/**
 * 天井に埋める明かり。
 *
 * **面から出さない**——出っ張らせると 0-3 の線に当たる恐れがある。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function lamp(ops: BuildOp[], x: number, z: number, ceil: number, block = "glowstone"): void {
  ops.push(set(x, ceil, z, block));
}

/** 棺の向き */
export type Along = "x" | "z";

/**
 * 石棺 1 つ。**本体の上に蓋の板を載せる。**
 *
 * > ### **蓋をずらす**
 * >
 * > **ぴったり載せると、ただの箱に見える。**
 * > **1 マスぶん短く載せて、空いた所に頭骨を置く**——
 * > 「開いている」ことが遠目にも分かる。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function coffin(ops: BuildOp[], x: number, y: number, z: number, along: Along, len: number, seed: number): void {
  const dx = along === "x" ? 1 : 0;
  const dz = along === "z" ? 1 : 0;
  const x2 = x + dx * (len - 1);
  const z2 = z + dz * (len - 1);
  ops.push(fill(x, y, z, x2, y, z2, "chiseled_deepslate"));
  // **蓋。** 3 つに 1 つはずらして、中を見せる
  const open = noise(SEED + seed, x, y, z) < 0.34;
  const s = open ? 1 : 0;
  ops.push(fill(x + dx * s, y + 1, z + dz * s, x2, y + 1, z2, "stone_brick_slab"));
  if (open) ops.push(set(x, y + 1, z, "skeleton_skull"));
}

/**
 * 壁龕。**壁を 1 マス彫り込んで、中に棺を納める。**
 *
 * `nx`,`nz` は**彫る向き**（壁の奥へ 1 マス）。
 * **2 マス目まで岩が残っていることを、呼ぶ側が確かめる**——
 * 抜けると、隣の部屋へ穴が開く。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function niche(ops: BuildOp[], x: number, y: number, z: number, tall: number, seed: number): void {
  ops.push(fill(x, y, z, x, y + tall - 1, z, "air"));
  const r = noise(SEED + seed, x, y, z);
  if (r < 0.18) return; // **空の龕。** 全部埋まっていると単調になる
  // **骨は骨堂にだけ置く**——ここで撒くと、墓所じゅうが骨壺置き場になる
  ops.push(set(x, y, z, r < 0.72 ? "chiseled_deepslate" : "cobbled_deepslate"));
  if (r > 0.5 && tall >= 2) ops.push(set(x, y + 1, z, "skeleton_skull"));
}

/**
 * 蜘蛛の巣。**天井か壁に接した所へ置く**（浮かせない・0-5）。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function cobweb(ops: BuildOp[], x: number, y: number, z: number): void {
  ops.push(set(x, y, z, "web"));
}

/**
 * 付け柱。**平らな壁の面を刻む。**
 *
 * > ### **出っ張らせない**
 * >
 * > **柱の内側に腕木を出したら、幅 4 の廊下が塞がった**という事故がある
 * > （`map-stronghold-halls.ts`）。**壁の面を差し替えるだけにする。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function pilaster(ops: BuildOp[], x: number, z: number, y0: number, y1: number): void {
  ops.push(fill(x, y0, z, x, y1, z, "polished_deepslate"));
  ops.push(set(x, y0, z, "chiseled_deepslate"));
  ops.push(set(x, y1, z, "chiseled_deepslate"));
}

/** 目印用の乱数。**同じ座標なら、いつも同じ値** */
export function pick(seed: number, x: number, y: number, z: number): number {
  return noise(SEED + seed, x, y, z);
}
