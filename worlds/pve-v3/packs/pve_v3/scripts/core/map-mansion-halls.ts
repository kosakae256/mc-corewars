/**
 * 11「森の洋館」の**大きな部屋と、階段。純粋。**
 *
 * ```
 * linkOps       厚い壁（棟の継ぎ目）を貫く通路
 * grandStairs   玄関大広間の左右の大階段
 * stairHalls    本館の東西にある「階段の広間」（吹き抜けの階段室）
 * greatHallOps  中央の大広間（2 層吹き抜け・回廊・柱・吊り灯り）
 * gateHallOps   ゲート前の広間（壇・門枠・上の回廊）
 * ```
 *
 * > ### **2 階へは 1 マスずつ上がれること**（`spec/14-map-build.md` 0-8）
 * >
 * > **敵も同じ道で登ってくる。** 段差が 2 マスある階段を 1 つでも作ると、
 * > **上の階が「誰も行けない場所」になる。** どの段も 1 マスずつ。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { F1, F2, SEED, TOP2 } from "./map-mansion-plan.js";

/** 棟の継ぎ目を貫く通路。**壁が 2〜3 マスあるので、自動の口開けでは抜けない** */
export function linkOps(ops: BuildOp[]): void {
  for (const [z0, z1] of [
    [-25, -24],
    [23, 25],
  ] as const) {
    ops.push(fill(-3, F1 + 1, z0, 3, F1 + 6, z1, "air"));
    ops.push(fill(-3, F2 + 1, z0, 3, F2 + 6, z1, "air"));
    ops.push(fill(-4, F1 + 7, z0, 4, F1 + 7, z1, "dark_oak_log"));
    ops.push(fill(-4, F2 + 7, z0, 4, F2 + 7, z1, "dark_oak_log"));
  }
  // ---- 棟の中の仕切り（1 マス壁）。**中央は高く、両脇は回廊へ**
  for (const z of [-31, 30]) {
    ops.push(fill(-3, F1 + 1, z, 3, F1 + 6, z, "air"));
    for (const sx of [-1, 1]) {
      ops.push(fill(sx * 11, F1 + 1, z, sx * 14, F1 + 5, z, "air"));
      ops.push(fill(sx * 11, F2 + 1, z, sx * 14, F2 + 5, z, "air"));
    }
  }
}

/**
 * 天井から灯りを下げる。**柵で天井に繋ぐ**ので、浮いたブロックにならない（0-5）。
 *
 * **吹き抜けは天井が 15 マス上**にある。**壁付けの松明では床まで届かない。**
 * 鎖ではなく**ダークオークの柵**にしたのは、館の意匠に合わせるため。
 */
function drop(ops: BuildOp[], x: number, z: number, len: number): void {
  ops.push(fill(x, TOP2 - len, z, x, TOP2 - 1, z, "dark_oak_fence"));
  ops.push(set(x, TOP2 - len - 1, z, "lantern"));
}

/** 燭台。**床に立てた柵の上に灯りを載せる**——吹き抜けの足元まで届かせる */
function lampPost(ops: BuildOp[], x: number, z: number): void {
  ops.push(fill(x, F1 + 1, z, x, F1 + 2, z, "dark_oak_fence"));
  ops.push(set(x, F1 + 3, z, "lantern"));
}

/** 手すりの上の灯り。**柵に載せる**ので浮かない */
function railLamp(ops: BuildOp[], x: number, z: number): boolean {
  if ((((x + z) % 6) + 6) % 6 !== 0) return false;
  ops.push(set(x, F2 + 2, z, "lantern"));
  return true;
}

/** 段を 1 本置く。**踏み面は板、蹴上げは丸石**——木と石の縞になる */
function tread(ops: BuildOp[], x0: number, x1: number, z: number, top: number): void {
  ops.push(fill(x0, F1, z, x1, top - 1, z, "cobblestone"));
  ops.push(fill(x0, top, z, x1, top, z, "dark_oak_planks"));
}

/**
 * 玄関大広間の大階段。**左右から 8 段で回廊へ上がる。**
 *
 * 手すりは**内側の 1 本**（x ＝ ±11）に立てる——踏み幅は 5 マス残る。
 */
