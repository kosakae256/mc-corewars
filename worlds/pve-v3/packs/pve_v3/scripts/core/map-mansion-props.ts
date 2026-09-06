/**
 * 11「森の洋館」の**部屋ごとの置き物。純粋。**
 *
 * **バニラの森の洋館にある部屋**をなぞる——
 * 赤い部屋・彫像の間・偽の部屋（口が無い）・牢・茸の間・食堂・寝間。
 *
 * > ### 置き物は「壁か床に触れている」こと
 * >
 * > 空中に浮いたブロックが 1 つでもあると、**0-5 の「塊は 1 つ」に落ちる。**
 * > 灯りは**天井から下げる**か、**壁の隣**に置く。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { SEED } from "./map-mansion-plan.js";

/** 部屋の四角。**壁は含まない**（内側だけ） */
export interface Room {
  readonly key: number;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** 部屋の意匠 */
export type Theme =
  | "red"
  | "statue"
  | "secret"
  | "dine"
  | "study"
  | "mush"
  | "jail"
  | "store"
  | "drill"
  | "bed"
  | "shrine"
  | "garden"
  | "hearth"
  | "bay"
  | "stair";

const mid = (a: number, b: number): number => Math.floor((a + b) / 2);

/** 天井から下げる灯り。**柵で天井に繋ぐ**ので浮かない */
function hang(ops: BuildOp[], x: number, y: number, z: number): void {
  ops.push(fill(x, y + 6, z, x, y + 7, z, "dark_oak_fence"));
  ops.push(set(x, y + 5, z, "lantern"));
}

/** 牢。**鉄格子で仕切り、正面に 1 つだけ口を残す** */
function jail(ops: BuildOp[], r: Room, y: number): void {
  const zf = Math.min(r.z0 + 3, r.z1 - 1);
  ops.push(fill(r.x0, y + 1, zf, r.x1, y + 4, zf, "iron_bars"));
  for (let x = r.x0; x <= r.x1; x += 4) ops.push(fill(x, y + 1, r.z0, x, y + 4, zf, "iron_bars"));
  for (let x = r.x0 + 2; x <= r.x1; x += 4) ops.push(fill(x, y + 1, zf, x, y + 3, zf, "air"));
  for (let x = r.x0 + 1; x <= r.x1; x += 4) ops.push(set(x, y + 1, r.z0, "gray_wool"));
  hang(ops, mid(r.x0, r.x1), y, r.z1 - 1);
}

/** 彫像の間。**丸石の像を、間を空けずに並べない**（0-6） */
function statue(ops: BuildOp[], r: Room, y: number): void {
  const cz = mid(r.z0, r.z1);
  let step = 0;
  for (let x = r.x0 + 2; x <= r.x1 - 2; x += 5 + (step % 2)) {
    step++;
    const h = 4 + (noise(SEED + 53, x, y, cz) < 0.4 ? 1 : 0);
    ops.push(fill(x - 1, y, cz - 1, x + 1, y, cz + 1, "polished_andesite"));
    ops.push(fill(x, y + 1, cz, x, y + h, cz, "cobblestone"));
    ops.push(fill(x - 1, y + h - 1, cz, x + 1, y + h - 1, cz, "cobblestone"));
    ops.push(set(x, y + h + 1, cz, "chiseled_stone_bricks"));
    ops.push(set(x - 1, y + 1, cz - 1, "torch"));
    ops.push(set(x + 1, y + 1, cz + 1, "torch"));
  }
}

/** 偽の部屋。**口が無い**（`doorOps` が飛ばす）。中に宝を置く */
function secret(ops: BuildOp[], r: Room, y: number): void {
  for (let x = r.x0 + 1; x <= r.x1 - 1; x += 2) {
    ops.push(set(x, y + 1, r.z0, "chest"));
    ops.push(set(x, y + 1, r.z1, "barrel"));
  }
  ops.push(set(mid(r.x0, r.x1), y + 1, mid(r.z0, r.z1), "glowstone"));
}

/** 食堂。**長机を 1 本通す** */
function dine(ops: BuildOp[], r: Room, y: number): void {
  const cx = mid(r.x0, r.x1);
  for (let z = r.z0 + 2; z <= r.z1 - 2; z++) {
    ops.push(fill(cx - 1, y + 2, z, cx + 1, y + 2, z, "dark_oak_planks"));
    if ((z - r.z0) % 4 === 0) ops.push(fill(cx - 1, y + 1, z, cx + 1, y + 1, z, "dark_oak_fence"));
    if ((z - r.z0) % 6 === 3) hang(ops, cx, y, z);
  }
  for (let z = r.z0 + 3; z <= r.z1 - 3; z += 3) {
    ops.push(set(cx - 3, y + 1, z, "dark_oak_fence"));
    ops.push(set(cx + 3, y + 1, z, "dark_oak_fence"));
  }
}

/** 書見の間。**壁沿いに棚を回す** */
function study(ops: BuildOp[], r: Room, y: number): void {
  ops.push(fill(r.x0, y + 1, r.z0, r.x1, y + 3, r.z0, "stripped_dark_oak_log"));
  ops.push(fill(r.x0, y + 2, r.z0, r.x1, y + 2, r.z0, "birch_planks"));
  ops.push(fill(r.x0, y + 1, r.z1, r.x1, y + 3, r.z1, "stripped_dark_oak_log"));
  ops.push(fill(r.x0, y + 2, r.z1, r.x1, y + 2, r.z1, "birch_planks"));
  const cx = mid(r.x0, r.x1);
  const cz = mid(r.z0, r.z1);
  ops.push(set(cx, y + 1, cz, "dark_oak_fence"));
  ops.push(set(cx, y + 2, cz, "birch_planks"));
  hang(ops, cx, y, cz - 2);
}

/** 茸の間。**菌糸の床から、笠の塊が生える** */
function mush(ops: BuildOp[], r: Room, y: number): void {
  for (let x = r.x0 + 1; x <= r.x1 - 1; x++) {
    for (let z = r.z0 + 1; z <= r.z1 - 1; z++) {
      const n = noise(SEED + 59, x, y, z);
      if (n > 0.055) continue;
      const h = 2 + Math.floor(n * 40);
      ops.push(fill(x, y + 1, z, x, y + h, z, "mushroom_stem"));
      const cap = n < 0.028 ? "red_mushroom_block" : "brown_mushroom_block";
      ops.push(fill(x - 1, y + h + 1, z, x + 1, y + h + 1, z, cap));
      ops.push(fill(x, y + h + 1, z - 1, x, y + h + 1, z + 1, cap));
    }
  }
  hang(ops, mid(r.x0, r.x1), y, r.z0 + 1);
}

/** 倉庫。**箱と樽を壁沿いに積む** */
function store(ops: BuildOp[], r: Room, y: number): void {
  for (let x = r.x0; x <= r.x1; x++) {
    const n = noise(SEED + 61, x, y, r.z0);
    if (n < 0.45) ops.push(fill(x, y + 1, r.z0, x, y + 1 + (n < 0.2 ? 1 : 0), r.z0, "barrel"));
    if (noise(SEED + 62, x, y, r.z1) < 0.4) ops.push(set(x, y + 1, r.z1, "chest"));
  }
  hang(ops, mid(r.x0, r.x1), y, mid(r.z0, r.z1));
}

/** 訓練の間。**柱の林。** 大部屋なので、遮蔽になる */
function drill(ops: BuildOp[], r: Room, y: number): void {
  for (let x = r.x0 + 2; x <= r.x1 - 1; x += 4) {
    for (let z = r.z0 + 2; z <= r.z1 - 1; z += 5) {
      const off = ((x + z) % 3) - 1;
      ops.push(fill(x, y + 1, z + off, x, y + 7, z + off, "dark_oak_log"));
      ops.push(set(x, y + 2, z + off, "stripped_dark_oak_log"));
    }
  }
  for (let z = r.z0 + 4; z <= r.z1 - 2; z += 7) hang(ops, mid(r.x0, r.x1), y, z);
}

/** 寝間。**寝台を 3 つ、間を空けて並べる** */
function bed(ops: BuildOp[], r: Room, y: number): void {
  let i = 0;
  for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) {
    i++;
    const z = r.z0 + 1 + (i % 2);
    ops.push(fill(x, y + 1, z, x, y + 1, z + 1, "red_wool"));
    ops.push(set(x, y + 2, z - 1, "birch_planks"));
    ops.push(set(x, y + 1, z - 1, "birch_planks"));
  }
  hang(ops, mid(r.x0, r.x1), y, r.z1 - 1);
}

