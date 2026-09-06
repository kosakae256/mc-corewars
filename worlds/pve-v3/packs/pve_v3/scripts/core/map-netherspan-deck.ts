/**
 * 深淵の橋の**甲板の意匠**——敷石・縁の立ち上がり・欄干・柱・ゲートの枠。**純粋。**
 *
 * > ### 高さの決まりが、そのまま意匠の決まりになる
 * >
 * > **天面が隣より 2 マス高い面をまとめて作ると、敵が登れない**（0-8）。
 * > だから**欄干は 1 段、胸壁は外へ 1 段ずつ**、
 * > **背の高いものは 1 マスの柱として離して立てる**（回り込める）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise, speckle, wave } from "./map-frame.js";
import { DECK, edgeDist, maxRise, SEED, type Kind } from "./map-netherspan-shape.js";
import { GATE_MAT, PILLAR, RIM } from "./map-netherspan-mat.js";

/** 甲板の 1 マス。**平面を決めてから、上に積むものを引く** */
export interface Cell {
  readonly x: number;
  readonly z: number;
  readonly top: number;
  readonly kind: Kind;
}

/** 有る／無しを引く関数 */
export type Has = (x: number, z: number) => boolean;

const NEIGH = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * 縁の立ち上がり（岩棚・踊り場・枝）。**外へ行くほど高く。**
 *
 * 高さの上限そのものを**長い波**で振る。等しい高さの縁が一周すると、
 * **型で抜いた縁**に見える（0-6）。
 */
function rimRise(x: number, z: number, kind: Kind, d: number): number {
  if (d >= 3) return 0;
  const peak =
    kind === "rock"
      ? 2 + Math.round(wave(SEED + 81, x, z, 8) * 1.4)
      : 1 + Math.round((wave(SEED + 83, x, z, 7) + 0.3) * 0.8);
  return Math.max(0, peak - d);
}

/**
 * 橋の欄干。**縁の 1 列にだけ立つ。**
 *
 * 6 分の 1 ほどは**折れて無くなっている**——
 * 端から端まで繋がっていると、**架けたばかりの橋**に見える。
 */
function railRise(x: number, z: number): number {
  if (noise(SEED + 91, x, z) < 0.16) return 0;
  return noise(SEED + 93, x, z) < 0.055 ? 2 : 1;
}

/** その柱に積みたい段数（**均す前**の希望） */
function wantRise(c: Cell, has: Has): number {
  // **欠けて下がった縁には積まない**——落ちた縁の上に手すりだけが残る形になる
  if (c.top !== DECK) return 0;
  const cap = maxRise(c.x, c.z);
  if (cap === 0) return 0;
  const d = edgeDist(has, c.x, c.z);
  const bridge = c.kind === "span" || c.kind === "plank";
  const want = bridge ? (d === 0 ? railRise(c.x, c.z) : 0) : rimRise(c.x, c.z, c.kind, d);
  return Math.min(cap, want);
}

/**
 * **1 段ずつしか上がれないように均す**（0-8）。
 *
 * > ### 隣を見ないで積むと、登れない面ができる
 * >
 * > 縁の高さは 1 マスごとに引いているので、
 * > **隣が 0 段なのに自分が 2 段**という所が必ず出る。
 * > そこは**歩いて行けない面**として検査に落ちた（実際に 4 マス分残った）。
 * >
 * > **削るだけ**なので形は壊れない。落ち着くまで繰り返す。
 */
function relax(cells: readonly Cell[], abs: Map<string, number>): void {
  for (let pass = 0; pass < 5; pass++) {
    let moved = 0;
    for (const c of cells) {
      const k = `${c.x},${c.z}`;
      const y = abs.get(k);
      if (y === undefined) continue;
      let lo = 99;
      for (const [dx, dz] of NEIGH) {
        const n = abs.get(`${c.x + dx},${c.z + dz}`);
        if (n !== undefined) lo = Math.min(lo, n);
      }
      if (lo < 99 && y > lo + 1) {
        abs.set(k, lo + 1);
        moved++;
      }
    }
    if (moved === 0) return;
  }
}

/** 欄干の 1 マス。**石・石垣・鉄柵を混ぜる**——一色で回すと帯に見える */
function railMat(x: number, z: number): string {
  const r = noise(SEED + 91, x, z);
  if (r < 0.34) return "stone_brick_wall";
  if (r < 0.5) return "iron_bars";
  if (r < 0.62) return "cobblestone_wall";
  return speckle(SEED + 95, x, z, RIM);
}

