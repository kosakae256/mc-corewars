/**
 * 10. 石の要塞——**奥のポータル部屋と、ゲートの枠。**
 *
 * 間取りは `map-stronghold-plan.ts`。
 *
 * > ### **枠だけ置く。ポータルは置かない**（`14-map-build.md` 0-2-1）
 * >
 * > 壇の上の `end_portal_frame` は**見どころの飾り**で、
 * > **通り道ではない。** 実際に進むのは**壁の箱**——
 * > **(1, 1, 39) 〜 (−1, 5, 39)** で、**倒し切ったときに進行の側が置く。**
 *
 * > ### **溶岩は格子で囲う**
 * >
 * > バニラのポータル部屋と同じ絵にしたいが、
 * > **このマップは「落ちたら死ぬ」ではない**（`02-map.md` 5 章）。
 * > **入れないようにしてから置く。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise } from "./map-frame.js";
import { SEED, stoneAt } from "./map-stronghold-plan.js";

/** 部屋の範囲と、壇の中心 */
const ROOM = { x1: -12, x2: 12, z1: 28, z2: 38, ceil: 12 } as const;
const DAIS = { x1: -4, x2: 4, z1: 30, z2: 37 } as const;
const RING_Z = 34;

/** ゲートの面。**この 1 枚を挟んで、向こうは岩** */
const GATE_Z = 39;

/**
 * ポータル部屋。**壇・枠・溶岩の堀・壁の付け柱。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function portalRoomOps(ops: BuildOp[]): void {
  dais(ops);
  // **裾は溶岩の堀より先**——後にすると、堀を囲う格子を平板が食う
  daisSteps(ops);
  frameRing(ops);
  lavaMoat(ops);
  roomWalls(ops);
}

/** 壇の裾。**平板で回す**——1 マスの段差を、半マス 2 つに割って見せる */
function daisSteps(ops: BuildOp[]): void {
  for (let x = DAIS.x1 - 1; x <= DAIS.x2 + 1; x++) {
    for (const z of [DAIS.z1 - 1, DAIS.z2 + 1]) ops.push(set(x, GROUND + 1, z, "stone_brick_slab"));
  }
  for (let z = DAIS.z1; z <= DAIS.z2; z++) {
    for (const x of [DAIS.x1 - 1, DAIS.x2 + 1]) ops.push(set(x, GROUND + 1, z, "stone_brick_slab"));
  }
}

/** 壇。**高さ 1**——1 マスなら登れる（`14-map-build.md` 0-8） */
function dais(ops: BuildOp[]): void {
  ops.push(fill(DAIS.x1, GROUND + 1, DAIS.z1, DAIS.x2, GROUND + 1, DAIS.z2, "stone_bricks"));
  for (let x = DAIS.x1; x <= DAIS.x2; x++) {
    for (let z = DAIS.z1; z <= DAIS.z2; z++) {
      const edge = x === DAIS.x1 || x === DAIS.x2 || z === DAIS.z1 || z === DAIS.z2;
      if (edge) ops.push(set(x, GROUND + 1, z, "chiseled_stone_bricks"));
      else if (noise(SEED + 167, x, 8, z) < 0.18) ops.push(set(x, GROUND + 1, z, "cracked_stone_bricks"));
    }
  }
}

/**
 * 枠の輪。**12 個の `end_portal_frame` を、角を欠いた 5 × 5 に並べる。**
 *
 * **中は黒曜石で埋める**——空けておくと「まだ開いていない穴」に見えて、
 * **本物のゲート（壁の箱）と紛らわしい。**
 */
function frameRing(ops: BuildOp[]): void {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const x = dx;
      const z = RING_Z + dz;
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 2;
      const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      if (ring && !corner) {
        ops.push(set(x, GROUND + 2, z, "end_portal_frame"));
        continue;
      }
      if (corner) {
        ops.push(set(x, GROUND + 2, z, "chiseled_stone_bricks"));
        continue;
      }
      ops.push(set(x, GROUND + 1, z, "obsidian"));
    }
  }
  // ---- 枠を照らす。**壇の四隅に置く**——床置きなので宙に浮かない
  for (const x of [DAIS.x1 + 1, DAIS.x2 - 1]) {
    for (const z of [DAIS.z1 + 1, DAIS.z2 - 1]) {
      ops.push(set(x, GROUND + 2, z, "cobblestone_wall"));
      ops.push(set(x, GROUND + 3, z, "lantern"));
    }
  }
}

/**
 * 壇の両脇の溶岩の堀。
 *
 * **縁に格子を立てて、入れないようにする**——
 * このマップは落ちて死ぬ作りではない。
 */
