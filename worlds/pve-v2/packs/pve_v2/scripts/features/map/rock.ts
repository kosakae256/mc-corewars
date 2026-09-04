/**
 * 岩山。**立った所に、自然な石の柱を作る。**
 *
 * 仕様は `docs/02-map.md` 8 章。
 *
 * ## 毎回ちがうもの
 *
 * | | |
 * | --- | --- |
 * | **形** | 塊を 2〜5 個重ねる（それぞれ位置・大きさ・高さが違う） |
 * | **石** | **毎回 3〜5 種を引く**。層ごとに割り当てる |
 * | **揺らぎ** | 表面を波で削る。**種は呼ぶたびに変わる** |
 *
 * ## 石の選び方
 *
 * **要塞（`.schem`）で使われている石 ＋ 丸石**から引く。
 * **明るいものほど当たりやすい**——重みを明るさから作る
 *（暗い石ばかりだと、ただの黒い塊になる）。
 */

import type { Op } from "./plan.js";

/**
 * 使う石と、その明るさ（0〜1）。
 *
 * **明るさは重みになる**（`weight = 明るさ^2`）——
 * **黒曜石や石炭ブロックはほとんど出ない。**
 *
 * **木・羊毛・鉱石は入れない**（岩山に見えなくなる）。
 */
const STONES: ReadonlyArray<readonly [string, number]> = [
  ["cobblestone", 0.62],
  ["stone", 0.66],
  ["smooth_stone", 0.74],
  ["andesite", 0.68],
  ["polished_andesite", 0.7],
  ["diorite", 0.92],
  ["polished_diorite", 0.94],
  ["light_gray_concrete", 0.62],
  ["light_gray_concrete_powder", 0.78],
  ["white_concrete_powder", 0.98],
  ["clay", 0.8],
  ["gravel", 0.6],
  ["tuff", 0.55],
  ["stone_bricks", 0.62],
  ["cracked_stone_bricks", 0.58],
  ["chiseled_stone_bricks", 0.6],
  ["mossy_stone_bricks", 0.5],
  ["mud", 0.34],
  ["deepslate", 0.36],
  ["cobbled_deepslate", 0.36],
  ["polished_deepslate", 0.34],
  ["deepslate_tiles", 0.28],
  ["deepslate_bricks", 0.32],
  ["smooth_basalt", 0.28],
  ["basalt", 0.32],
  ["polished_basalt", 0.44],
  ["blackstone", 0.2],
  ["polished_blackstone", 0.24],
  ["gray_concrete", 0.3],
  ["black_terracotta", 0.18],
  ["obsidian", 0.1],
  ["coal_block", 0.08],
];

/** 守る範囲（`docs/02-map.md` 8-1）。**1 マスでも掛かったら作らない** */
const KEEP_OUT = { x1: 1201, y1: 13, z1: 643, x2: 1308, y2: 132, z2: 757 } as const;

function inKeepOut(x: number, y: number, z: number): boolean {
  return (
    x >= KEEP_OUT.x1 && x <= KEEP_OUT.x2 && y >= KEEP_OUT.y1 && y <= KEEP_OUT.y2 && z >= KEEP_OUT.z1 && z <= KEEP_OUT.z2
  );
}

/** 種つきの乱数。**種を変えれば別の岩山になる** */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 明るさで重みを付けて 1 つ引く */
function pickStone(r: () => number): string {
  let total = 0;
  for (const s of STONES) total += s[1] * s[1];
  let v = r() * total;
  for (const s of STONES) {
    v -= s[1] * s[1];
    if (v <= 0) return s[0];
  }
  return "stone";
}

/** 塊 1 つ（**位置・太さ・高さ・傾き**） */
interface Lobe {
  readonly x: number;
  readonly z: number;
  readonly rad: number;
  readonly top: number;
  readonly lean: number;
}

/**
 * 岩山を組む。**返すのは命令の一覧だけ。**
 *
 * @param origin 立っている所（**この足元が岩山の根元**）
 * @param seed 種。**呼ぶたびに変える**
 * @returns 命令と、**守る範囲に掛かったか**
 */
