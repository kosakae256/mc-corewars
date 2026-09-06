/**
 * 7. 地下水路——**床。** 交差の広間の敷石・水へ降りる段・崩れた石。
 *
 * 寸法は `map-aqueduct-plan.ts`。
 *
 * > ### 広間の床を、歩廊と同じ混ぜ方で塗らない
 * >
 * > **一面が同じだと、いちばん広い所がいちばん退屈になる。**
 * > **交差の周りだけ敷石にして、縁取りを回す。**
 */

import { set, type BuildOp } from "./build.js";
import {
  CANAL_H,
  CANAL_Z0,
  CANAL_Z1,
  CROSS_H,
  DECK,
  KERB_X,
  NAVE,
  SEED,
  WATER_Y,
  Z0,
  Z1,
  cellAt,
  halfAt,
  isAisleCol,
  isArcade,
} from "./map-aqueduct-plan.js";
import { noise, speckle } from "./map-frame.js";

/** 広間の敷石を回す範囲 */
const PLAZA_Z = 15;

/** 崩れて落ちている石 */
const DEBRIS = ["cobblestone", "mossy_cobblestone", "cobblestone", "cracked_stone_bricks", "andesite", "stone"];

/**
 * 交差の広間の敷石。**2 マス角の市松と、縁取りの筋。**
 *
 * **水路と樋は塗らない**——床の役割は `cellAt` が持っている。
 */
export function plazaFloor(ops: BuildOp[]): void {
  for (let z = -PLAZA_Z; z <= PLAZA_Z; z++) {
    const w = halfAt(z);
    for (let x = -w; x <= w; x++) {
      if (isArcade(x, w) || isAisleCol(x, w, z)) continue;
      if (cellAt(x, z, w) !== "deck") continue;
      ops.push(set(x, DECK, z, plazaMat(x, z)));
    }
  }
}

function plazaMat(x: number, z: number): string {
  // ---- 縁取り。**水路沿い・アーケードの外・交差の外周**に 1 本ずつ
  const edge = Math.abs(z) === CROSS_H + 2 || Math.abs(x) === KERB_X + 1 || Math.abs(x) === NAVE + 2;
  if (edge) return "chiseled_stone_bricks";
  // ---- 擦り減り。**縁取りの上には乗せない**（線が途切れて見えなくなる）
  if (noise(SEED + 67, x, 4, z) < 0.11) return "mossy_cobblestone";
  const tile = (Math.floor((x + 60) / 2) + Math.floor((z + 60) / 2)) & 1;
  return tile === 0 ? "polished_andesite" : "tuff";
}

/**
 * 水路の両端に、**水へ降りる段**を沈める。
 *
 * **岸から水面へ 1 マスずつ**——落ちても上がれるし、
 * **端が垂直に切れているより、水路の始まりに見える。**
 */
export function headSteps(ops: BuildOp[]): void {
  for (let i = 0; i < 3; i++) {
    for (const z of [CANAL_Z0 + i, CANAL_Z1 - i]) {
      for (let x = -CANAL_H; x <= CANAL_H; x++) {
        ops.push(set(x, WATER_Y - i, z, i === 0 ? "mossy_cobblestone" : "cobblestone"));
      }
    }
  }
}

/**
 * 崩れて落ちている石。**歩廊のがらんとした所に散らす。**
 *
 * **水路の縁には積まない**——落ちる／上がる動きの邪魔になる。
 */
export function rubble(ops: BuildOp[]): void {
  for (let z = Z0 + 3; z <= Z1 - 3; z++) {
    const w = halfAt(z);
    if (w < 10) continue;
    if (Math.abs(z) <= CROSS_H + 2) continue;
    for (let x = -w + 1; x <= w - 1; x++) {
      if (Math.abs(x) <= KERB_X + 1 || Math.abs(x) === NAVE) continue;
      const r = noise(SEED + 71, x, 7, z);
      if (r > 0.02) continue;
      ops.push(set(x, DECK + 1, z, speckle(SEED + 73, x, z, DEBRIS)));
      // **たまに 2 段**。同じ高さの粒が散っているだけだと、置いた物に見える
      if (r < 0.004) ops.push(set(x, DECK + 2, z, speckle(SEED + 79, x, z, DEBRIS)));
    }
  }
}
