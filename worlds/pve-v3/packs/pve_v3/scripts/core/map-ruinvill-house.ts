/**
 * 廃村——**崩れた家を 1 軒、組む。**
 *
 * 決まりは `spec/14-map-build.md` 0 章。**建物なので、揃っていてよい**（0-7）。
 *
 * ## 崩し方の考え方
 *
 * > ### 壁の高さは、外周をぐるっと回る 1 本の折れ線
 * >
 * > **どこか 1 箇所は必ず地面まで落とす**（崩落口）。
 * > そのうえで**隣との差を 1 マスに収める**と、
 * > **壁の天端が、地面から歩いて登れる坂**になる（0-8）。
 * > **崩れた壁は本当にそう見える**ので、決まりと意匠が同じ方向を向く。
 *
 * > ### 屋根は、外周から内へ 1 段ずつ上がる
 * >
 * > **寄棟。** 縁は必ず壁の天端のすぐ上に来るので、**屋根も歩いて登れる。**
 * > **崩落口の真上は抜く**——そこから家の中が見える。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise, speckle } from "./map-frame.js";
import { KITS, type Kit } from "./map-ruinvill-kit.js";

/** 家 1 軒 */
export interface House {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** 壁のいちばん高い所 */
  readonly h: number;
  /** 材の組（`KITS` の番号） */
  readonly kit: number;
  /** 屋根の勾配。**0 なら陸屋根、3 なら急** */
  readonly pitch: number;
  /** 崩れ具合 0〜1 */
  readonly ruin: number;
  /**
   * 崩落口の数。**既定は 1。**
   *
   * **壁を上から下まで抜く所（大扉など）がある建物では、2 つ以上にする**——
   * 抜いた所で外周が切れ、**崩落口の無い側が丸ごと登れなくなる**（0-8）。
   */
  readonly gaps?: number;
  /**
   * 崩落口を置く場所。**外周を 1 周を 1 とした割合。**
   *
   * **どこが切れるか分かっている建物では、置き場所まで決める**——
   * 乱数任せだと、切れた弧の側に崩落口が来ないことがある。
   */
  readonly gapAt?: readonly number[];
  readonly seed: number;
}

/** 外周の 1 マス */
interface Cell {
  readonly x: number;
  readonly z: number;
  readonly corner: boolean;
}

/** 外周を、ぐるっと 1 周ぶん並べる */
function ring(h: House): Cell[] {
  const out: Cell[] = [];
  const corner = (x: number, z: number): boolean => (x === h.x0 || x === h.x1) && (z === h.z0 || z === h.z1);
  for (let x = h.x0; x <= h.x1; x++) out.push({ x, z: h.z0, corner: corner(x, h.z0) });
  for (let z = h.z0 + 1; z <= h.z1; z++) out.push({ x: h.x1, z, corner: corner(h.x1, z) });
  for (let x = h.x1 - 1; x >= h.x0; x--) out.push({ x, z: h.z1, corner: corner(x, h.z1) });
  for (let z = h.z1 - 1; z >= h.z0 + 1; z--) out.push({ x: h.x0, z, corner: false });
  return out;
}

/**
 * 外周の高さ。
 *
 * **崩落口で 0 まで落とし、そこから 1 マスずつしか上がれないように均す。**
 * 均すのは**下げる向きだけ**なので、形が壊れることはない。
 */
function profile(h: House, cells: readonly Cell[]): { hs: number[]; gap: number } {
  const n = cells.length;
  const hs = cells.map((c) => {
    const r = noise(h.seed + 1, c.x, c.z) * 0.6 + noise(h.seed + 2, c.x >> 1, c.z >> 1) * 0.4;
    return Math.max(1, Math.min(h.h, Math.round(h.h * (0.5 + r * 0.75))));
  });
  const len = 2 + Math.round(h.ruin * 5);
  const spots =
    h.gapAt !== undefined
      ? h.gapAt.map((f) => Math.round(f * n))
      : (() => {
          const gap = Math.floor(noise(h.seed + 3, h.x0, h.z0) * n);
          const count = Math.max(1, h.gaps ?? 1);
          const out: number[] = [];
          for (let k = 0; k < count; k++) out.push(gap + Math.round((n * k) / count));
          return out;
        })();
  for (const at of spots) {
    for (let i = 0; i < len; i++) hs[(((at + i) % n) + n) % n] = 0;
  }
  const gap = spots[0] % n;
  for (let pass = 0; pass < h.h + 2; pass++) {
    for (let i = 0; i < n; i++) {
      hs[i] = Math.min(hs[i], Math.min(hs[(i + n - 1) % n], hs[(i + 1) % n]) + 1);
    }
  }
  return { hs, gap };
}

/** 壁を積む。**土台と上の壁で材を変える**——崩れた断面が見えるように */
function walls(ops: BuildOp[], h: House, kit: Kit, cells: readonly Cell[], hs: readonly number[]): void {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const top = hs[i];
    if (top < 1) continue;
    if (c.corner && top >= 3) {
      ops.push(fill(c.x, 1, c.z, c.x, top, c.z, kit.post));
      continue;
    }
    const foot = Math.min(top, 2);
    ops.push(fill(c.x, 1, c.z, c.x, foot, c.z, speckle(h.seed + 11, c.x, c.z, kit.foot)));
    if (top > foot) ops.push(fill(c.x, foot + 1, c.z, c.x, top, c.z, speckle(h.seed + 13, c.x, c.z, kit.wall)));
  }
}

