/**
 * 5「城の中庭」の**中庭。純粋。**
 *
 * 回廊に囲まれた石畳と、その上に置くもの——
 * **噴水・植え込み・灯り・2 階へ上がる大階段。**
 *
 * ```
 *        ┌──────────────────────┐
 *        │  ▨  ┌────┐   ▨      │   ▨ ＝ 植え込み
 *        │     │ ◎ │   ／       │   ◎ ＝ 噴水（二段）
 *        │  ▨  └────┘  ／  ▤   │   ▤ ＝ 大階段（2 階と屋根へ）
 *        └──────────────────────┘
 * ```
 *
 * > ### **段差は 1 マスまで**（0-8）
 * >
 * > 縁石も植え込みも**1 段ずつ**積む。**2 段いっぺんに上げない。**
 * > 大階段も**1 マスずつ**——敵が登れないと、そこが安全地帯になる。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise, speckle } from "./map-frame.js";
import { cheb, COURT, isPier, ringT, SEED } from "./map-courtyard-plan.js";

/** 石畳の地。**1 マスごとに引く**（0-7） */
const PAVE = ["stone_bricks", "stone_bricks", "andesite", "cracked_stone_bricks", "cobblestone", "mossy_stone_bricks"];

const PALE = "calcite";
const PALE2 = "polished_diorite";
const PATH = "smooth_stone";
const DARK = "polished_blackstone";
const DARK2 = "deepslate_tiles";

/** 中央の円花。**輪と 16 本の筋** */
function rosette(x: number, z: number, r: number): string {
  const k = Math.floor(r);
  if (k <= 10) return PALE;
  if (k === 11 || k === 15) return DARK;
  if (k === 13) return PALE2;
  const a = ((Math.atan2(z, x) / Math.PI) * 8 + 16) % 1;
  return a < 0.13 || a > 0.87 ? DARK2 : "stone_bricks";
}

/** 石畳の 1 マス */
function paveAt(x: number, z: number): string {
  const c = cheb(x, z);
  const r = Math.hypot(x, z);
  // ---- 回廊の足元をぐるりと回る縁飾り
  if (c >= COURT - 2) return ((Math.abs(ringT(x, z)) + c) & 3) < 2 ? DARK : PALE2;
  if (c === COURT - 3) return DARK2;
  // ---- 中央の円花
  if (r < 16.5) return rosette(x, z, r);
  // ---- 十字の道。**縁に暗い線を通す**
  if (Math.abs(x) <= 4 || Math.abs(z) <= 4) return Math.abs(x) === 4 || Math.abs(z) === 4 ? DARK : PATH;
  // ---- 隅から中心へ向かう斜めの帯
  if (Math.abs(Math.abs(x) - Math.abs(z)) <= 1) return PALE2;
  // ---- 環状の道
  if (r >= 23 && r < 25) return PATH;
  if (r >= 25 && r < 26) return DARK;
  return speckle(SEED, x, z, PAVE);
}

/** 石畳を敷く */
function paving(ops: BuildOp[]): void {
  for (let x = -COURT; x <= COURT; x++) {
    for (let z = -COURT; z <= COURT; z++) ops.push(set(x, GROUND, z, paveAt(x, z)));
  }
}

/**
 * 柱列の礎壇。**中庭より 1 段高い、明るい石の帯。**
 *
 * > ### 回廊の足元が、ただの崖になっていた（2026-09-06）
 * >
 * > **石畳から屋根までが一気に 14 マス**で、境目が読めなかった。
 * > **1 段だけ持ち上げて、柱の立つ台を見せる。**
 */
function stylobate(ops: BuildOp[]): void {
  for (let x = -COURT; x <= COURT; x++) {
    for (let z = -COURT; z <= COURT; z++) {
      const c = cheb(x, z);
      const t = ringT(x, z);
      // **十字の道が抜ける所は上げない**——段差で道が途切れる
      if (c < COURT - 1 || Math.abs(t) <= 4) continue;
      const pier = isPier(t) && c === COURT;
      ops.push(set(x, GROUND + 1, z, pier ? "chiseled_stone_bricks" : "polished_diorite"));
    }
  }
}

/**
 * 噴水。**二段の水盤。**
 *
 * > ### 高さは 3 マスまで
 * >
 * > **湧く所からゲートへ引いた線が、中央の上を通る**（0-3）。
 * > **ここを塞ぐと「どこへ行けばいいのか分からない」検査に落ちる。**
 */
function fountain(ops: BuildOp[]): void {
  for (let x = -10; x <= 10; x++) {
    for (let z = -10; z <= 10; z++) {
      const r = Math.hypot(x, z);
      if (r >= 9.6) continue;
      if (r >= 8.2) {
        ops.push(set(x, GROUND + 1, z, (Math.abs(x) + Math.abs(z)) % 5 === 0 ? "chiseled_stone_bricks" : PALE));
        continue;
      }
      ops.push(set(x, GROUND, z, r >= 4.5 ? DARK : PALE));
      if (r >= 4.5) {
        ops.push(set(x, GROUND + 1, z, "water"));
      } else if (r >= 3.5) {
        ops.push(fill(x, GROUND + 1, z, x, GROUND + 2, z, PALE));
      } else if (r >= 2.3) {
        ops.push(fill(x, GROUND + 1, z, x, GROUND + 3, z, "chiseled_stone_bricks"));
      } else {
        ops.push(fill(x, GROUND + 1, z, x, GROUND + 2, z, PALE));
        ops.push(set(x, GROUND + 3, z, "water"));
      }
    }
  }
  // ---- 水底の明かり。**夜に青く光る**
  for (const [dx, dz] of [
    [5, 0],
    [-5, 0],
    [0, 5],
    [0, -5],
  ] as const) {
    ops.push(set(dx, GROUND, dz, "sea_lantern"));
  }
}

