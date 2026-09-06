/**
 * 廃村——**置き物。** 井戸・炉・荷車・柵・畑の跡・落ちた梁・枯木・墓。
 *
 * > ### 置き物は、**周りとの差を 1 マスに収める**
 * >
 * > 高さ 2 の塊をぽんと置くと、**その上が「歩いて行けない面」になる**（0-8）。
 * > **積むなら裾から 1 段ずつ。** 細い柱（1 マス）は回り込めるので、そのままでよい。
 *
 * 決まりは `spec/14-map-build.md` 0 章。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { isLand, isPaved, SEED } from "./map-ruinvill-const.js";

/** そこへ置いてよいか。**島の外と、通りの上には置かない** */
function ok(x: number, z: number): boolean {
  return isLand(x, z) && !isPaved(x, z);
}

/** 1 マス置く（置ける所だけ） */
function put(ops: BuildOp[], x: number, y: number, z: number, block: string): void {
  if (!ok(x, z)) return;
  ops.push(set(x, y, z, block));
}

/**
 * 井戸。**屋根は落ちている。**
 *
 * 縁だけが残り、桶を吊るした腕木が 1 本傾いて立っている。
 */
export function well(ops: BuildOp[], cx: number, cz: number): void {
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let z = cz - 1; z <= cz + 1; z++) {
      if (x === cx && z === cz) continue;
      const r = noise(SEED + 41, x, z);
      // **縁は欠けている**——1 マスだけ崩れ落ちた形にする
      if (r > 0.86) continue;
      put(ops, x, 1, z, r > 0.55 ? "mossy_cobblestone" : r > 0.28 ? "cobblestone" : "cracked_stone_bricks");
    }
  }
  ops.push(fill(cx, -3, cz, cx, 0, cz, "water"));
  ops.push(fill(cx + 1, 1, cz + 1, cx + 1, 3, cz + 1, "oak_log"));
  ops.push(set(cx, 3, cz + 1, "oak_fence"));
  ops.push(set(cx, 2, cz + 1, "lantern"));
}

/** 共同の炉。**裾から 1 段ずつ積む**——上に登れる形にする */
export function oven(ops: BuildOp[], cx: number, cz: number): void {
  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let z = cz - 2; z <= cz + 2; z++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      if (d > 2) continue;
      const y = 2 - d;
      if (y < 1) {
        put(ops, x, 1, z, noise(SEED + 43, x, z) > 0.5 ? "cobblestone" : "cobblestone");
        continue;
      }
      const r = noise(SEED + 45, x, z);
      ops.push(fill(x, 1, z, x, y, z, r > 0.6 ? "brick_block" : r > 0.3 ? "cobblestone" : "hardened_clay"));
    }
  }
  ops.push(set(cx, 3, cz, "campfire"));
}

/** 打ち捨てられた荷車。**床板と、外れかけた車輪** */
export function cart(ops: BuildOp[], cx: number, cz: number, along: "x" | "z"): void {
  const dx = along === "x" ? 2 : 1;
  const dz = along === "x" ? 1 : 2;
  ops.push(fill(cx - dx, 1, cz - dz, cx + dx, 1, cz + dz, "spruce_planks"));
  ops.push(set(cx - dx, 1, cz - dz, "oak_log"));
  ops.push(set(cx + dx, 1, cz + dz, "oak_log"));
  // **車輪は軸の上に残っている**（浮かせない。0-5）
  ops.push(set(cx - dx, 2, cz - dz, "oak_fence"));
  ops.push(set(cx + dx, 2, cz + dz, "oak_fence"));
  ops.push(set(cx, 2, cz, "barrel"));
}

/** 折れた柵。**続けて並べない**——所々で途切れさせる */
export function fence(ops: BuildOp[], x0: number, z0: number, x1: number, z1: number, block: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const z = Math.round(z0 + ((z1 - z0) * i) / n);
    const r = noise(SEED + 47, x, z);
    if (r > 0.68) continue;
    put(ops, x, 1, z, r > 0.12 ? block : "oak_log");
  }
}

