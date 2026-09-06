/**
 * 16. 大書庫——**壁一面の書架、高窓、暖炉、書見の窪み。**
 *
 * 間取りは `map-library-plan.ts`。
 *
 * > ### **高窓は横に抜く。縦には抜かない**
 * >
 * > 屋根に穴を開けると、**その柱の天面だけが床まで落ちて 0-8 に落ちる。**
 * > 窓は壁を貫かず、**内側にガラス・その裏に光源**を埋めて「差す光」にする。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { CEIL_1, DECK, SEED, WALL_R, isOpen, ringOf } from "./map-library-plan.js";
import { stoneAt } from "./map-library-mat.js";

/** 高窓の高さ。**2 階の内法（10〜17）の真ん中に開ける** */
const WIN_LO = 12;
const WIN_HI = 16;

/**
 * 壁の意匠。**書架・付け柱・高窓・書見の窪み・暖炉。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function wallOps(ops: BuildOp[]): void {
  const ring = ringOf(WALL_R);
  ring.forEach((p, i) => {
    // ---- 玄関の窪みとゲートの正面は触らない。**塞ぐと出入口が閉じる**
    if (isOpen(p.x, p.z) || (Math.abs(p.x) <= 6 && Math.abs(p.z) >= 38)) return;
    if ((i + 3) % 7 === 0) {
      pilaster(ops, p.x, p.z);
      return;
    }
    // ---- 壁一面の書架。**1 階と 2 階の両方に張る**
    ops.push(fill(p.x, 1, p.z, p.x, 7, p.z, "bookshelf"));
    ops.push(fill(p.x, DECK + 1, p.z, p.x, CEIL_1 - 1, p.z, "bookshelf"));
    ops.push(fill(p.x, 8, p.z, p.x, DECK, p.z, "stripped_dark_oak_log"));
    if (noise(SEED + 73, p.x, 4, p.z) < 0.09) ops.push(set(p.x, 7, p.z, "chiseled_bookshelf"));
    if (noise(SEED + 79, p.x, 6, p.z) < 0.07) ops.push(set(p.x, 6, p.z, "web"));
  });
  windows(ops, ring);
  carrels(ops, ring);
  hearth(ops, -41, 0, "campfire", "blackstone");
  hearth(ops, 41, 10, "soul_campfire", "deepslate_bricks");
}

/** 付け柱。**書架の帯を刻む**——一面を書架で塗ると、ただの壁紙に見える */
function pilaster(ops: BuildOp[], x: number, z: number): void {
  ops.push(fill(x, 1, z, x, CEIL_1 - 1, z, "stripped_dark_oak_log"));
  for (const y of [1, DECK, CEIL_1 - 1]) ops.push(set(x, y, z, "chiseled_stone_bricks"));
  ops.push(set(x, 5, z, "lantern"));
}

/**
 * 高窓。**3 マス幅を 11 本おきに。**
 *
 * **内側にガラス、その裏に光源**——外は屋根の下なので、
 * **そのままでは真っ暗な板ガラス**にしかならない。
 */
function windows(ops: BuildOp[], ring: readonly { readonly x: number; readonly z: number }[]): void {
  for (let i = 0; i < ring.length; i++) {
    if (i % 11 > 2) continue;
    const p = ring[i];
    if (p === undefined || isOpen(p.x, p.z) || (Math.abs(p.x) <= 6 && Math.abs(p.z) >= 38)) continue;
    ops.push(fill(p.x, WIN_LO, p.z, p.x, WIN_HI, p.z, "glass_pane"));
    ops.push(set(p.x, WIN_HI + 1, p.z, "chiseled_stone_bricks"));
    ops.push(set(p.x, WIN_LO - 1, p.z, "polished_andesite"));
    // ---- 裏に光源。**壁の 2 枚目を光らせて、窓から差しているように見せる**
    const sx = p.x === 0 ? 0 : Math.sign(p.x);
    const sz = p.z === 0 ? 0 : Math.sign(p.z);
    for (const [dx, dz] of [
      [sx, 0],
      [0, sz],
      [sx, sz],
    ] as const) {
      if (dx === 0 && dz === 0) continue;
      ops.push(fill(p.x + dx, WIN_LO, p.z + dz, p.x + dx, WIN_HI, p.z + dz, "glowstone"));
    }
  }
}