export function grandStairs(ops: BuildOp[]): void {
  for (let z = -41; z <= -34; z++) {
    const top = z + 42;
    for (const sx of [-1, 1]) {
      tread(ops, sx * 11, sx * 16, z, top);
      ops.push(set(sx * 11, top + 1, z, "dark_oak_fence"));
      if (z % 3 === 0) ops.push(set(sx * 11, top + 2, z, "lantern"));
    }
  }
  for (const sx of [-1, 1]) {
    for (let z = -33; z <= -32; z++) {
      ops.push(set(sx * 11, F2 + 1, z, "dark_oak_fence"));
      ops.push(set(sx * 11, F2 + 2, z, "lantern"));
    }
  }
}

/**
 * 本館の東西にある階段室。**吹き抜けの穴を開けてから段を積む。**
 *
 * **西と東で向きを変える**（`14-map-build.md` 0-6）——同じ形を並べない。
 */
export function stairHalls(ops: BuildOp[]): void {
  // ---- 西。手前（z ＝ +10）から奥（z ＝ +2）へ上がる
  ops.push(fill(-37, F2, 3, -32, F2, 10, "air"));
  for (let z = 10; z >= 2; z--) tread(ops, -37, -32, z, 10 - z);
  for (let z = 3; z <= 10; z++) ops.push(set(-31, F2 + 1, z, "dark_oak_fence"));
  ops.push(set(-34, F2 + 7, 6, "lantern"));

  // ---- 東。奥（z ＝ −10）から手前（z ＝ −2）へ上がる
  ops.push(fill(32, F2, -10, 37, F2, -3, "air"));
  for (let z = -10; z <= -2; z++) tread(ops, 32, 37, z, 10 + z);
  for (let z = -10; z <= -3; z++) ops.push(set(31, F2 + 1, z, "dark_oak_fence"));
  ops.push(set(35, F2 + 7, -6, "lantern"));
}

/** 大広間の床。**赤い絨毯の十字**と、石の縁取り */
function hallFloor(ops: BuildOp[]): void {
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      const c = Math.max(Math.abs(x), Math.abs(z));
      let b = "dark_oak_planks";
      if (c >= 9) b = ((x + z) & 1) === 0 ? "polished_andesite" : "stone_bricks";
      else if (Math.abs(x) <= 2 || Math.abs(z) <= 2) b = "red_wool";
      else if (c === 6) b = "black_wool";
      else if (noise(SEED + 41, x, 8, z) < 0.12) b = "spruce_planks";
      ops.push(set(x, F1, z, b));
    }
  }
}

/**
 * 中央の大広間。**2 層ぶち抜き、縁は回廊。**
 *
 * 柱は**回廊の下**に立てる——張り出した床を、下から支えのないまま置かない（0-5）。
 */
export function greatHallOps(ops: BuildOp[]): void {
  hallFloor(ops);
  const posts: readonly (readonly [number, number])[] = [
    [-8, -8],
    [8, -8],
    [-8, 8],
    [8, 8],
    [-8, 0],
    [8, 0],
  ];
  for (const [x, z] of posts) {
    ops.push(fill(x, F1 + 1, z, x, F2 - 1, z, "dark_oak_log"));
    ops.push(set(x, F2 - 1, z, "stripped_dark_oak_log"));
    ops.push(fill(x, F2 + 1, z, x, TOP2 - 1, z, "dark_oak_log"));
    ops.push(set(x, TOP2 - 1, z, "stripped_dark_oak_log"));
    ops.push(set(x + 1, F1 + 3, z, "torch"));
  }
  // ---- 回廊の手すり。**内側の縁（8 マス目）に立てる**
  for (let x = -8; x <= 8; x++) {
    for (const z of [-8, 8]) {
      if (Math.abs(x) === 8) continue;
      ops.push(set(x, F2 + 1, z, "dark_oak_fence"));
      railLamp(ops, x, z);
    }
  }
  for (let z = -7; z <= 7; z++) {
    for (const x of [-8, 8]) {
      ops.push(set(x, F2 + 1, z, "dark_oak_fence"));
      railLamp(ops, x, z);
    }
  }
  for (const z of [-6, 0, 6]) {
    for (const x of [-6, 6]) drop(ops, x, z, 4);
  }
  chandelier(ops);
  braziers(ops);
}

