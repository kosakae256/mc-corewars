/**
 * 3. 溶岩の島——**冷えた溶岩流の筋・割れ目・海に立つ岩。**
 *
 * 決まりは `spec/14-map-build.md` 0-5〜0-8。**形は `map-lavaisle-land.ts`。**
 *
 * > ### 黒一色にしない
 * >
 * > **黒い岩だけだと、ただの暗い板になる。**
 * > **筋（＋1）で流れの向きを見せ、割れ目（−1）で下の赤を覗かせる。**
 * > **どちらも段差 1 マス**なので、敵も歩いて越えられる（0-8）。
 */

import { set, type BuildOp } from "./build.js";
import { noise, wave } from "./map-frame.js";
import { inLane, landAt, rimAt, seaAt, SEA_TOP, SEED } from "./map-lavaisle-land.js";

/** 噴き出し口。**島ごとに大きさも腕の数も変える**（0-6） */
interface Vent {
  readonly x: number;
  readonly z: number;
  /** 溜まりの半径 */
  readonly r: number;
  /** 流れ出す筋の本数 */
  readonly arms: number;
  readonly seed: number;
}

/** **帯（|x| ≤ 7）には置かない**ので、口はどれも脇に寄せてある（0-3） */
const VENTS: readonly Vent[] = [
  { x: 13, z: -12, r: 3, arms: 7, seed: SEED + 210 },
  { x: -12, z: -2, r: 2, arms: 5, seed: SEED + 220 },
  { x: 25, z: -17, r: 2, arms: 4, seed: SEED + 230 },
  { x: 26, z: 17, r: 4, arms: 8, seed: SEED + 240 },
];

/** 割れ目。**始点・向き・長さを全部散らす**（0-6） */
interface Crack {
  readonly x: number;
  readonly z: number;
  /** 向き（ラジアン） */
  readonly dir: number;
  readonly len: number;
  readonly seed: number;
}

const CRACKS: readonly Crack[] = [
  { x: -15, z: -13, dir: 1.9, len: 17, seed: SEED + 310 },
  { x: 10, z: -3, dir: 0.4, len: 21, seed: SEED + 320 },
  { x: -14, z: 1, dir: -1.1, len: 12, seed: SEED + 330 },
  { x: 17, z: -16, dir: 2.6, len: 14, seed: SEED + 340 },
  { x: -26, z: -19, dir: 0.9, len: 11, seed: SEED + 350 },
  { x: -25, z: 15, dir: -0.3, len: 15, seed: SEED + 360 },
  { x: 27, z: 19, dir: 2.2, len: 13, seed: SEED + 370 },
  { x: -9, z: -30, dir: 1.4, len: 9, seed: SEED + 380 },
  { x: 10, z: -30, dir: 2.0, len: 10, seed: SEED + 390 },
];

/** 筋を 1 マス積む。**その柱の天面から積む**ので浮かない（0-5） */
function ridge(ops: BuildOp[], done: Set<string>, x: number, z: number, seed: number): void {
  const land = landAt(x, z);
  if (land === undefined || inLane(x)) return;
  const k = `${x},${z}`;
  if (done.has(k)) return;
  done.add(k);
  const m = noise(seed + 4, x, z);
  const block = m > 0.72 ? "smooth_basalt" : m > 0.42 ? "basalt" : m > 0.16 ? "blackstone" : "magma";
  ops.push(set(x, land.top + 1, z, block));
}

/** 口から 1 本、外へ流す。**まっすぐ流さない**——1 歩ごとに向きを揺らす */
function flow(ops: BuildOp[], done: Set<string>, v: Vent, arm: number): void {
  let dir = (arm / v.arms) * Math.PI * 2 + noise(v.seed, arm, 0) * 1.2;
  let x = v.x + Math.cos(dir) * (v.r + 2);
  let z = v.z + Math.sin(dir) * (v.r + 2);
  const len = 8 + Math.floor(noise(v.seed + 1, arm, 3) * 14);
  for (let i = 0; i <= len; i++) {
    dir += (noise(v.seed + 2, arm, i) - 0.5) * 0.55;
    x += Math.cos(dir);
    z += Math.sin(dir);
    // **末に向かって細る。** 同じ太さで伸ばすと帯に見える
    const wide = i < len - 3 && noise(v.seed + 3, arm, i) > 0.32 ? 1 : 0;
    for (let w = -wide; w <= wide; w++) {
      const px = Math.round(x - Math.sin(dir) * w);
      const pz = Math.round(z + Math.cos(dir) * w);
      ridge(ops, done, px, pz, v.seed);
    }
  }
}

/** 口の溜まり。**1 マスだけ掘って溶岩**——縁との差を 1 に保つ（0-8） */
function pool(ops: BuildOp[], cut: Set<string>, v: Vent): void {
  for (let dx = -v.r - 2; dx <= v.r + 2; dx++) {
    for (let dz = -v.r - 2; dz <= v.r + 2; dz++) {
      const x = v.x + dx;
      const z = v.z + dz;
      const land = landAt(x, z);
      if (land === undefined || inLane(x)) continue;
      const d = Math.hypot(dx, dz) + wave(v.seed, x, z, 5) * 0.8;
      if (d <= v.r) {
        ops.push(set(x, land.top, z, "air"));
        ops.push(set(x, land.top - 1, z, "lava"));
        cut.add(`${x},${z}`);
      } else if (d <= v.r + 1.6) {
        // **縁は焼けている**
        ops.push(set(x, land.top, z, noise(v.seed + 9, x, z) > 0.35 ? "magma" : "gilded_blackstone"));
      }
    }
  }
}