/** 植え込み 1 区画ぶんの意匠。**4 つとも違う模様にする**（0-6） */
function hedgeAt(i: number, dx: number, dz: number): boolean {
  if (i === 0) return Math.abs(dx) === Math.abs(dz);
  if (i === 1) return Math.max(Math.abs(dx), Math.abs(dz)) === 4;
  if (i === 2) return dx === 0 || dz === 0;
  return Math.abs(dx) >= 3 && Math.abs(dz) >= 3;
}

/** 4 つの植え込み。**縁石・芝・刈り込み** */
function parterres(ops: BuildOp[]): void {
  const spots = [
    { x: -19, z: -19, leaf: "oak_leaves" },
    { x: 19, z: -19, leaf: "azalea_leaves" },
    { x: -19, z: 19, leaf: "birch_leaves" },
    { x: 19, z: 19, leaf: "oak_leaves" },
  ] as const;
  spots.forEach((s, i) => {
    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        const x = s.x + dx;
        const z = s.z + dz;
        const q = Math.max(Math.abs(dx), Math.abs(dz));
        if (q === 6) {
          ops.push(set(x, GROUND + 1, z, (dx + dz) % 3 === 0 ? "chiseled_stone_bricks" : PALE2));
          continue;
        }
        ops.push(set(x, GROUND, z, "grass_block"));
        // ---- 真ん中の刈り込み。**1 段ずつ絞る**
        if (q <= 2) {
          ops.push(fill(x, GROUND + 1, z, x, GROUND + 3 - q, z, s.leaf));
          continue;
        }
        if (hedgeAt(i, dx, dz)) ops.push(set(x, GROUND + 1, z, s.leaf));
        else if (noise(SEED + 40 + i, x, z) < 0.28) ops.push(set(x, GROUND + 1, z, "short_grass"));
      }
    }
  });
}

/** 灯りの柱と、火皿 */
function lamps(ops: BuildOp[]): void {
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * 19);
    const z = Math.round(Math.sin(a) * 19);
    ops.push(fill(x, GROUND + 1, z, x, GROUND + 3, z, "polished_blackstone"));
    ops.push(set(x, GROUND + 4, z, "lantern"));
  }
  for (const [cx, cz] of [
    [-27, 8],
    [26, -12],
    [-9, 27],
    [11, -27],
  ] as const) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) ops.push(set(cx + dx, GROUND + 1, cz + dz, "polished_blackstone"));
    }
    ops.push(set(cx, GROUND + 2, cz, "chiseled_polished_blackstone"));
    ops.push(set(cx, GROUND + 3, cz, "campfire"));
  }
}

/** 環状の道に沿った刈り込み。**緑の点を散らして、灰色を締める** */
function topiary(ops: BuildOp[]): void {
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.25) / 12) * Math.PI * 2;
    const r = 24 + (i % 3);
    const cx = Math.round(Math.cos(a) * r);
    const cz = Math.round(Math.sin(a) * r);
    if (Math.abs(cx) <= 5 || Math.abs(cz) <= 5) continue;
    const leaf = i % 3 === 0 ? "azalea_leaves" : i % 3 === 1 ? "oak_leaves" : "birch_leaves";
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) ops.push(set(cx + dx, GROUND + 1, cz + dz, leaf));
    }
    ops.push(set(cx, GROUND + 2, cz, leaf));
  }
}

/** 大階段 1 本。**1 マスずつ上がって、軒（y ＝ 14）へ乗る** */
function flight(ops: BuildOp[], x0: number, x1: number, z0: number, step: number, rail: number): void {
  for (let k = 0; k < 14; k++) {
    const z = z0 + step * k;
    const y = GROUND + 1 + k;
    ops.push(fill(x0, GROUND, z, x1, y - 1, z, "stone_bricks"));
    for (let x = x0; x <= x1; x++) {
      ops.push(set(x, y, z, speckle(SEED + 21, x, z, ["andesite", "polished_andesite", "stone_bricks"])));
    }
    ops.push(set(rail, y + 1, z, k % 4 === 3 ? "chiseled_stone_bricks" : "cobblestone_wall"));
  }
}

/**
 * 中庭を組む手順。
 *
 * **石畳 → 噴水・植え込み → 灯り → 大階段**の順。
 * **後から置いたものが勝つ**ので、階段は最後に回す。
 */
export function yardOps(ops: BuildOp[]): void {
  paving(ops);
  stylobate(ops);
  fountain(ops);
  parterres(ops);
  lamps(ops);
  topiary(ops);
  // ---- 西は北へ、東は南へ。**同じ形を並べない**（0-6）
  flight(ops, -33, -30, -7, 1, -30);
  flight(ops, 30, 33, 9, -1, 30);
}