/** 吊り灯り。**天井から鎖で下げる**——中央の柱を立てると通り道を塞ぐ */
function chandelier(ops: BuildOp[]): void {
  ops.push(fill(0, TOP2 - 3, 0, 0, TOP2 - 1, 0, "dark_oak_fence"));
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    ops.push(set(dx, TOP2 - 4, dz, "lantern"));
  }
}

/** 四隅の焚き火。**赤い十字の外側に置く**——通り道は空けたまま */
function braziers(ops: BuildOp[]): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 4;
      const z = sz * 4;
      ops.push(set(x, F1, z, "cobblestone"));
      ops.push(set(x, F1 + 1, z, "campfire"));
    }
  }
}

/**
 * ゲート前の広間。**壇の上に門枠が立ち、その上を回廊が回る。**
 *
 * **ゲートの箱（1,1,39)〜(−1,5,39) には何も置かない**——
 * **門は倒し切ったときに進行の側が置く**（`20-portal.md` 0-2）。
 */
export function gateHallOps(ops: BuildOp[]): void {
  for (let x = -16; x <= 16; x++) {
    for (let z = 31; z <= 38; z++) {
      const c = Math.abs(x);
      let b = "dark_oak_planks";
      if (z >= 36 && c <= 6) b = ((x + z) & 1) === 0 ? "stone_bricks" : "polished_andesite";
      else if (c <= 2) b = "red_wool";
      else if (c === 10) b = "black_wool";
      ops.push(set(x, F1, z, b));
    }
  }
  // ---- 門枠。**箱の外側だけを飾る**
  for (const sx of [-1, 1]) {
    ops.push(fill(sx * 2, F1, 39, sx * 2, F1 + 6, 39, "chiseled_stone_bricks"));
    ops.push(fill(sx * 2, F1 + 1, 38, sx * 2, F1 + 6, 38, "dark_oak_log"));
    ops.push(set(sx * 3, F1 + 5, 38, "lantern"));
  }
  ops.push(fill(-2, F1 + 6, 39, 2, F1 + 6, 39, "chiseled_stone_bricks"));
  ops.push(fill(-1, F1 + 7, 38, 1, F1 + 7, 38, "stripped_dark_oak_log"));
  // ---- 上の回廊の手すりと、旗
  for (let z = 31; z <= 38; z++) {
    for (const sx of [-1, 1]) {
      ops.push(set(sx * 11, F2 + 1, z, "dark_oak_fence"));
      railLamp(ops, sx * 11, z);
      if (z % 3 === 1) ops.push(fill(sx * 15, F1 + 4, z, sx * 15, F1 + 7, z, "red_wool"));
    }
  }
  for (let z = 32; z <= 38; z += 3) {
    for (const sx of [-1, 1]) drop(ops, sx * 6, z, 5);
  }
  for (const z of [32, 36]) {
    for (const x of [-6, 6]) lampPost(ops, x, z);
  }
}

/** 玄関大広間の飾り。**暖炉と、天井から下がる灯り** */
export function entranceOps(ops: BuildOp[]): void {
  for (let x = -16; x <= 16; x++) {
    for (let z = -42; z <= -32; z++) {
      const c = Math.abs(x);
      let b = "dark_oak_planks";
      if (c <= 2) b = "red_wool";
      else if (c === 9) b = "black_wool";
      else if (noise(SEED + 43, x, 9, z) < 0.14) b = "spruce_planks";
      ops.push(set(x, F1, z, b));
    }
  }
  // ---- 奥の壁の暖炉。**湧いた所から正面に見える**
  ops.push(fill(-4, F1 + 1, -42, 4, F1 + 5, -42, "cobblestone"));
  ops.push(fill(-2, F1 + 1, -42, 2, F1 + 3, -42, "air"));
  ops.push(fill(-2, F1 + 1, -42, 2, F1 + 1, -42, "campfire"));
  ops.push(fill(-5, F1 + 6, -42, 5, F1 + 6, -42, "stripped_dark_oak_log"));
  for (const z of [-41, -38, -35, -32]) {
    for (const x of [-7, 7]) drop(ops, x, z, 5);
  }
  // **湧いた所の真上に鎖を下げない**——目の前が鎖で塞がる（2026-09-06 に絵で気づいた）
  for (const z of [-41, -37, -33]) {
    for (const x of [-6, 6]) lampPost(ops, x, z);
  }
}
