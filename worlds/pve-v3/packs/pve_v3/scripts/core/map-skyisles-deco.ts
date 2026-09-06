/**
 * 戦場 02「雲の上の浮島」——**島ごとの意匠。純粋。**
 *
 * > ### 高いものは「1 マスずつ登れる」か「1 本きり」か（0-8）
 * >
 * > **壇は 1 段ずつ積む**（9 × 9 → 7 × 7 → 5 × 5）。
 * > **1 本の柱は回り込める**ので、何マス高くてもよい。
 * > **やってはいけないのは「高さ 2 以上の面が、まとまって残る」こと**——
 * > 壁を建てるなら**土台まで崩す**（高さ 1）。
 */

import { set, type BuildOp } from "./build.js";
import { noise, speckle, wave } from "./map-frame.js";
import { SEED } from "./map-skyisles-shape.js";
import { hasTop, level, stand, topOf } from "./map-skyisles-terrain.js";

const ROCK = ["andesite", "stone", "cobblestone", "tuff", "diorite"];
const OLD = ["mossy_cobblestone", "cobblestone", "cracked_stone_bricks", "mossy_stone_bricks", "andesite"];

/** 環に置く点。**等間隔に置かない**——角度も半径も 1 つずつずらす（0-6） */
function ring(cx: number, cz: number, r: number, n: number, seed: number): readonly { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + noise(seed, i, 0) * 0.7) / n) * Math.PI * 2;
    const rr = r * (0.8 + noise(seed + 1, i, 1) * 0.4);
    out.push({ x: Math.round(cx + Math.cos(a) * rr), z: Math.round(cz + Math.sin(a) * rr) });
  }
  return out;
}

/** 主島——**環状列石・段の遺構・凍った池・崩れた壁** */
export function mainIsle(ops: BuildOp[], tops: Map<string, number>): void {
  // ---- 環状列石。**高さを 1 本ずつ変え、2 本は倒してある**
  const stones = ring(-11, -6, 5.5, 11, SEED + 201);
  stones.forEach((p, i) => {
    if (!hasTop(tops, p.x, p.z)) return;
    if (i % 5 === 3) {
      // **倒れた石。** 高さ 1 なので、そのまま踏んで越えられる
      for (let d = 0; d < 3; d++) {
        const x = p.x + (i % 2 === 0 ? d : 0);
        const z = p.z + (i % 2 === 0 ? 0 : d);
        if (hasTop(tops, x, z)) ops.push(set(x, topOf(tops, x, z) + 1, z, speckle(SEED + 203, x, z, OLD)));
      }
      return;
    }
    stand(ops, tops, p.x, p.z, 3 + Math.round(noise(SEED + 205, p.x, p.z) * 2), ROCK);
  });
  // ---- 中央の一枚岩。**2 マス並びなので、上は登れないが回り込める**
  for (const dz of [0, 1]) stand(ops, tops, -11, -6 + dz, 5 + dz, ["andesite", "tuff", "deepslate", "stone"]);

  steps(ops, tops, -7, -14, 3);
  pool(ops, tops, 7, -8, 3);
  walls(ops, tops);
}

/**
 * 段の遺構。**外から内へ 1 段ずつ**（9 × 9 → 7 × 7 → 5 × 5 → 3 × 3）。
 *
 * **敵も登れる**（0-8）。てっぺんにだけ 1 本、標を立てる。
 */
function steps(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, half: number): void {
  const base = topOf(tops, cx, cz);
  for (let step = 0; step <= half; step++) {
    const h = half - step;
    for (let x = cx - h; x <= cx + h; x++) {
      for (let z = cz - h; z <= cz + h; z++) {
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) !== h && step !== half) continue;
        if (!hasTop(tops, x, z)) continue;
        level(ops, tops, x, z, base + step, speckle(SEED + 211, x, z, OLD));
      }
    }
  }
  stand(ops, tops, cx, cz, 2, ["chiseled_stone_bricks", "stone_bricks"], "lantern");
}

