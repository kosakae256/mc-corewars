/**
 * 3. 溶岩の島——**島の上に立つもの**（折れた黒曜石の柱・焼けた杭）。
 *
 * 決まりは `spec/14-map-build.md` 0-6・0-8。**形は `map-lavaisle-land.ts`。**
 *
 * > ### 遮蔽は「1 マス角」で作る
 * >
 * > **太い岩を置くと、その天面が「歩いて行けない面」としてまとまって残る**（0-8）。
 * > **1 マス角なら歩いて回り込める**——検査も、遊ぶ側も、それで困らない。
 * > **本数と高さを散らして**、林に見せる。
 */

import { set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { inLane, landAt, SEED } from "./map-lavaisle-land.js";

/** 柱の群れ */
interface Grove {
  readonly name: string;
  readonly cx: number;
  readonly cz: number;
  /** 撒く半径 */
  readonly r: number;
  /** 何本立てるか */
  readonly n: number;
  /** いちばん高い柱 */
  readonly tall: number;
  readonly mats: readonly string[];
  readonly seed: number;
}

/** 黒い柱 */
const GLASS = ["obsidian", "obsidian", "black_concrete", "blackstone", "smooth_basalt"];
/** 焼けた杭 */
const BURNT = ["blackstone", "basalt", "netherrack", "magma", "gilded_blackstone"];

/**
 * どこに、どんな林を立てるか。
 *
 * **帯（|x| ≤ 7）には撒かない**——門への見通しを塞がない（0-3）。
 */
const GROVES: readonly Grove[] = [
  { name: "黒曜石の林", cx: -25, cz: 14, r: 10, n: 20, tall: 8, mats: GLASS, seed: SEED + 810 },
  { name: "西の岩板の杭", cx: -25, cz: -18, r: 8, n: 10, tall: 4, mats: GLASS, seed: SEED + 820 },
  { name: "東の丘の焼け杭", cx: 25, cz: -17, r: 8, n: 9, tall: 5, mats: BURNT, seed: SEED + 830 },
  { name: "吹き出し口の縁", cx: 26, cz: 17, r: 9, n: 10, tall: 4, mats: BURNT, seed: SEED + 840 },
  { name: "中央の盾の岩", cx: -13, cz: -11, r: 9, n: 6, tall: 4, mats: GLASS, seed: SEED + 850 },
  { name: "中央の盾の岩・東", cx: 15, cz: 0, r: 9, n: 6, tall: 4, mats: BURNT, seed: SEED + 860 },
  { name: "南西の岩の杭", cx: -20, cz: -24, r: 6, n: 6, tall: 4, mats: GLASS, seed: SEED + 870 },
];

/**
 * 1 本立てる。**上へ行くほど細る**ようには作れないので、材で先を変える。
 *
 * **掘った所（溜まり・割れ目）には立てない**——
 * **天面が 1 マス下がっているので、そこから積むと 1 マス浮く**（0-5）。
 */
function pillar(ops: BuildOp[], cut: Set<string>, x: number, z: number, up: number, g: Grove): void {
  const land = landAt(x, z);
  if (land === undefined || inLane(x) || cut.has(`${x},${z}`)) return;
  for (let i = 1; i <= up; i++) {
    const m = noise(g.seed + 5, x, z + i * 13);
    // **てっぺんだけ、割れて明るい面を出す**
    const block =
      i === up && noise(g.seed + 6, x, z) > 0.7 ? "magma" : (g.mats[Math.floor(m * g.mats.length)] ?? "obsidian");
    ops.push(set(x, land.top + i, z, block));
  }
}

/**
 * 林を撒く。
 *
 * **等間隔に置かない**（0-6）——**角度と隔たりを別々に引く**ので、
 * 円の上に並ばない。**隣り合った 2 本は、高さを必ず変える。**
 */
function grove(ops: BuildOp[], cut: Set<string>, g: Grove): void {
  const put = new Map<string, number>();
  for (let i = 0; i < g.n; i++) {
    const a = noise(g.seed, i, 1) * Math.PI * 2;
    const d = Math.sqrt(noise(g.seed + 1, i, 2)) * g.r;
    const x = Math.round(g.cx + Math.cos(a) * d);
    const z = Math.round(g.cz + Math.sin(a) * d);
    if (put.has(`${x},${z}`)) continue;
    const up = 2 + Math.floor(noise(g.seed + 2, i, 3) * (g.tall - 1));
    // **隣にすでに柱があるなら、高さをずらす**——同じ高さが並ぶと台になる（0-8）
    let h = up;
    for (const [dx, dz] of NEXT) {
      const n = put.get(`${x + dx},${z + dz}`);
      if (n !== undefined && n === h) h = Math.max(1, h - 2);
    }
    put.set(`${x},${z}`, h);
    pillar(ops, cut, x, z, h, g);
    // **1 本だけでなく、根元に欠けた岩を添える**ことがある
    if (noise(g.seed + 3, i, 4) > 0.62) {
      const bx = x + (noise(g.seed + 4, i, 5) > 0.5 ? 1 : -1);
      if (!put.has(`${bx},${z}`)) {
        put.set(`${bx},${z}`, 1);
        pillar(ops, cut, bx, z, 1, g);
      }
    }
  }
}

const NEXT: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 島の上に立つものを、全部積む */
export function groves(ops: BuildOp[], cut: Set<string>): void {
  for (const g of GROVES) grove(ops, cut, g);
}