/**
 * 書見の窪み。**壁を 1 マス掘って、書見台と灯りを置く。**
 *
 * **壁の厚みは 4 マス**あるので、1 マス掘っても外へは抜けない。
 */
function carrels(ops: BuildOp[], ring: readonly { readonly x: number; readonly z: number }[]): void {
  for (let i = 5; i < ring.length; i += 13) {
    const p = ring[i];
    if (p === undefined || isOpen(p.x, p.z) || (Math.abs(p.x) <= 6 && Math.abs(p.z) >= 38)) continue;
    const sx = p.x === 0 ? 0 : Math.sign(p.x);
    const sz = p.z === 0 ? 0 : Math.sign(p.z);
    const nx = p.x + (Math.abs(p.x) >= Math.abs(p.z) ? sx : 0);
    const nz = p.z + (Math.abs(p.x) >= Math.abs(p.z) ? 0 : sz);
    ops.push(fill(p.x, 1, p.z, p.x, 3, p.z, "air"));
    ops.push(fill(nx, 1, nz, nx, 3, nz, "air"));
    ops.push(set(nx, 0, nz, "polished_andesite"));
    ops.push(set(nx, 4, nz, "chiseled_stone_bricks"));
    ops.push(set(p.x, 4, p.z, "chiseled_stone_bricks"));
    ops.push(set(nx, 1, nz, "lectern"));
    ops.push(set(p.x, 1, p.z, "candle"));
    ops.push(set(p.x, 2, p.z, "lantern"));
  }
}

/**
 * 暖炉。**壁一面の書架に嵌まった火。**
 *
 * **壁を 2 マス掘って炉にし、上に炉棚を渡す。**
 * **奥に光源を埋める**——火だけでは書架の面まで届かない。
 */
function hearth(ops: BuildOp[], wx: number, wz: number, fire: string, frame: string): void {
  const s = Math.sign(wx);
  const x1 = Math.min(wx, wx + s * 2);
  const x2 = Math.max(wx, wx + s * 2);
  ops.push(fill(x1, 1, wz - 2, x2, 5, wz + 2, "air"));
  ops.push(fill(x1, 0, wz - 2, x2, 0, wz + 2, frame));
  ops.push(fill(x1, 6, wz - 3, x2, 6, wz + 3, "chiseled_stone_bricks"));
  // ---- 炉の枠。**両脇と奥を積み直す**（掘りっぱなしの生石を見せない）
  for (const z of [wz - 2, wz + 2]) ops.push(fill(x1, 1, z, x2, 5, z, frame));
  ops.push(fill(wx + s * 2, 1, wz - 1, wx + s * 2, 5, wz + 1, frame));
  ops.push(fill(wx + s, 1, wz - 1, wx + s, 3, wz + 1, fire));
  // ---- 奥の壁の真ん中を光源にする。**1 枚裏に埋めると、光が炉に届かない**
  ops.push(fill(wx + s * 2, 2, wz - 1, wx + s * 2, 4, wz + 1, "glowstone"));
  // ---- 炉の口を縁取る。**書架の海に、石の四角が浮かぶように**
  for (let y = 1; y <= 5; y++) {
    for (const z of [wz - 3, wz + 3]) ops.push(set(wx, y, z, "chiseled_stone_bricks"));
  }
  ops.push(set(wx, 1, wz - 3, stoneAt(wx, 1, wz - 3)));
  ops.push(set(wx, 5, wz, "iron_bars"));
}