/**
 * 噴き出し口と、そこから走る筋を積む。
 *
 * **返すのは「筋を置いた所」**——割れ目はここを避ける。
 * **筋（＋1）の隣を掘る（−1）と、そこだけ段差 2 マスになる**（0-8）。
 */
export function vents(ops: BuildOp[], cut: Set<string>): Set<string> {
  const done = new Set<string>();
  for (const v of VENTS) {
    pool(ops, cut, v);
    for (let a = 0; a < v.arms; a++) flow(ops, done, v, a);
  }
  return done;
}

/** 筋か、その隣か */
function nearRidge(done: Set<string>, x: number, z: number): boolean {
  for (const [dx, dz] of OFFSETS) {
    if (done.has(`${x + dx},${z + dz}`)) return true;
  }
  return done.has(`${x},${z}`);
}

const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 割れ目の縁を焼く。**割れ目そのものは埋めない** */
function scorch(ops: BuildOp[], cut: Set<string>, done: Set<string>, x: number, z: number, seed: number): void {
  for (const [dx, dz] of OFFSETS) {
    const nx = x + dx;
    const nz = z + dz;
    if (noise(seed + 1, nx, nz) > 0.5) continue;
    if (cut.has(`${nx},${nz}`) || done.has(`${nx},${nz}`) || inLane(nx)) continue;
    const n = landAt(nx, nz);
    if (n === undefined) continue;
    ops.push(set(nx, n.top, nz, "magma"));
  }
}

/**
 * 割れ目を彫る。**1 マスだけ掘って、下の溶岩を覗かせる。**
 *
 * **掘るのは 1 マス**——2 マス掘ると、そこが「歩いて行けない面」になる（0-8）。
 */
export function cracks(ops: BuildOp[], cut: Set<string>, done: Set<string>): void {
  for (const c of CRACKS) {
    let dir = c.dir;
    let x = c.x;
    let z = c.z;
    for (let i = 0; i < c.len; i++) {
      dir += (noise(c.seed, i, 0) - 0.5) * 0.75;
      x += Math.cos(dir);
      z += Math.sin(dir);
      const bx = Math.round(x);
      const bz = Math.round(z);
      const land = landAt(bx, bz);
      if (land === undefined || inLane(bx) || nearRidge(done, bx, bz)) continue;
      if (cut.has(`${bx},${bz}`)) continue;
      cut.add(`${bx},${bz}`);
      ops.push(set(bx, land.top, bz, "air"));
      ops.push(set(bx, land.top - 1, bz, "lava"));
      scorch(ops, cut, done, bx, bz, c.seed);
    }
  }
}

/** そこは開けた海か。**島に寄せると、島の形が濁る** */
function openSea(x: number, z: number): boolean {
  // **冷えた縁の上には置かない**——縁の黒い輪を、岩でぼかさない
  if (!seaAt(x, z) || rimAt(x, z) > 0) return false;
  // **湧く所から門までの見通しを塞がない**（0-3）
  if (Math.abs(x) < 9 && z > -46 && z < 37) return false;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (landAt(x + dx, z + dz) !== undefined) return false;
    }
  }
  return true;
}

/** 海から突き出た岩。**1 本ずつ高さを変える**ので、上に立てる面が広がらない（0-8） */
function stack(ops: BuildOp[], x: number, z: number, seed: number): void {
  const h = 2 + Math.floor(noise(seed + 4, x, z) * 6);
  const mats = ["obsidian", "basalt", "blackstone", "smooth_basalt", "black_concrete"];
  const put = (px: number, pz: number, up: number): void => {
    if (up < 1 || !seaAt(px, pz)) return;
    for (let y = 0; y < up; y++) {
      ops.push(set(px, SEA_TOP + y, pz, mats[(Math.floor(noise(seed + 5, px, pz + y) * 5) + 5) % 5] ?? "basalt"));
    }
  };
  put(x, z, h);
  if (noise(seed + 6, x, z) > 0.45) put(x + 1, z, h - 2);
  if (noise(seed + 7, x, z) > 0.55) put(x, z + 1, h - 3);
}

/** 沈みかけの板。**海面より 1 だけ高い**ので、飛び石として渡れる */
function shelf(ops: BuildOp[], x: number, z: number, seed: number): void {
  const r = 2 + Math.floor(noise(seed + 8, x, z) * 3);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      if (Math.hypot(dx, dz) + wave(seed + 9, x + dx, z + dz, 4) * 0.9 > r) continue;
      if (!openSea(x + dx, z + dz)) continue;
      const m = noise(seed + 10, x + dx, z + dz);
      ops.push(set(x + dx, SEA_TOP + 1, z + dz, m > 0.7 ? "obsidian" : m > 0.35 ? "basalt" : "blackstone"));
    }
  }
}

/**
 * 海に岩を撒く。
 *
 * **等間隔に置かない**（0-6）——升目ごとに位置を升目の幅ぶん揺らし、
 * **3 つに 1 つは置かない。**
 */
export function reefs(ops: BuildOp[]): void {
  const STEP = 9;
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      const s = SEED + 500 + gx * 71 + gz * 131;
      if (noise(s, gx, gz) > 0.45) continue;
      const x = gx * STEP + Math.round((noise(s + 1, gx, gz) - 0.5) * STEP);
      const z = gz * STEP + Math.round((noise(s + 2, gx, gz) - 0.5) * STEP);
      if (!openSea(x, z)) continue;
      if (noise(s + 3, x, z) > 0.42) stack(ops, x, z, s);
      else shelf(ops, x, z, s);
    }
  }
}