/** 畑の跡。**畝と、間の水路。** 作物はとうに枯れている */
export function field(ops: BuildOp[], x0: number, z0: number, x1: number, z1: number): void {
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      if (!ok(x, z)) continue;
      const row = (((x - x0) % 4) + 4) % 4;
      const r = noise(SEED + 51, x, z);
      if (row === 0) {
        ops.push(set(x, 0, z, r > 0.3 ? "water" : "clay"));
        continue;
      }
      ops.push(set(x, 0, z, r > 0.66 ? "podzol" : r > 0.33 ? "coarse_dirt" : "dirt"));
      if (r < 0.09) ops.push(set(x, 1, z, "short_grass"));
    }
  }
}

/** 落ちた梁。**床に横たわった丸太** */
export function beam(ops: BuildOp[], x0: number, z0: number, len: number, along: "x" | "z", block: string): void {
  for (let i = 0; i < len; i++) {
    const x = along === "x" ? x0 + i : x0;
    const z = along === "z" ? z0 + i : z0;
    if (noise(SEED + 53, x, z) > 0.86) continue;
    put(ops, x, 1, z, block);
  }
}

/**
 * 枯木。**葉は無い。**
 *
 * 茂った木を置くと、**葉の面がまるごと登れない面になる**（0-8）。
 * **幹と枝だけ**なら、1〜2 マスの柱なので回り込める。
 */
export function deadTree(ops: BuildOp[], cx: number, cz: number, h: number, block: string): void {
  if (!ok(cx, cz)) return;
  ops.push(fill(cx, 1, cz, cx, h, cz, block));
  const r = noise(SEED + 57, cx, cz);
  put(ops, cx + (r > 0.5 ? 1 : -1), h - 1, cz, "oak_fence");
  put(ops, cx, h - 2, cz + (r > 0.25 ? 1 : -1), "oak_fence");
}

/** 瓦礫の山。**裾から 1 段ずつ**（登れる形） */
export function rubble(ops: BuildOp[], cx: number, cz: number, r: number, seed: number): void {
  for (let x = cx - r; x <= cx + r; x++) {
    for (let z = cz - r; z <= cz + r; z++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d > r) continue;
      const v = noise(seed, x, z);
      const y = Math.max(0, Math.round(r - d - v * 0.8));
      if (y < 1 || !ok(x, z)) continue;
      ops.push(
        fill(
          x,
          1,
          z,
          x,
          y,
          z,
          v > 0.62 ? "cobblestone" : v > 0.36 ? "cobblestone" : v > 0.14 ? "andesite" : "mossy_cobblestone"
        )
      );
    }
  }
}

/** 墓地。**列に並べる**——人の作ったものなので揃っていてよい（0-7） */
export function graves(ops: BuildOp[], x0: number, z0: number, x1: number, z1: number): void {
  for (let x = x0; x <= x1; x += 2) {
    for (let z = z0; z <= z1; z += 3) {
      const r = noise(SEED + 59, x, z);
      // **列は揃えても、抜けは散らす**——碁盤の目に見えないように
      if (r > 0.62) continue;
      put(ops, x, 1, z, r > 0.55 ? "stone_brick_wall" : r > 0.25 ? "cobblestone_wall" : "andesite");
      if (r < 0.2) put(ops, x, 1, z + 1, "coarse_dirt");
      if (r > 0.7) put(ops, x, 1, z + 1, "moss_carpet");
    }
  }
}

/** 苔と草を、ほんの少しだけ散らす。**敷き詰めない** */
export function scatter(ops: BuildOp[], seed: number): void {
  for (let x = -44; x <= 44; x++) {
    for (let z = -44; z <= 44; z++) {
      const r = noise(seed, x, z);
      if (r > 0.045 || !ok(x, z)) continue;
      ops.push(set(x, 1, z, r > 0.03 ? "short_grass" : r > 0.014 ? "moss_carpet" : "torch"));
    }
  }
}
