/**
 * 16. 大書庫——**中央の広間・玄関・前室。** 天球儀と大机、吊り灯り。
 *
 * 間取りは `map-library-plan.ts`。
 *
 * > ### **天球儀は床に置かず、吊る**
 * >
 * > 検査 0-3 の線が **x ＝ 0・y ＝ 1〜6** を通る（`14-map-build.md` 0-9）。
 * > **床に据えると線を塞ぐ**ので、**y ＝ 9 より上に吊って**その下を歩かせる。
 * > 2 階の回廊からは、ちょうど目の高さに浮かんで見える。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { CEIL_1, CEIL_A, SEED, octR } from "./map-library-plan.js";

/** 天球儀の中心。**z を ＋1 ずらす**——橋（z ＝ −9〜−5・9〜13）の間に収める */
const ORB = { x: 0, y: 14, z: 1 } as const;
const ORB_R = 5;

/**
 * 中央の広間。**床の紋様・天球儀・大机・吊り灯り。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function atriumOps(ops: BuildOp[]): void {
  mosaicOps(ops);
  armillaryOps(ops);
  tablesOps(ops);
  chandeliersOps(ops);
}

/** 床の紋様。**輪と十字。** 広間の真ん中だと分かる印 */
function mosaicOps(ops: BuildOp[]): void {
  for (let x = -13; x <= 13; x++) {
    for (let z = -12; z <= 14; z++) {
      const d = Math.hypot(x, z - 1);
      if (d > 12.5) continue;
      const ring = Math.round(d);
      let b = "dark_oak_planks";
      if (ring === 12 || ring === 8 || ring === 4) b = "polished_andesite";
      else if (ring === 11 || ring === 7) b = "stone_bricks";
      else if (d < 1.5) b = "chiseled_stone_bricks";
      else if (Math.abs(x) <= 1 || Math.abs(z - 1) <= 1) b = "spruce_planks";
      ops.push(set(x, 0, z, b));
    }
  }
  plinthOps(ops);
}

/**
 * 天球儀の真下の壇。**低い欄干で囲う。**
 *
 * **|x| ≦ 2 には置かない**——0-3 の線が通る（身廊はここを抜ける）。
 */
function plinthOps(ops: BuildOp[]): void {
  for (let x = -6; x <= 6; x++) {
    for (let z = -5; z <= 7; z++) {
      if (Math.abs(x) <= 2 || Math.round(Math.hypot(x, z - 1)) !== 4) continue;
      ops.push(set(x, 1, z, "polished_andesite"));
      ops.push(set(x, 2, z, (x + z + 64) % 3 === 0 ? "candle" : "dark_oak_fence"));
    }
  }
}

/**
 * 輪 1 枚ぶんのマス。
 *
 * > ### **幅を持たせないと、輪が縦横に繋がらない**
 * >
 * > `Math.round(hypot) === r` だけで引くと、**斜めにしか繋がらない箇所**が残る。
 * > 6 方向で辿る 0-5 の検査は、そこを「島から離れた塊」と数える。
 * > **±0.7 の帯で引く**と、どのマスも上下左右のどれかで隣と接する。
 */
function ringCells(r: number): readonly (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (let u = -r; u <= r; u++) {
    for (let v = -r; v <= r; v++) {
      if (Math.abs(Math.hypot(u, v) - r) <= 0.7) out.push([u, v]);
    }
  }
  return out;
}

/**
 * 天球儀。**銅の輪 3 枚と、光る核。**
 *
 * **鎖で天井から吊る**——浮いたブロックを作らない（0-5）。
 */