export function rockPlan(origin: { x: number; y: number; z: number }, seed: number): { ops: Op[]; blocked: boolean } {
  const r = rng(seed);

  // ---- 石を 3〜5 種引く。**層ごとに割り当てる**
  const kinds = 3 + Math.floor(r() * 3);
  const stones: string[] = [];
  while (stones.length < kinds) {
    const s = pickStone(r);
    if (!stones.includes(s)) stones.push(s);
  }

  // ---- 塊を 2〜5 個。**重ねると自然な輪郭になる**
  const lobes: Lobe[] = [];
  const count = 2 + Math.floor(r() * 4);
  const mainTop = 16 + Math.floor(r() * 30);
  for (let i = 0; i < count; i++) {
    const first = i === 0;
    lobes.push({
      x: first ? 0 : Math.round((r() * 2 - 1) * 9),
      z: first ? 0 : Math.round((r() * 2 - 1) * 9),
      rad: (first ? 6 : 3) + r() * (first ? 7 : 6),
      top: first ? mainTop : Math.round(mainTop * (0.35 + r() * 0.6)),
      lean: (r() * 2 - 1) * 0.25,
    });
  }

  // ---- 表面の揺らぎ（**滑らかな波を 2 つ**。1 マスごとの乱数だと砂嵐になる）
  const p1 = r() * 10;
  const p2 = r() * 10;
  const wob = (x: number, z: number, y: number): number =>
    Math.sin(x * 0.31 + p1) * Math.cos(z * 0.27 - p1) * 1.1 +
    Math.sin((x - z) * 0.17 + p2 + y * 0.09) * 1.3 +
    Math.sin(y * 0.41 + p2) * 0.6;

  const reach = 22;
  const ops: Op[] = [];
  let blocked = false;

  for (let dx = -reach; dx <= reach; dx++) {
    for (let dz = -reach; dz <= reach; dz++) {
      // その柱の「詰まり具合」と高さを、塊の重なりから決める
      let top = -1;
      for (const lobe of lobes) {
        for (let y = 0; y <= lobe.top; y++) {
          // **上へ行くほど細く、少し傾く**
          const t = y / Math.max(1, lobe.top);
          const rad = lobe.rad * (1 - t * 0.72) + wob(dx, dz, y) * 0.55;
          const cx = lobe.x + lobe.lean * y;
          const cz = lobe.z + lobe.lean * y * 0.6;
          if (Math.hypot(dx - cx, dz - cz) <= rad && y > top) top = y;
        }
      }
      if (top < 0) continue;

      for (let y = 0; y <= top; y++) {
        // **庇と穴**——ところどころ抜くと、削られた岩に見える
        if (y > 2 && y < top - 1 && wob(dx * 1.7, dz * 1.7, y * 2.2) > 2.15) continue;

        // 層で石を変える（**縞にする**——混ぜると砂嵐になる）
        const band = Math.floor((y + wob(dx, dz, 0) * 1.4) / 4);
        const stone = stones[((band % stones.length) + stones.length) % stones.length] ?? "stone";

        const wx = origin.x + dx;
        const wy = origin.y + y;
        const wz = origin.z + dz;
        if (inKeepOut(wx, wy, wz)) blocked = true;
        ops.push({ kind: "set", x: dx, y, z: dz, block: stone });
      }
    }
  }

  // ---- 麓の転石（**根元をぼかす**）
  const debris = 30 + Math.floor(r() * 40);
  for (let i = 0; i < debris; i++) {
    const a = r() * Math.PI * 2;
    const d = 8 + r() * 16;
    const dx = Math.round(Math.cos(a) * d);
    const dz = Math.round(Math.sin(a) * d);
    const h = 1 + Math.floor(r() * 2);
    const stone = stones[Math.floor(r() * stones.length)] ?? "cobblestone";
    for (let y = 0; y < h; y++) {
      const wx = origin.x + dx;
      const wy = origin.y + y;
      const wz = origin.z + dz;
      if (inKeepOut(wx, wy, wz)) blocked = true;
      ops.push({ kind: "set", x: dx, y, z: dz, block: r() < 0.7 ? stone : "cobblestone" });
    }
  }

  return { ops, blocked };
}
