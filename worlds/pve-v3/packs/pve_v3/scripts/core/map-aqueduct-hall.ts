/**
 * 7. 地下水路——**石の意匠。** アーケード・リブ・縁石・跨ぎの迫り・ゲートの枠。
 *
 * 寸法は `map-aqueduct-plan.ts`。**水は `map-aqueduct-water.ts`。**
 *
 * > ### **x ＝ 0 の柱は、y ＝ 7 より下を塞がない**
 * >
 * > 検査 0-3 は**湧く所の目からゲートへ線を引く**（`14-map-build.md` 0-9）。
 * > その線は **x ＝ 0・y ＝ 1〜6** を通る。
 * > **跨ぎの迫りは頂点 8、吊り灯は 12 以上**——だから当たらない。
 */

import { fill, set, type BuildOp } from "./build.js";
import {
  BAYS,
  CANAL_Z0,
  CANAL_Z1,
  CROSS_H,
  DECK,
  KERB_X,
  NAVE,
  SPRING,
  WATER_Y,
  Z0,
  Z1,
  ceilAt,
  deckAt,
  halfAt,
  isRib,
  stoneAt,
} from "./map-aqueduct-plan.js";
import { noise } from "./map-frame.js";

/** 縁石の切れ目。**ここから水に降りて、ここから上がる** */
function isStep(z: number): boolean {
  return (z + 900) % 9 < 3;
}

/**
 * アーケードを穿つ。**壁は塗ってあるので、開口を彫るだけ。**
 *
 * **同じ迫りを並べない**——柱間ごとに起点と高さを 1 ずつ振る。
 */
export function arcadeCut(ops: BuildOp[]): void {
  for (let i = 0; i + 1 < BAYS.length; i++) {
    const za = BAYS[i] as number;
    const zb = BAYS[i + 1] as number;
    const hs = Math.floor((zb - za) / 2) - 2;
    if (hs < 1) continue;
    const zm = Math.round((za + zb) / 2);
    const base = 3 + Math.floor(noise(4001, i, 0) * 2);
    const rise = 7 - base + Math.floor(noise(4002, i, 1) * 2);
    for (let dz = -hs; dz <= hs; dz++) {
      const z = zm + dz;
      const w = halfAt(z);
      if (w < 17) continue;
      if (Math.abs(z) <= CROSS_H + 1) continue; // **交差は別に大きく抜く**
      const h = base + Math.round(rise * Math.sqrt(Math.max(0, 1 - (dz / (hs + 0.5)) ** 2)));
      for (const sx of [-NAVE, NAVE]) {
        ops.push(fill(sx, DECK + 1, z, sx, h, z, "air"));
        ops.push(set(sx, DECK, z, deckAt(sx, z)));
        ops.push(set(sx, h + 1, z, "chiseled_stone_bricks"));
      }
    }
  }
  crossArch(ops);
}

/** 交差の広間で、横水路がアーケードを抜ける大きな迫り */
function crossArch(ops: BuildOp[]): void {
  const hs = CROSS_H + 1;
  for (let dz = -hs; dz <= hs; dz++) {
    const h = 3 + Math.round(4 * Math.sqrt(Math.max(0, 1 - (dz / (hs + 0.6)) ** 2)));
    for (const sx of [-NAVE, NAVE]) {
      ops.push(fill(sx, -3, dz, sx, h, dz, "air"));
      ops.push(set(sx, h + 1, dz, "chiseled_stone_bricks"));
    }
  }
}

/**
 * 水路の縁石と欄干。
 *
 * **欄干を切らさないと、落ちた者が上がれない**——9 マスごとに 3 マス空ける。
 */
