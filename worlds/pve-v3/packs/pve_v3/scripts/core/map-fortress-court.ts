/**
 * ネザー要塞の**中庭**。**純粋。**
 *
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 *
 * > ### ここだけ色が変わる
 * >
 * > 要塞は黒レンガ一色なので、**苗床の茶と赤、光る菌の橙**が効く。
 * > **囲いを低くして**、上から中の色が見えるようにしてある。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise, wave } from "./map-frame.js";
import { brickCap, CREST, DECK, lavaFall, paveCap, pinnacle, podium, rimCap, ruinCap } from "./map-fortress-parts.js";
import { inSea, SEED } from "./map-fortress-sea.js";

/**
 * 中庭。**広間より細くする。**
 *
 * ここまで広間と同じ幅だと、**手前から奥まで 1 枚の塊**になって、
 * 溶岩の海が両脇に見えなくなる。**絞った所で海が食い込む。**
 */
const COURT = { x: 13, z1: 6, z2: 14 } as const;

/** 中庭の窪み。**1 マスだけ下げる**——2 マス下げると登れなくなる（0-8） */
const SUNK = { x: 9, z1: 7, z2: 13 } as const;

/** 基壇を敷く。**縁の外は溶岩**なので、島の内側だけ。**溶岩に面した縁は焼ける** */
function floor(ops: BuildOp[], pave: number): void {
  for (let x = -COURT.x; x <= COURT.x; x++) {
    for (let z = COURT.z1; z <= COURT.z2; z++) {
      if (!inSea(x, z)) continue;
      const worn = wave(SEED + 35, x, z, 13);
      const rim = Math.abs(x) === COURT.x || !inSea(x + 1, z) || !inSea(x - 1, z);
      const cap = rim
        ? rimCap(x, z)
        : Math.abs(x) >= pave
          ? paveCap(x, z)
          : worn < -0.4
            ? ruinCap(x, z)
            : brickCap(x, z);
      podium(ops, x, z, DECK, cap);
    }
  }
}

/**
 * 中庭。**ソウルサンドとネザーウォート、そしてキノコ。**
 *
 * > ### 大きなキノコは建てられない
 * >
 * > 傘は 3 × 3 でも、**天端が 9 マスまとまって「登れない面」になる**（0-8）。
 * > **小さいキノコと光る菌**だけにして、色は苗床の側で出す。
 */
export function courtOps(ops: BuildOp[]): void {
  floor(ops, 12);
  // > ### 中庭に高い壁は回さない
  // >
  // > **壁で囲うと苗床が上から見えず、天端も控え壁を置く幅が無くて登れない**（0-8）。
  // > **低い縁石と手すり**にする——中の色がそのまま外へ出る。
  for (const s of [1, -1]) {
    for (let z = COURT.z1; z <= COURT.z2; z++) {
      for (const t of [0, 1]) ops.push(set((11 + t) * s, DECK + 1, z, brickCap((11 + t) * s, z, 1)));
      if (noise(SEED + 77, z, s) > 0.26) ops.push(set(12 * s, DECK + 2, z, "nether_brick_fence"));
    }
    for (const z of [7, 10, 14]) {
      pinnacle(ops, 12 * s, z, DECK + 2, DECK + 4, noise(SEED + 79, z, s) > 0.5 ? "glowstone" : "magma");
    }
  }
  for (let x = -SUNK.x; x <= SUNK.x; x++) {
    for (let z = SUNK.z1; z <= SUNK.z2; z++) {
      const r = noise(SEED + 71, x, z);
      const bed = r > 0.9 ? "shroomlight" : r > 0.78 ? "nether_wart_block" : r > 0.4 ? "soul_sand" : "soul_soil";
      ops.push(set(x, DECK - 1, z, bed));
      ops.push(set(x, DECK, z, "air"));
      const p = noise(SEED + 73, x, z);
      if (bed === "soul_sand" && p > 0.74) ops.push(set(x, DECK, z, "nether_wart"));
      else if (p > 0.94) ops.push(set(x, DECK, z, "red_mushroom"));
      else if (p > 0.9) ops.push(set(x, DECK, z, "brown_mushroom"));
      else if (p > 0.83) ops.push(set(x, DECK, z, "crimson_roots"));
      else if (p > 0.79) ops.push(set(x, DECK, z, "nether_sprouts"));
    }
  }
  // 溶岩の溜まり。**縁と同じ高さ**なので、歩いて回り込める
  ops.push(fill(-7, DECK - 1, 9, -5, DECK - 1, 11, "lava"));
  for (const [x, z, h] of [
    [-8, 8, 4],
    [8, 12, 5],
    [-7, 13, 3],
    [7, 7, 4],
  ] as const) {
    pinnacle(ops, x, z, DECK, DECK + h, "magma");
  }
  for (const [x, z] of [
    [14, 10],
    [-14, 8],
  ] as const) {
    lavaFall(ops, x, z, DECK - 1);
  }
}