/**
 * 甲板の上に積む。**縁の立ち上がりと欄干を、均してから置く。**
 *
 * `ops` に手順を足すだけ。**世界には触らない。**
 */
export function riseOps(ops: BuildOp[], cells: readonly Cell[], has: Has): void {
  const abs = new Map<string, number>();
  for (const c of cells) abs.set(`${c.x},${c.z}`, c.top + wantRise(c, has));
  relax(cells, abs);

  for (const c of cells) {
    const h = (abs.get(`${c.x},${c.z}`) ?? c.top) - c.top;
    if (h <= 0) continue;
    if (c.kind === "plank") {
      ops.push(set(c.x, c.top + 1, c.z, "dark_oak_fence"));
      continue;
    }
    if (c.kind === "span") {
      if (h === 1) ops.push(set(c.x, c.top + 1, c.z, railMat(c.x, c.z)));
      else ops.push(fill(c.x, c.top + 1, c.z, c.x, c.top + h, c.z, "chiseled_deepslate"));
      continue;
    }
    ops.push(fill(c.x, c.top + 1, c.z, c.x, c.top + h, c.z, speckle(SEED + 85 + h, c.x, c.z, RIM)));
  }
}

/**
 * 折れた柱・灯台柱。**1 マスずつ、離して立てる。**
 *
 * **並べて塊にすると、その上が登れない面になる**（0-8）。
 * **1 マスの柱は歩いて回り込めるので、装飾として許されている。**
 * **|x| ≥ 7 に限る**——見通しの帯を高いもので塞がないため（0-3）。
 */
const PILLARS = [
  { x: -9, z: -7, h: 6 },
  { x: 8, z: -8, h: 4 },
  { x: 10, z: 3, h: 7 },
  { x: -7, z: 7, h: 3 },
  { x: -10, z: -1, h: 5 },
  { x: 7, z: 9, h: 5 },
  { x: -24, z: -5, h: 6 },
  { x: 23, z: 7, h: 5 },
  { x: -10, z: -38, h: 4 },
  { x: 8, z: -36, h: 5 },
  { x: 9, z: -42, h: 3 },
  { x: -8, z: -43, h: 4 },
  { x: -9, z: 42, h: 6 },
  { x: 8, z: 43, h: 4 },
] as const;

export function pillarOps(ops: BuildOp[], tops: ReadonlyMap<string, number>): void {
  for (const p of PILLARS) {
    // **削れて落ちた所には立てない**——支えの無い柱になる（0-5）
    if (tops.get(`${p.x},${p.z}`) !== DECK) continue;
    ops.push(fill(p.x, DECK + 1, p.z, p.x, DECK + p.h - 1, p.z, speckle(SEED + 101, p.x, p.z, PILLAR)));
    ops.push(set(p.x, DECK + p.h, p.z, "chiseled_deepslate"));
    ops.push(set(p.x, DECK + p.h + 1, p.z, "lantern"));
  }
}

/**
 * ゲートの枠。**箱（x −1〜1・y 1〜5・z 39）の外側にだけ置く**（0-2-1）。
 *
 * > ### **ポータルそのものは置かない**
 * >
 * > **敵を倒し切ったときに、進行の側が立てる**（`20-portal.md` 0-2）。
 * > ここで作るのは**その周りの石枠と、吊るした鎖と灯り**だけ。
 */
export function gateOps(ops: BuildOp[]): void {
  for (const x of [-4, -3, -2, 2, 3, 4]) {
    ops.push(fill(x, DECK + 1, 39, x, DECK + 5, 39, speckle(SEED + 111, x, 39, GATE_MAT)));
    ops.push(set(x, DECK + 6, 39, "chiseled_polished_blackstone"));
  }
  ops.push(fill(-2, DECK + 6, 39, 2, DECK + 6, 39, "polished_blackstone"));
  ops.push(fill(-4, DECK + 7, 39, 4, DECK + 7, 39, "polished_blackstone_bricks"));
  for (const x of [-5, 5]) {
    ops.push(fill(x, DECK + 1, 39, x, DECK + 3, 39, "iron_chain"));
    ops.push(set(x, DECK + 4, 39, "lantern"));
  }
}