export function kerbOps(ops: BuildOp[]): void {
  for (let z = CANAL_Z0; z <= CANAL_Z1; z++) {
    const w = halfAt(z);
    if (w < KERB_X + 1) continue;
    if (Math.abs(z) <= CROSS_H) continue; // **交差の中では縁石を回さない**
    for (const sx of [-KERB_X, KERB_X]) {
      if (isRib(z)) {
        ops.push(set(sx, DECK + 1, z, "chiseled_stone_bricks"));
        ops.push(set(sx, DECK + 2, z, "lantern"));
        continue;
      }
      if (isStep(z)) {
        // ---- 切れ目には**水へ降りる段**を沈める。上がるときも 1 マスずつ
        ops.push(set(Math.sign(sx) * (KERB_X - 1), WATER_Y, z, "mossy_cobblestone"));
        ops.push(set(Math.sign(sx) * (KERB_X - 2), WATER_Y - 1, z, "cobblestone"));
        continue;
      }
      ops.push(set(sx, DECK + 1, z, "stone_brick_slab"));
    }
  }
  // ---- 横水路の縁。**広間の中だけ**
  for (const sz of [-CROSS_H - 1, CROSS_H + 1]) {
    const w = halfAt(sz);
    for (let x = -w; x <= w; x++) {
      if (Math.abs(x) <= KERB_X) continue;
      if (isStep(x)) continue;
      ops.push(set(x, DECK + 1, sz, "stone_brick_slab"));
    }
  }
}

/**
 * 水路を跨ぐ迫りと、天井から吊る灯り。
 *
 * **角度で刻んで重複を捨てる**——`x` で刻むと縦の並びが抜けて、迫りが千切れる。
 */
export function spanOps(ops: BuildOp[]): void {
  for (let i = 0; i < BAYS.length; i++) {
    const z = BAYS[i] as number;
    if (z < CANAL_Z0 + 2 || z > CANAL_Z1 - 2) continue;
    if (Math.abs(z) <= CROSS_H + 1) continue;
    // **迫りは 1 つ飛ばし、灯りは毎回**——暗いと丸天井の連なりが読めない
    if (i % 2 === 0) archOverCanal(ops, z, i);
    hangLamp(ops, z);
  }
}

/** 縁石から立ち上がって、水路を跨ぐ迫り 1 本 */
function archOverCanal(ops: BuildOp[], z: number, i: number): void {
  const rise = 7 + Math.floor(noise(4011, i, 2) * 2);
  const span = KERB_X - 1;
  // **角度で刻むと、斜めに 1 マス飛んで輪が千切れる**（塊が 2 つに割れて 0-5 が落ちた）。
  // **x ごとに高さを出し、隣と必ず重ねる**——これなら繋がる
  const top = (x: number): number => {
    const c = Math.max(-span, Math.min(span, x));
    return DECK + 1 + Math.round(rise * Math.sqrt(Math.max(0, 1 - (c / KERB_X) ** 2)));
  };
  for (const sx of [-KERB_X, KERB_X]) {
    ops.push(fill(sx, DECK + 1, z, sx, top(span), z, stoneAt(sx, DECK + 1, z)));
    ops.push(set(sx, top(span), z, "chiseled_stone_bricks"));
  }
  for (let x = -span; x <= span; x++) {
    const h = top(x);
    const lo = Math.min(h, top(x - 1), top(x + 1));
    for (let y = lo; y <= h; y++) {
      ops.push(set(x, y, z, y >= DECK + rise ? "chiseled_stone_bricks" : stoneAt(x, y, z)));
    }
  }
}

/** 丸天井から鎖で吊る灯り。**x ＝ 0 でも y ＝ 12 以上なので、視線を遮らない** */
function hangLamp(ops: BuildOp[], z: number): void {
  const c = ceilAt(0, halfAt(z), z);
  ops.push(fill(0, c - 2, z, 0, c - 1, z, "iron_chain"));
  ops.push(set(0, c - 3, z, "sea_lantern"));
}

/** いちばん近いリブまでの距離 */
function ribGap(z: number): number {
  let best = 99;
  for (const b of BAYS) best = Math.min(best, Math.abs(b - z));
  return best;
}