function armillaryOps(ops: BuildOp[]): void {
  for (const [u, v] of ringCells(ORB_R)) {
    ops.push(set(ORB.x + u, ORB.y, ORB.z + v, "copper_block"));
    ops.push(set(ORB.x + u, ORB.y + v, ORB.z, "waxed_oxidized_copper"));
    ops.push(set(ORB.x, ORB.y + v, ORB.z + u, "waxed_weathered_copper"));
  }
  // ---- 軸。**核と 3 枚の輪を繋ぐ**——繋がっていないと浮いた塊になる（0-5）
  ops.push(fill(ORB.x - ORB_R, ORB.y, ORB.z, ORB.x + ORB_R, ORB.y, ORB.z, "copper_block"));
  ops.push(fill(ORB.x, ORB.y - ORB_R, ORB.z, ORB.x, ORB.y + ORB_R, ORB.z, "waxed_oxidized_copper"));
  // ---- 核。**光らせる**——2 階の回廊から見て、これが広間の中心になる
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 2) continue;
        ops.push(set(ORB.x + dx, ORB.y + dy, ORB.z + dz, "sea_lantern"));
      }
    }
  }
  // ---- 吊り鎖。**輪の頂点と外周の 4 点から、天井まで**
  ops.push(fill(ORB.x, ORB.y + ORB_R + 1, ORB.z, ORB.x, CEIL_A - 1, ORB.z, "iron_chain"));
  for (const [dx, dz] of [
    [ORB_R, 0],
    [-ORB_R, 0],
    [0, ORB_R],
    [0, -ORB_R],
  ] as const) {
    ops.push(fill(ORB.x + dx, ORB.y + 1, ORB.z + dz, ORB.x + dx, CEIL_A - 1, ORB.z + dz, "iron_chain"));
  }
}

/**
 * 大机。**身廊の左右に、大きさの違うものを 3 卓。**
 *
 * **同じ形を並べない**（0-6）——長さも載せるものも変える。
 */
function tablesOps(ops: BuildOp[]): void {
  const desks: readonly (readonly [number, number, number, number])[] = [
    [-11, -4, -5, -1],
    [5, -5, 11, -2],
    [-10, 5, -4, 8],
    [6, 6, 12, 8],
  ];
  desks.forEach(([x1, z1, x2, z2], i) => {
    ops.push(fill(x1, 1, z1, x2, 1, z2, i % 2 === 0 ? "dark_oak_planks" : "spruce_planks"));
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        const n = noise(SEED + 59, x, 10, z);
        if (n < 0.14) ops.push(set(x, 2, z, "lectern"));
        else if (n < 0.2) ops.push(set(x, 2, z, "candle"));
        else if (n < 0.26) ops.push(set(x, 2, z, "lantern"));
        else if (n < 0.32) ops.push(set(x, 2, z, "chiseled_bookshelf"));
      }
    }
    // ---- 椅子。**机の外側に並べる**
    for (let z = z1; z <= z2; z += 2) {
      ops.push(set(x1 - 1, 1, z, "dark_oak_stairs"));
      ops.push(set(x2 + 1, 1, z, "dark_oak_stairs"));
    }
  });
}

/** 吹き抜けの吊り灯り。**天井が 22 と遠いので、鎖で下ろして届かせる** */
function chandeliersOps(ops: BuildOp[]): void {
  for (const [x, z] of [
    [-14, -10],
    [14, -10],
    [-14, 12],
    [14, 12],
    [0, -16],
    [0, 18],
  ] as const) {
    ops.push(fill(x, 17, z, x, CEIL_A - 1, z, "iron_chain"));
    ops.push(set(x, 16, z, "glowstone"));
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ops.push(set(x + dx, 16, z + dz, "dark_oak_fence"));
      ops.push(set(x + dx, 15, z + dz, "lantern"));
    }
  }
}