/** 祈りの間。**黒曜石の壇に光の芯** */
function shrine(ops: BuildOp[], r: Room, y: number): void {
  const cx = mid(r.x0, r.x1);
  const cz = mid(r.z0, r.z1);
  ops.push(fill(cx - 2, y + 1, cz - 2, cx + 2, y + 1, cz + 2, "obsidian"));
  ops.push(fill(cx - 1, y + 2, cz - 1, cx + 1, y + 2, cz + 1, "obsidian"));
  ops.push(set(cx, y + 3, cz, "glowstone"));
  for (const [dx, dz] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as const) {
    ops.push(fill(cx + dx, y + 2, cz + dz, cx + dx, y + 4, cz + dz, "chiseled_stone_bricks"));
    ops.push(set(cx + dx, y + 5, cz + dz, "torch"));
  }
}

/** 温室。**苔と木と水。** 屋内に緑を 1 部屋だけ入れる */
function garden(ops: BuildOp[], r: Room, y: number): void {
  const cx = mid(r.x0, r.x1);
  const cz = mid(r.z0, r.z1);
  // **床を水に差し替えない**——2 階でやると、下の部屋へ水が落ちる。
  // **石で縁を作って、その中に張る**（2026-09-06）
  ops.push(fill(cx - 2, y + 1, cz - 2, cx + 2, y + 1, cz + 2, "cobblestone"));
  ops.push(fill(cx - 1, y + 1, cz - 1, cx + 1, y + 1, cz + 1, "water"));
  for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) {
    for (let z = r.z0 + 1; z <= r.z1 - 1; z += 3) {
      if (Math.abs(x - cx) <= 1 && Math.abs(z - cz) <= 1) continue;
      const n = noise(SEED + 67, x, y, z);
      if (n > 0.4) continue;
      const h = 2 + Math.floor(n * 6);
      ops.push(fill(x, y + 1, z, x, y + h, z, "oak_log"));
      ops.push(fill(x - 1, y + h + 1, z - 1, x + 1, y + h + 1, z + 1, "oak_leaves"));
    }
  }
  hang(ops, cx, y, r.z0 + 1);
}