/** 窓と戸口を抜く。**両隣がその高さまで残っている所だけ**——抜いた上が浮かないように */
function openings(ops: BuildOp[], h: House, cells: readonly Cell[], hs: readonly number[]): void {
  const n = cells.length;
  let doorAt = -1;
  let doorD = 1e9;
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    if (c.corner || hs[i] < 3) continue;
    // **戸口は、村の真ん中を向いた面に付ける**
    const d = Math.hypot(c.x, c.z);
    if (d < doorD && Math.min(hs[(i + n - 1) % n], hs[(i + 1) % n]) >= 3) {
      doorD = d;
      doorAt = i;
    }
    if (hs[i] < 4) continue;
    if (Math.min(hs[(i + n - 1) % n], hs[(i + 1) % n]) < 4) continue;
    const r = noise(h.seed + 17, c.x, c.z);
    if (r > 0.26) continue;
    ops.push(fill(c.x, 2, c.z, c.x, 3, c.z, "air"));
    if (r > 0.16) ops.push(set(c.x, 2, c.z, "iron_bars"));
  }
  if (doorAt < 0) return;
  for (const i of [doorAt, (doorAt + 1) % n]) {
    const c = cells[i];
    if (c.corner || hs[i] < 3) continue;
    ops.push(fill(c.x, 1, c.z, c.x, 2, c.z, "air"));
  }
}

/**
 * 屋根。**外周から内へ 1 段ずつ上がる寄棟。**
 *
 * **崩落口の真上は抜く**——そこから中が見え、中の床も外と地続きになる。
 */
function roof(ops: BuildOp[], h: House, kit: Kit, cells: readonly Cell[], hs: readonly number[], gap: number): void {
  if (h.pitch < 0) return;
  const b = cells[gap];
  const rc = Math.min(1.6 + h.ruin * 3.6, (Math.min(h.x1 - h.x0, h.z1 - h.z0) - 1) / 2);
  const bite = (x: number, z: number): boolean => Math.hypot(x - b.x, z - b.z) < rc;
  // ---- **屋根の高さは「抜かれない縁に接した壁」の中でいちばん高い所 ＋ 1**
  let top = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.corner || hs[i] < 3) continue;
    const ix = c.x === h.x0 ? c.x + 1 : c.x === h.x1 ? c.x - 1 : c.x;
    const iz = c.z === h.z0 ? c.z + 1 : c.z === h.z1 ? c.z - 1 : c.z;
    if (bite(ix, iz)) continue;
    top = Math.max(top, hs[i]);
  }
  if (top < 3) return;
  const base = top + 1;
  for (let x = h.x0 + 1; x <= h.x1 - 1; x++) {
    for (let z = h.z0 + 1; z <= h.z1 - 1; z++) {
      if (bite(x, z)) continue;
      const d = Math.min(x - h.x0, h.x1 - x, z - h.z0, h.z1 - z) - 1;
      const y = base + Math.min(d, h.pitch);
      // **1 段ぶん厚くする**——斜めに置いただけでは、ブロックが繋がらない（0-5）
      ops.push(fill(x, Math.max(base - 1, y - 1), z, x, y, z, kit.roof));
    }
  }
}

/** 床と、中に落ちた瓦礫 */
function inside(ops: BuildOp[], h: House, kit: Kit): void {
  if (h.x1 - h.x0 < 2 || h.z1 - h.z0 < 2) return;
  ops.push(fill(h.x0 + 1, 0, h.z0 + 1, h.x1 - 1, 0, h.z1 - 1, kit.floor));
  for (let x = h.x0 + 1; x <= h.x1 - 1; x++) {
    for (let z = h.z0 + 1; z <= h.z1 - 1; z++) {
      const r = noise(h.seed + 19, x, z);
      if (r > 0.22) continue;
      ops.push(set(x, 1, z, r > 0.14 ? "cobblestone" : r > 0.07 ? "cobblestone" : kit.post));
    }
  }
}

/** 崩れて外へこぼれた瓦礫。**崩落口の外に積む** */
function spill(ops: BuildOp[], h: House, cells: readonly Cell[], gap: number): void {
  const b = cells[gap];
  const ox = b.x === h.x0 ? -1 : b.x === h.x1 ? 1 : 0;
  const oz = b.z === h.z0 ? -1 : b.z === h.z1 ? 1 : 0;
  for (let i = 1; i <= 3; i++) {
    for (let j = -2; j <= 2; j++) {
      const x = b.x + ox * i + (ox === 0 ? j : 0);
      const z = b.z + oz * i + (oz === 0 ? j : 0);
      if (noise(h.seed + 23, x, z) > 0.55 - i * 0.12) continue;
      ops.push(set(x, 1, z, noise(h.seed + 29, x, z) > 0.5 ? "cobblestone" : "cobblestone"));
    }
  }
}

/** 1 軒ぶんの手順 */
export function house(ops: BuildOp[], h: House): void {
  const kit = KITS[h.kit % KITS.length];
  const cells = ring(h);
  const { hs, gap } = profile(h, cells);
  inside(ops, h, kit);
  walls(ops, h, kit, cells, hs);
  openings(ops, h, cells, hs);
  roof(ops, h, kit, cells, hs, gap);
  spill(ops, h, cells, gap);
}