function lavaMoat(ops: BuildOp[]): void {
  for (const sx of [-1, 1]) {
    const a = sx * 6;
    const b = sx * 8;
    const x1 = Math.min(a, b);
    const x2 = Math.max(a, b);
    // **溶岩は床と同じ高さ**——1 マス沈めると、立っていても見えない
    ops.push(fill(x1, GROUND, DAIS.z1, x2, GROUND, DAIS.z2, "lava"));
    // ---- 縁の格子。**堀を囲い切る**
    for (let z = DAIS.z1; z <= DAIS.z2; z++) {
      ops.push(set(sx * 5, GROUND + 1, z, "iron_bars"));
      ops.push(set(sx * 9, GROUND + 1, z, "iron_bars"));
    }
    for (let x = x1 - 1; x <= x2 + 1; x++) {
      ops.push(set(x, GROUND + 1, DAIS.z1 - 1, "iron_bars"));
      ops.push(set(x, GROUND + 1, DAIS.z2 + 1, "iron_bars"));
    }
  }
}

/** 壁の付け柱と、天井の格間。**長い壁を刻む** */
function roomWalls(ops: BuildOp[]): void {
  for (let z = ROOM.z1 + 1; z <= ROOM.z2 - 1; z += 3) {
    for (const x of [ROOM.x1, ROOM.x2]) {
      ops.push(fill(x, GROUND + 1, z, x, ROOM.ceil - 1, z, "chiseled_stone_bricks"));
      ops.push(set(x, ROOM.ceil - 2, z, "glowstone"));
    }
    for (let x = ROOM.x1; x <= ROOM.x2; x++) ops.push(set(x, ROOM.ceil, z, "chiseled_stone_bricks"));
    for (const x of [-7, 7]) ops.push(set(x, ROOM.ceil, z, "glowstone"));
  }
  // ---- 奥の壁。**枠の外側にも付け柱を回す**——一枚壁を残さない（0-4）
  for (const x of [-11, -8, 8, 11]) {
    ops.push(fill(x, GROUND + 1, GATE_Z, x, ROOM.ceil - 1, GATE_Z, "chiseled_stone_bricks"));
    ops.push(set(x, GROUND + 4, GATE_Z, "glowstone"));
  }
  // ---- 床の紋様。**枠へ向かう筋を引く**
  for (let z = ROOM.z1; z <= ROOM.z2; z++) {
    for (const x of [-10, 10]) ops.push(set(x, GROUND, z, "chiseled_stone_bricks"));
  }
}

/**
 * ゲートの枠。
 *
 * **箱（−1..1, 1..5, z ＝ 39）には何も置かない**（`14-map-build.md` 0-2-1）——
 * **飾るのは箱の外側だけ。** 最後に `openGate` が箱を空ける。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function gateFrame(ops: BuildOp[]): void {
  for (const x of [-3, -2, 2, 3]) ops.push(fill(x, GROUND + 1, GATE_Z, x, 6, GATE_Z, "chiseled_stone_bricks"));
  for (const x of [-5, -4, 4, 5]) {
    ops.push(fill(x, GROUND + 1, GATE_Z, x, 7, GATE_Z, "stone_bricks"));
    for (let y = GROUND + 1; y <= 7; y++) ops.push(set(x, y, GATE_Z, stoneAt(x, y, GATE_Z)));
    ops.push(set(x, 8, GATE_Z, "chiseled_stone_bricks"));
  }
  // ---- 迫りの頭。**箱は y ＝ 5 まで**なので、頭は 6 から上に載せる
  for (let x = -3; x <= 3; x++) {
    ops.push(set(x, Math.abs(x) <= 1 ? 7 : 6, GATE_Z, "chiseled_stone_bricks"));
    if (Math.abs(x) <= 1) ops.push(set(x, 6, GATE_Z, "stone_bricks"));
  }
  // ---- 敷居と、手前に立てる灯り
  for (let x = -4; x <= 4; x++) ops.push(set(x, GROUND, GATE_Z - 1, "chiseled_stone_bricks"));
  for (const x of [-6, 6]) {
    ops.push(fill(x, GROUND + 1, GATE_Z - 2, x, GROUND + 2, GATE_Z - 2, "chiseled_stone_bricks"));
    ops.push(set(x, GROUND + 3, GATE_Z - 2, "lantern"));
  }
  // ---- 枠の脇にも灯り。**ここが行き先だと分かるように、いちばん明るくする**
  for (const x of [-4, 4]) ops.push(set(x, 9, GATE_Z - 1, "glowstone"));
  for (const x of [-2, 2]) ops.push(set(x, 8, GATE_Z, "glowstone"));
}
