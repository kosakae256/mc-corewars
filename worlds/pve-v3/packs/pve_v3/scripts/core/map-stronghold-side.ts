/**
 * 10. 石の要塞——**脇の 6 部屋。** 井戸・石棺・苔・崩れ・貯水・掘りかけ。
 *
 * 間取りは `map-stronghold-plan.ts`。
 *
 * > ### **同じ部屋を 6 つ並べない**（`14-map-build.md` 0-6）
 * >
 * > 大きさも、置くものも、明るさも変える。
 * > **「掘りかけの間」だけは面を張らず、生の岩を見せる**——
 * > **要塞がまだ出来ていない**という顔をさせるため。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise, speckle } from "./map-frame.js";
import { SEED, floorAt } from "./map-stronghold-plan.js";

/** 水を張るときの、水面の段。**床より 1 マス低い**——落ちても 1 マスで上がれる */
const WATER = GROUND - 1;

// ================================================================ 井戸の間

/**
 * 井戸の間。**中央に竪穴、そこから四方へ水の溝。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function wellOps(ops: BuildOp[]): void {
  // ---- 竪穴。**水で満たす**ので、落ちても泳いで上がれる
  ops.push(fill(-21, WATER - 5, 1, -19, WATER, 3, "water"));
  ops.push(fill(-21, GROUND, 1, -19, GROUND, 3, "air"));
  wellRim(ops);
  wellChannels(ops);
  for (const z of [-4, 8]) {
    for (const x of [-24, -17]) {
      ops.push(set(x, GROUND + 1, z, "cobblestone_wall"));
      ops.push(set(x, GROUND + 2, z, "lantern"));
    }
  }
  for (const z of [-2, 6]) {
    for (const x of [-24, -17]) ops.push(set(x, 9, z, "glowstone"));
  }
}

/** 井戸の囲いと、桶を吊る梁 */
function wellRim(ops: BuildOp[]): void {
  for (let x = -22; x <= -18; x++) {
    for (let z = 0; z <= 4; z++) {
      if (x >= -21 && x <= -19 && z >= 1 && z <= 3) continue;
      // **正面は空ける**——ぐるりと囲うと、ただの井桁に見える
      if (x === -20 && (z === 0 || z === 4)) continue;
      ops.push(set(x, GROUND + 1, z, "cobblestone_wall"));
    }
  }
  for (const x of [-22, -18]) ops.push(fill(x, GROUND + 1, 2, x, GROUND + 4, 2, "oak_fence"));
  ops.push(fill(-22, GROUND + 5, 2, -18, GROUND + 5, 2, "oak_planks"));
  ops.push(fill(-20, GROUND + 3, 2, -20, GROUND + 4, 2, "iron_chain"));
}

/** 四方へ延びる水の溝。**井戸から水を引いた跡** */
function wellChannels(ops: BuildOp[]): void {
  for (let x = -25; x <= -23; x++) trench(ops, x, 2);
  for (let x = -17; x <= -16; x++) trench(ops, x, 2);
  for (let z = -5; z <= 0; z++) trench(ops, -20, z);
  for (let z = 4; z <= 9; z++) trench(ops, -20, z);
}

/** 溝 1 マス。**深さ 1**——跨げるし、落ちても上がれる */
function trench(ops: BuildOp[], x: number, z: number): void {
  ops.push(set(x, GROUND, z, "air"));
  ops.push(set(x, WATER, z, "water"));
}

// ================================================================ 石棺の間

/**
 * 石棺の間。**4 つの棺と、壁の窪み。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function tombOps(ops: BuildOp[]): void {
  for (const x of [18, 23]) {
    for (const z of [-3, 5]) {
      ops.push(fill(x, GROUND + 1, z, x, GROUND + 1, z + 2, "chiseled_stone_bricks"));
      ops.push(fill(x, GROUND + 2, z, x, GROUND + 2, z + 2, "stone_brick_slab"));
      if (noise(SEED + 127, x, z) < 0.55) ops.push(set(x, GROUND + 2, z, "skeleton_skull"));
    }
  }
  // ---- 中央の壇。**1 マスなので登れる**（0-8）
  ops.push(fill(20, GROUND + 1, 1, 21, GROUND + 1, 3, "chiseled_stone_bricks"));
  // ---- 東の壁を 1 マス彫り込んだ窪み。**平らな壁を作らない**
  for (const z of [-4, 4, 8]) {
    ops.push(fill(26, GROUND + 1, z, 26, GROUND + 3, z, "air"));
    ops.push(set(26, GROUND + 1, z, "soul_lantern"));
  }
  for (const [x, z] of [
    [17, -5],
    [25, 9],
    [24, -5],
  ]) {
    ops.push(set(x, GROUND + 4, z, "web"));
  }
  // ---- 天井の明かり。**青い灯りだけでは暗すぎて、棺が見えない**
  for (const z of [-2, 2, 6]) {
    for (const x of [17, 24]) ops.push(set(x, 9, z, "glowstone"));
  }
}

// ================================================================ 苔の間

/** 苔の間の床に混ぜる材 */
const MOSS_MATS = ["moss_block", "mossy_cobblestone", "mossy_stone_bricks", "cobblestone", "stone_bricks"];