/** 凍った池。**1 マス掘り下げるだけ**——落ちても登り返せる */
function pool(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, r: number): void {
  // **`ice` は明かりで溶けて水になる。** 灯りを置く島では使わない
  const mats = ["packed_ice", "blue_ice", "packed_ice", "blue_ice", "calcite"];
  const base = topOf(tops, cx, cz);
  for (let x = cx - 5; x <= cx + 5; x++) {
    for (let z = cz - 5; z <= cz + 5; z++) {
      const d = Math.hypot(x - cx, z - cz) + wave(SEED + 221, x, z, 5) * 0.9;
      if (d > r + 1.4 || !hasTop(tops, x, z)) continue;
      // **縁は霜、内は氷**——1 マスごとに引く（0-7）
      if (d > r) {
        level(ops, tops, x, z, base, speckle(SEED + 223, x, z, ["calcite", "snow", "diorite", "cobblestone"]));
        continue;
      }
      level(ops, tops, x, z, base - 1, speckle(SEED + 225, x, z, mats));
    }
  }
}

/** 崩れた壁。**高さ 1 まで崩す**——立てたままだと登れない面になる（0-8） */
function walls(ops: BuildOp[], tops: Map<string, number>): void {
  const lines: readonly (readonly [number, number, number, number])[] = [
    [4, -4, 9, -4],
    [9, -4, 9, 0],
    [-16, -10, -12, -10],
    [-16, -10, -16, -6],
    [-6, -17, -3, -17],
  ];
  for (const [x1, z1, x2, z2] of lines) {
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        // **虫食いにする。** 通しで残っていると、崩れて見えない
        if (noise(SEED + 231, x, z) < 0.28 || !hasTop(tops, x, z)) continue;
        ops.push(set(x, topOf(tops, x, z) + 1, z, speckle(SEED + 233, x, z, OLD)));
      }
    }
  }
  // 角にだけ、折れた柱を 1 本ずつ
  for (const [x, z] of [
    [9, -4],
    [-16, -10],
    [4, -4],
  ]) {
    stand(ops, tops, x ?? 0, z ?? 0, 2 + Math.round(noise(SEED + 235, x ?? 0, z ?? 0) * 2), OLD);
  }
}

/** 氷の島——**氷柱と裂け目** */
export function iceIsle(ops: BuildOp[], tops: Map<string, number>): void {
  // ---- 裂け目が先。**あとから掘ると、氷柱の足元が消えて宙に浮く**（0-5）
  crevasse(ops, tops);
  const spikes: readonly (readonly [number, number, number])[] = [
    [28, 1, 9],
    [36, 3, 6],
    [30, 10, 11],
    [38, 8, 5],
    [33, 15, 7],
    [26, 12, 4],
    [37, 13, 8],
    [31, -4, 13],
  ];
  for (const [cx, cz, h] of spikes) spike(ops, tops, cx ?? 0, cz ?? 0, h ?? 5);
}

/** 裂け目。**曲げて走らせる**——直線だと人の手に見える */
function crevasse(ops: BuildOp[], tops: Map<string, number>): void {
  for (let z = -4; z <= 16; z++) {
    const cx = 32 + Math.round(Math.sin((z + 2) / 6.5) * 4 + wave(SEED + 241, 0, z, 9) * 1.5);
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      if (!hasTop(tops, x, z)) continue;
      const mats = dx === 0 ? ["blue_ice", "packed_ice", "blue_ice"] : ["packed_ice", "snow", "calcite"];
      level(ops, tops, x, z, topOf(tops, x, z) - 1, speckle(SEED + 243, x, z, mats));
    }
  }
}

/** 氷柱。**足元は 1 段の雪、上は 1 本きり**——登れないが回り込める（0-8） */
function spike(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, h: number): void {
  const base = topOf(tops, cx, cz);
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let z = cz - 1; z <= cz + 1; z++) {
      if (!hasTop(tops, x, z)) continue;
      ops.push(set(x, topOf(tops, x, z) + 1, z, speckle(SEED + 251, x, z, ["snow", "packed_ice", "calcite"])));
    }
  }
  if (!hasTop(tops, cx, cz)) return;
  for (let i = 2; i <= h; i++) {
    const mat = i > h - 2 ? "blue_ice" : i % 3 === 0 ? "packed_ice" : "snow";
    ops.push(set(cx, base + i, cz, mat));
  }
}