/**
 * 壁の意匠。**付け柱と、その間の空迫り。**
 *
 * **平らな一枚壁は、それ自体が手抜き**（`14-map-build.md` 0-4）。
 * **柱間ごとに壁を 1 マス彫り込んで、丸い頭を付ける**——
 * 影が落ちて、長い側廊が単調にならない。
 */
export function wallDecor(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const w = halfAt(z);
    if (w < 6) continue;
    // **大落水の口では、壁そのものが無い**——持ち送りを出すと宙に浮く
    if (Math.abs(z) <= CROSS_H + 1) continue;
    if (isRib(z)) {
      pilaster(ops, z, w);
      continue;
    }
    const d = ribGap(z);
    if (d < 2) continue; // **柱の脇は彫らない**——付け根が細るとみっともない
    const head = d >= 3 ? 6 : 5;
    for (const sx of [-1, 1]) {
      const x = sx * (w + 1);
      ops.push(fill(x, DECK + 1, z, x, head, z, "air"));
      ops.push(set(x, DECK, z, deckAt(x, z)));
      ops.push(set(x, head + 1, z, "chiseled_stone_bricks"));
      // ---- 窪みの奥に、埋め込みの灯り。**柱間の真ん中だけ**
      if (d === 3) ops.push(set(sx * (w + 2), 4, z, "sea_lantern"));
    }
  }
}

/** リブが降りてくる付け柱と、そこに掛ける灯り */
function pilaster(ops: BuildOp[], z: number, w: number): void {
  for (const sx of [-w, w]) {
    const c = ceilAt(sx, w, z);
    ops.push(fill(sx, -2, z, sx, c - 1, z, "stone_bricks"));
    ops.push(set(sx, c - 1, z, "chiseled_stone_bricks"));
    const arm = sx - Math.sign(sx);
    ops.push(set(arm, 5, z, "cobblestone_wall"));
    ops.push(set(arm, 6, z, "lantern"));
  }
}

/**
 * ゲートの枠。
 *
 * **箱（−1..1, 1..5, z ＝ 39）には何も置かない**（`14-map-build.md` 0-2-1）——
 * **飾るのは手前の面（z ＝ 38）の、箱の外側だけ。**
 */
export function gateFrame(ops: BuildOp[]): void {
  const z = Z1;
  // ---- 両脇の壁柱。**手前の面を彫り石にして、周りの乱積みと変える**
  for (const sx of [-3, -2, 2, 3]) ops.push(fill(sx, DECK + 1, z, sx, 6, z, "chiseled_stone_bricks"));
  for (const sx of [-4, 4]) {
    ops.push(fill(sx, DECK + 1, z, sx, 7, z, "stone_bricks"));
    ops.push(set(sx, 8, z, "sea_lantern"));
  }
  // ---- 迫りの頭。**箱は y ＝ 5 までなので、頭は 6 から上に載せる**
  for (let dx = -3; dx <= 3; dx++) {
    const h = Math.abs(dx) <= 1 ? 7 : 6;
    ops.push(set(dx, h, z, "chiseled_stone_bricks"));
    if (Math.abs(dx) <= 1) ops.push(set(dx, h - 1, z, "stone_bricks"));
  }
  // ---- 敷居と、手前に立てる灯り
  for (let dx = -4; dx <= 4; dx++) ops.push(set(dx, DECK, z - 1, "chiseled_stone_bricks"));
  for (const sx of [-5, 5]) {
    ops.push(fill(sx, DECK + 1, z - 2, sx, DECK + 2, z - 2, "chiseled_stone_bricks"));
    ops.push(set(sx, DECK + 3, z - 2, "lantern"));
  }
}

/** 側廊の柱の頭。**柱そのものは彫り残し**（`map-aqueduct.ts`） */
export function capitals(ops: BuildOp[], x: number, z: number, top: number): void {
  ops.push(set(x, top, z, "chiseled_stone_bricks"));
  ops.push(set(x, DECK + 1, z, "chiseled_stone_bricks"));
  if (top >= SPRING - 2) ops.push(set(x, top - 1, z, "stone_bricks"));
}