/** 炉の間。**奥の壁いっぱいの暖炉** */
function hearth(ops: BuildOp[], r: Room, y: number): void {
  const cx = mid(r.x0, r.x1);
  ops.push(fill(cx - 3, y + 1, r.z0, cx + 3, y + 5, r.z0, "cobblestone"));
  ops.push(fill(cx - 1, y + 1, r.z0, cx + 1, y + 3, r.z0, "air"));
  ops.push(fill(cx - 1, y + 1, r.z0, cx + 1, y + 1, r.z0, "campfire"));
  ops.push(fill(cx - 4, y + 6, r.z0, cx + 4, y + 6, r.z0, "stripped_dark_oak_log"));
  ops.push(fill(cx - 2, y + 1, r.z0 + 3, cx + 2, y + 1, r.z0 + 3, "dark_oak_fence"));
}

/** 出窓。**腰掛けを 1 本置くだけ** */
function bay(ops: BuildOp[], r: Room, y: number): void {
  ops.push(fill(r.x0, y + 1, r.z0, r.x1, y + 1, r.z0, "stripped_dark_oak_log"));
  ops.push(set(mid(r.x0, r.x1), y + 1, r.z1, "lantern"));
}

/** 赤い部屋。**壁まで赤くする**——絨毯だけでは「赤い部屋」に見えない */
function red(ops: BuildOp[], r: Room, y: number): void {
  for (const z of [r.z0, r.z1]) ops.push(fill(r.x0, y + 3, z, r.x1, y + 4, z, "red_wool"));
  for (const x of [r.x0, r.x1]) ops.push(fill(x, y + 3, r.z0, x, y + 4, r.z1, "red_wool"));
  const cx = mid(r.x0, r.x1);
  const cz = mid(r.z0, r.z1);
  ops.push(fill(cx - 1, y + 1, cz, cx + 1, y + 1, cz, "dark_oak_fence"));
  ops.push(fill(cx - 1, y + 2, cz, cx + 1, y + 2, cz, "dark_oak_planks"));
  ops.push(set(cx, y + 3, cz, "torch"));
  hang(ops, cx, y, cz - 3);
}

/** 意匠のとおりに置く。**床は `map-mansion-rooms.ts` が塗る** */
export function propsOf(ops: BuildOp[], t: Theme, r: Room, y: number): void {
  if (r.x1 - r.x0 < 2 || r.z1 - r.z0 < 2) return;
  const table: Partial<Record<Theme, (o: BuildOp[], q: Room, h: number) => void>> = {
    red,
    statue,
    secret,
    dine,
    study,
    mush,
    jail,
    store,
    drill,
    bed,
    shrine,
    garden,
    hearth,
    bay,
  };
  table[t]?.(ops, r, y);
}
