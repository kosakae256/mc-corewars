/**
 * 10. 石の要塞——**中央の広間。** 4 本の太柱と、十字に沈めた水盤。
 *
 * 間取りは `map-stronghold-plan.ts`。
 *
 * > ### **x ＝ 0 には何も立てない**
 * >
 * > 検査 0-3 の線が **x ＝ 0・y ＝ 4** でこの部屋を横切る（`14-map-build.md` 0-9）。
 * > **水盤は床より下に掘る**ので当たらないが、**柱と付け柱は背骨を避ける。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND } from "./map-frame.js";
import { stoneAt } from "./map-stronghold-plan.js";

/** 広間の範囲と、太柱の立つ所 */
const HALL = { x1: -13, x2: 13, z1: -6, z2: 10, ceil: 14 } as const;
const PIER_X = [-8, 8];
const PIER_Z = [-2, 6];

/**
 * 中央の広間。**4 本の太柱と、十字に沈めた水盤。**
 *
 * **水盤は床より下に掘る**ので、0-3 の線（y ＝ 4）には当たらない。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function crossingOps(ops: BuildOp[]): void {
  piers(ops);
  basin(ops);
  hallLights(ops);
  hallWalls(ops);
}

/**
 * 広間の壁。**14 マスの一枚壁を作らない**（0-4）。
 *
 * **付け柱を 4 マスおきに立て、間に明かりを埋める。**
 */
function hallWalls(ops: BuildOp[]): void {
  for (let z = HALL.z1 + 1; z <= HALL.z2 - 1; z += 4) {
    for (const x of [HALL.x1, HALL.x2]) {
      ops.push(fill(x, GROUND + 1, z, x, HALL.ceil - 1, z, "chiseled_stone_bricks"));
      ops.push(set(x, GROUND + 4, z, "glowstone"));
    }
  }
  for (let x = HALL.x1 + 3; x <= HALL.x2 - 3; x += 5) {
    // **背骨が入ってくる口は空ける**——塞ぐと 0-3 の線が通らない
    if (Math.abs(x) <= 5) continue;
    for (const z of [HALL.z1, HALL.z2]) {
      ops.push(fill(x, GROUND + 1, z, x, HALL.ceil - 1, z, "chiseled_stone_bricks"));
      ops.push(set(x, GROUND + 4, z, "glowstone"));
    }
  }
}

/** 太柱 4 本。**3 × 3 で天井まで通す**——広間の高さを見せる */
function piers(ops: BuildOp[]): void {
  for (const cx of PIER_X) {
    for (const cz of PIER_Z) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const x = cx + dx;
          const z = cz + dz;
          ops.push(fill(x, GROUND + 1, z, x, HALL.ceil - 1, z, "stone_bricks"));
          for (let y = GROUND + 1; y < HALL.ceil; y++) {
            const b = stoneAt(x, y, z);
            if (b !== "stone_bricks") ops.push(set(x, y, z, b));
          }
          // ---- 根元と柱頭は彫り石。**帯があると、ただの角柱に見えない**
          ops.push(set(x, GROUND + 1, z, "chiseled_stone_bricks"));
          ops.push(set(x, HALL.ceil - 1, z, "chiseled_stone_bricks"));
          ops.push(set(x, HALL.ceil - 5, z, "chiseled_stone_bricks"));
        }
      }
      // ---- 灯りは床置き。**宙に浮かせない**
      ops.push(set(cx - 2, GROUND + 1, cz - 2, "lantern"));
      ops.push(set(cx + 2, GROUND + 1, cz + 2, "lantern"));
    }
  }
}

/** 十字の水盤。**縁は彫り石**——ただの穴に見えないように */
function basin(ops: BuildOp[]): void {
  const cz = 2;
  const inPool = (x: number, z: number): boolean =>
    (Math.abs(x) <= 5 && Math.abs(z - cz) <= 1) || (Math.abs(x) <= 1 && Math.abs(z - cz) <= 5);
  for (let x = HALL.x1; x <= HALL.x2; x++) {
    for (let z = HALL.z1; z <= HALL.z2; z++) {
      if (inPool(x, z)) {
        ops.push(set(x, GROUND, z, "air"));
        ops.push(set(x, GROUND - 1, z, "water"));
        continue;
      }
      const rim = inPool(x + 1, z) || inPool(x - 1, z) || inPool(x, z + 1) || inPool(x, z - 1);
      if (rim) ops.push(set(x, GROUND, z, "chiseled_stone_bricks"));
    }
  }
}

/** 広間の灯り。**天井に円く並べる**——4 本の柱の間を照らす */
function hallLights(ops: BuildOp[]): void {
  for (let x = HALL.x1 + 2; x <= HALL.x2 - 2; x += 4) {
    for (let z = HALL.z1 + 2; z <= HALL.z2 - 2; z += 4) {
      if (Math.abs(x) <= 2 && Math.abs(z - 2) <= 2) continue;
      ops.push(set(x, HALL.ceil - 1, z, "glowstone"));
    }
  }
}
