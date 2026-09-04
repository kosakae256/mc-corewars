/**
 * ブロックを置く手順の、共通部品。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 6 章。
 *
 * ## なぜ「手順」なのか
 *
 * **1 マスずつ置くと、休憩所 1 つで数十万手になる。**
 * **箱で塗れる所は箱で塗る**——手順を数千に抑えて、tick に分けて流す。
 */

import type { Place } from "./places.js";

/** 置き方 */
export type BuildOp =
  | { readonly kind: "fill"; readonly from: Place; readonly to: Place; readonly block: string }
  | { readonly kind: "set"; readonly at: Place; readonly block: string };

export function fill(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, block: string): BuildOp {
  return { kind: "fill", from: { x: x1, y: y1, z: z1 }, to: { x: x2, y: y2, z: z2 }, block };
}

export function set(x: number, y: number, z: number, block: string): BuildOp {
  return { kind: "set", at: { x, y, z }, block };
}

/** 何マス動かすか。**tick あたりの予算を測るのに使う** */
export function volumeOf(op: BuildOp): number {
  if (op.kind === "set") return 1;
  const dx = Math.abs(op.to.x - op.from.x) + 1;
  const dy = Math.abs(op.to.y - op.from.y) + 1;
  const dz = Math.abs(op.to.z - op.from.z) + 1;
  return dx * dy * dz;
}

/** 半径 r の円で、中心からの距離 d における半幅 */
export function halfWidth(r: number, d: number): number {
  return Math.floor(Math.sqrt(Math.max(0, r * r - d * d)));
}

/** 円周の 1 マス */
export interface RingPoint {
  readonly x: number;
  readonly z: number;
  /** 中心から見た角度（度）。**0 が ＋x、90 が ＋z** */
  readonly a: number;
}

/**
 * 円周のマスを、**隙間なく**返す。
 *
 * > ### 角度で刻むと、外側ほど隙間が空く
 * >
 * > 半径 60 の円を 2 度ずつ刻むと、**1 マスおきに穴が空く**——
 * > **実際に「柱が雑い」形で出てしまった**（2026-09-04）。
 * >
 * > **x で走らせた点と、z で走らせた点を合わせる**と、必ず繋がる。
 */
export function circlePoints(cz: number, r: number): RingPoint[] {
  const seen = new Set<string>();
  const out: RingPoint[] = [];
  const add = (x: number, dz: number): void => {
    const key = `${x},${dz}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ x, z: cz + dz, a: (Math.atan2(dz, x) * 180) / Math.PI });
  };
  for (let x = -r; x <= r; x++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - x * x)));
    add(x, w);
    add(x, -w);
  }
  for (let dz = -r; dz <= r; dz++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - dz * dz)));
    add(w, dz);
    add(-w, dz);
  }
  return out.sort((p, q) => p.a - q.a);
}

/** 角度の差（−180〜180） */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** 円柱を塗る。**x の帯ごとに 1 回**（1 回が大きすぎると通らない） */
export function cylinder(ops: BuildOp[], cz: number, r: number, y0: number, y1: number, block: string): void {
  for (let x = -r; x <= r; x++) {
    const w = halfWidth(r, x);
    ops.push(fill(x, y0, cz - w, x, y1, cz + w, block));
  }
}

/** 円盤を 1 段ぶん敷く */
export function disc(ops: BuildOp[], cz: number, r: number, y: number, block: string): void {
  for (let z = -r; z <= r; z++) {
    const w = halfWidth(r, z);
    ops.push(fill(-w, y, cz + z, w, y, cz + z, block));
  }
}

/** 輪（ドーナツ）を 1 段ぶん敷く。**段丘の踏み面** */
export function annulus(ops: BuildOp[], cz: number, inner: number, outer: number, y: number, block: string): void {
  for (let z = -outer; z <= outer; z++) {
    const wo = halfWidth(outer, z);
    const wi = halfWidth(inner, z);
    if (Math.abs(z) >= inner) {
      ops.push(fill(-wo, y, cz + z, wo, y, cz + z, block));
      continue;
    }
    ops.push(fill(-wo, y, cz + z, -wi, y, cz + z, block));
    ops.push(fill(wi, y, cz + z, wo, y, cz + z, block));
  }
}

/** 円周を 1 枚の壁にする。**隙間が空かない** */
export function ringWall(ops: BuildOp[], cz: number, r: number, y0: number, y1: number, block: string): void {
  for (const p of circlePoints(cz, r)) ops.push(fill(p.x, y0, p.z, p.x, y1, p.z, block));
}