/**
 * 玄関の広間と、ゲート前の前室。**どちらも 2 層ぶんの高さ。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function endHallsOps(ops: BuildOp[]): void {
  for (const z of [-37, -33]) columns(ops, z, 5);
  for (const z of [33, 37]) columns(ops, z, 6);
  // ---- 玄関の楣（まぐさ）。**奥へ抜ける口を額縁で囲う**
  for (const x of [-5, 5]) ops.push(fill(x, 1, -30, x, 9, -30, "chiseled_stone_bricks"));
  for (let x = -5; x <= 5; x++) ops.push(set(x, 10, -30, "chiseled_stone_bricks"));
  for (const x of [-7, 7]) ops.push(fill(x, 1, 30, x, 9, 30, "chiseled_stone_bricks"));
  for (let x = -7; x <= 7; x++) ops.push(set(x, 10, 30, "chiseled_stone_bricks"));
  // ---- 明かり。**湧いた所とゲートの前は、暗くしない**
  for (const z of [-39, -35, -31, 31, 35, 38]) {
    for (const x of [-4, 4]) ops.push(set(x, CEIL_1, z, "glowstone"));
  }
  alcoveWall(ops);
  naveLights(ops);
  gateFrameOps(ops);
}

/**
 * 玄関の窪みの奥の壁。**湧いた瞬間、背中側に来る面。**
 *
 * **石のままだと「掘った穴」に見える**ので、書架で覆って額縁を回す。
 */
function alcoveWall(ops: BuildOp[]): void {
  ops.push(fill(-5, 1, -45, 5, 7, -45, "bookshelf"));
  for (const x of [-5, 5]) ops.push(fill(x, 1, -45, x, 7, -45, "chiseled_stone_bricks"));
  for (let x = -5; x <= 5; x++) ops.push(set(x, 7, -45, "chiseled_stone_bricks"));
  for (const x of [-3, 3]) {
    ops.push(set(x, 4, -45, "glowstone"));
    ops.push(set(x, 1, -45, "lectern"));
  }
  ops.push(set(0, 4, -45, "chiseled_bookshelf"));
}

/**
 * 身廊の吊り灯り。**割れた 2 階の床の間に、天井から下ろす。**
 *
 * **y ＝ 10 より上にしか置かない**——0-3 の線（x ＝ 0・y ＝ 1〜6）を塞がない。
 */
function naveLights(ops: BuildOp[]): void {
  for (const z of [-28, -22, 22, 28]) {
    ops.push(fill(0, 12, z, 0, CEIL_1 - 1, z, "iron_chain"));
    ops.push(set(0, 11, z, "glowstone"));
    for (const dx of [-1, 1]) {
      ops.push(set(dx, 11, z, "dark_oak_fence"));
      ops.push(set(dx, 10, z, "lantern"));
    }
  }
}

/** 2 層ぶんの列柱。**根元と柱頭に彫り石の帯** */
function columns(ops: BuildOp[], z: number, dx: number): void {
  for (const x of [-dx, dx]) {
    if (octR(x, z) === 0) continue;
    ops.push(fill(x, 1, z, x, CEIL_1 - 1, z, "stone_bricks"));
    for (const y of [1, 2, CEIL_1 - 2, CEIL_1 - 1]) ops.push(set(x, y, z, "chiseled_stone_bricks"));
    ops.push(set(x, 8, z, "polished_andesite"));
    ops.push(set(x, 6, z, "glowstone"));
    // ---- 柱の足元に書見台。**列柱を「置いただけ」にしない**
    ops.push(set(x + (x < 0 ? 1 : -1), 1, z, "lectern"));
  }
}

/**
 * ゲートの枠。**箱（−1〜1, 1〜5, z ＝ 39）の外側だけを飾る。**
 *
 * **マップにポータルを立ててはいけない**（`20-portal.md` 0-2）。
 */
function gateFrameOps(ops: BuildOp[]): void {
  for (const x of [-2, 2]) {
    ops.push(fill(x, 1, 39, x, 7, 39, "chiseled_stone_bricks"));
    ops.push(set(x, 3, 39, "glowstone"));
  }
  for (let x = -2; x <= 2; x++) ops.push(set(x, 6, 39, "chiseled_stone_bricks"));
  for (let x = -3; x <= 3; x++) ops.push(set(x, 7, 39, "polished_andesite"));
  // ---- 枠の左右に本の山。**「奥へ進む口」だと分かるように、両脇を締める**
  for (const x of [-4, -3, 3, 4]) ops.push(fill(x, 1, 38, x, 4, 39, "bookshelf"));
}