/**
 * 苔の間。**水が染みて、床も天井も苔に覆われている。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function mossOps(ops: BuildOp[]): void {
  for (let x = -25; x <= -15; x++) {
    for (let z = 12; z <= 19; z++) {
      ops.push(set(x, GROUND, z, speckle(SEED + 131, x, z, MOSS_MATS)));
      // **流れの上には敷かない**——床を抜くので、敷くと苔が宙に浮く（0-5）
      if (z !== 15 && z !== 16 && noise(SEED + 137, x, 2, z) < 0.22) {
        ops.push(set(x, GROUND + 1, z, "moss_carpet"));
      }
      if (noise(SEED + 139, x, 3, z) < 0.16) ops.push(set(x, 8, z, "mossy_cobblestone"));
    }
  }
  // ---- 部屋を横切る浅い流れ
  for (let x = -25; x <= -15; x++) {
    trench(ops, x, 15);
    trench(ops, x, 16);
  }
  for (const x of [-24, -16]) {
    ops.push(set(x, GROUND + 1, 13, "cobblestone_wall"));
    ops.push(set(x, GROUND + 2, 13, "lantern"));
  }
  for (const x of [-23, -18]) ops.push(set(x, 8, 18, "glowstone"));
}

// ================================================================ 崩れの間

/**
 * 崩れの間。**天井が落ち、柱が折れている。**
 *
 * **瓦礫は高さ 1 まで**——2 マス積むと登れない面ができる（0-8）。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function ruinOps(ops: BuildOp[]): void {
  for (let x = 15; x <= 25; x++) {
    for (let z = 12; z <= 19; z++) {
      const r = noise(SEED + 149, x, 4, z);
      if (r < 0.26) ops.push(set(x, GROUND + 1, z, r < 0.12 ? "cobblestone" : "cobblestone"));
      // ---- 天井が垂れ下がっている所
      if (noise(SEED + 151, x, 5, z) < 0.18) ops.push(set(x, 7, z, "cracked_stone_bricks"));
    }
  }
  // ---- 折れた柱。**高さを 1 本ずつ変える**（0-6）
  const stumps: readonly [number, number, number][] = [
    [17, 14, 4],
    [21, 13, 2],
    [23, 17, 5],
    [18, 18, 3],
  ];
  for (const [x, z, h] of stumps) {
    ops.push(fill(x, GROUND + 1, z, x, h, z, "stone_bricks"));
    ops.push(set(x, h, z, "cracked_stone_bricks"));
  }
  // **蜘蛛の巣は天井に張る**——宙に浮くと塊から切り離される（0-5）
  for (const [x, z] of [
    [16, 12],
    [24, 19],
    [20, 16],
  ]) {
    ops.push(set(x, 7, z, "web"));
  }
  ops.push(set(22, GROUND + 1, 12, "lantern"));
  ops.push(set(16, GROUND + 1, 19, "lantern"));
  for (const x of [18, 23]) ops.push(set(x, 8, 15, "glowstone"));
}

// ================================================================ 貯水の間

/**
 * 貯水の間。**水を溜める槽と、そこに立つ細い橋脚。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function cisternOps(ops: BuildOp[]): void {
  ops.push(fill(-40, WATER - 2, -6, -36, WATER, 6, "water"));
  ops.push(fill(-40, GROUND, -6, -36, GROUND, 6, "air"));
  // ---- 橋脚。**水の底から天井まで通す**——浮かせない（0-5）
  for (const z of [-4, 0, 4]) {
    ops.push(fill(-38, WATER - 3, z, -38, 7, z, "stone_bricks"));
    ops.push(set(-38, GROUND + 1, z, "chiseled_stone_bricks"));
    ops.push(set(-38, 7, z, "chiseled_stone_bricks"));
  }
  // ---- 槽の縁の手すり。**切れ目を空ける**——落ちたときに上がる所
  for (let z = -7; z <= 7; z++) {
    for (const x of [-41, -35]) {
      if ((z + 9) % 5 === 0) continue;
      ops.push(set(x, GROUND + 1, z, "iron_bars"));
    }
  }
  for (const z of [-8, 8]) {
    ops.push(set(-38, GROUND + 1, z, "cobblestone_wall"));
    ops.push(set(-38, GROUND + 2, z, "lantern"));
  }
  for (const z of [-5, 0, 5]) ops.push(set(-38, 8, z, "glowstone"));
}

// ================================================================ 掘りかけの間

/** 生の岩に混ぜる材。**面を張らない**ので、ここだけ石レンガが出てこない */
const RAW_MATS = ["stone", "andesite", "tuff", "cobblestone", "cobblestone", "deepslate"];

/**
 * 掘りかけの間。**東へ行くほど岩が残っている。**
 *
 * **段は 1 マスずつ**——彫りかけでも登れるようにする（0-8）。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function quarryOps(ops: BuildOp[]): void {
  for (let x = 37; x <= 41; x++) {
    const h = x - 36;
    for (let z = -7; z <= 7; z++) {
      ops.push(fill(x, GROUND + 1, z, x, h, z, "stone"));
      for (let y = GROUND + 1; y <= h; y++) ops.push(set(x, y, z, speckle(SEED + 157, x, y * 7 + z, RAW_MATS)));
    }
  }
  // ---- 足場。**丸太と板**。上がれなくてよい（飾り）
  for (const z of [-5, 5]) {
    ops.push(fill(35, GROUND + 1, z, 35, GROUND + 4, z, "oak_fence"));
    ops.push(fill(36, GROUND + 1, z, 36, GROUND + 3, z, "oak_fence"));
  }
  ops.push(fill(35, GROUND + 5, -5, 36, GROUND + 5, 5, "oak_planks"));
  // ---- 掘った屑
  for (let x = 35; x <= 36; x++) {
    for (let z = -8; z <= 8; z++) {
      if (noise(SEED + 163, x, 6, z) > 0.3) continue;
      ops.push(set(x, GROUND, z, floorAt(x, z) === "stone_bricks" ? "cobblestone" : "cobblestone"));
    }
  }
  for (const z of [-6, 0, 6]) ops.push(set(35, 8, z, "glowstone"));
  ops.push(set(36, GROUND + 1, 8, "lantern"));
  ops.push(set(36, GROUND + 1, -8, "lantern"));
}
