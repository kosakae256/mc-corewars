/**
 * 11「森の洋館」——**寸法と間取り。純粋。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 11 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 *      z ＝ −45  ┌───────┐              北棟（玄関大広間・大階段）
 *      z ＝ −26  ├───────┴───────┐
 *                │   本館        │      窓廊下・部屋列・大広間・階段の間
 *      z ＝ +25  ├───────┬───────┘
 *      z ＝ +45  └───────┘              南棟（ゲート前の広間）
 * ```
 *
 * > ### **塊を置いてから彫る**
 * >
 * > 屋内を「床と壁と天井を積む」で作ると、**天井の上が空になり、
 * > 外周の壁だけが飛び出して 0-8 の塗り広げから切り離される。**
 * > **先に外形を詰め、あとから部屋を抜く。** 彫り残しがそのまま壁と柱になる。
 *
 * > ### **外形は「放射のどの向きも ±50 の内側で切れる」形しか許されない**
 * >
 * > 0-4 の検査は **20〜50 マスを 2 度刻みで歩く。** 四角い建物は
 * > **斜め 45 度の線が d ＝ 50 でも (35, 35) にしか届かず、外に出られない。**
 * > **十字（本館＋南北の棟）にすると、どの向きも必ず外へ抜ける**——確かめてある。
 */

import { noise } from "./map-frame.js";

/** 種。**変えれば材の散り方が変わる** */
export const SEED = 3233;

/** 高さの段。**1 階も 2 階も内法 7 マス**——廊下でも弓が使える */
export const BASE = -6;
export const F1 = 0;
export const F2 = 8;
export const TOP2 = 16;
export const ROOF = 18;

/** 外形の板（x の半幅と z の範囲）。**すべて x ＝ 0 を中心にした帯** */
interface Slab {
  readonly xh: number;
  readonly z0: number;
  readonly z1: number;
}

const MASS: readonly Slab[] = [
  { xh: 40, z0: -26, z1: 25 }, // 本館
  { xh: 19, z0: -45, z1: -25 }, // 北棟
  { xh: 19, z0: 24, z1: 45 }, // 南棟
  { xh: 42, z0: -22, z1: -16 }, // 出窓（北寄り）
  { xh: 42, z0: 16, z1: 22 }, // 出窓（南寄り）
];

/** そこに建物があるか */
export function inMass(x: number, z: number): boolean {
  for (const s of MASS) {
    if (Math.abs(x) <= s.xh && z >= s.z0 && z <= s.z1) return true;
  }
  return false;
}

/** その z で建物が占める x の半幅。**帯はどれも中心が x ＝ 0 なので必ず繋がる** */
export function massHalf(z: number): number {
  let h = -1;
  for (const s of MASS) {
    if (z >= s.z0 && z <= s.z1) h = Math.max(h, s.xh);
  }
  return h;
}

// ================================================================ 間取り

/** 部屋の役割 */
export type Space = "solid" | "room" | "corr" | "hall" | "grand";

interface Band {
  readonly a: number;
  readonly b: number;
  readonly kind: "wall" | "room" | "corr";
  readonly id: number;
}

/** 本館の x の割り付け。**縦の廊下 3 本（中央と左右）** */
const XB: readonly Band[] = [
  { a: -37, b: -29, kind: "room", id: 0 },
  { a: -28, b: -28, kind: "wall", id: -1 },
  { a: -27, b: -23, kind: "corr", id: 1 },
  { a: -22, b: -22, kind: "wall", id: -1 },
  { a: -21, b: -12, kind: "room", id: 2 },
  { a: -11, b: -11, kind: "wall", id: -1 },
  { a: -10, b: -5, kind: "room", id: 3 },
  { a: -4, b: -4, kind: "wall", id: -1 },
  { a: -3, b: 3, kind: "corr", id: 4 },
  { a: 4, b: 4, kind: "wall", id: -1 },
  { a: 5, b: 10, kind: "room", id: 5 },
  { a: 11, b: 11, kind: "wall", id: -1 },
  { a: 12, b: 21, kind: "room", id: 6 },
  { a: 22, b: 22, kind: "wall", id: -1 },
  { a: 23, b: 27, kind: "corr", id: 7 },
  { a: 28, b: 28, kind: "wall", id: -1 },
  { a: 29, b: 37, kind: "room", id: 8 },
];

/** 本館の z の割り付け。**外壁沿いの 2 本が「窓の並ぶ廊下」** */
const ZB: readonly Band[] = [
  { a: -23, b: -19, kind: "corr", id: 0 },
  { a: -18, b: -18, kind: "wall", id: -1 },
  { a: -17, b: -12, kind: "room", id: 1 },
  { a: -11, b: -11, kind: "wall", id: -1 },
  { a: -10, b: 10, kind: "room", id: 2 },
  { a: 11, b: 11, kind: "wall", id: -1 },
  { a: 12, b: 17, kind: "room", id: 3 },
  { a: 18, b: 18, kind: "wall", id: -1 },
  { a: 19, b: 22, kind: "corr", id: 4 },
];

function bandOf(list: readonly Band[], v: number): Band | undefined {
  for (const b of list) {
    if (v >= b.a && v <= b.b) return b;
  }
  return undefined;
}

/** 大広間。**本館の真ん中を 2 層ぶち抜く** */
export function inGreatHall(x: number, z: number): boolean {
  return Math.abs(x) <= 10 && Math.abs(z) <= 10;
}

/** 出窓（本館の東西に張り出す小部屋） */
export function inBay(x: number, z: number): boolean {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return ax >= 38 && ax <= 40 && az >= 18 && az <= 22;
}

/** そこは何か。**壁は「彫らずに残した所」**——積んだのではない */
export function spaceAt(x: number, z: number): Space {
  const ax = Math.abs(x);
  if (z >= -42 && z <= -26 && ax <= 16) {
    if (z <= -32) return "grand";
    return z === -31 ? "solid" : "corr";
  }
  if (z >= 26 && z <= 38 && ax <= 16) {
    if (z <= 29) return "corr";
    return z === 30 ? "solid" : "grand";
  }
  if (inBay(x, z)) return "room";
  if (z < -23 || z > 22 || ax > 37) return "solid";
  if (inGreatHall(x, z)) return "hall";
  const xb = bandOf(XB, x);
  const zb = bandOf(ZB, z);
  if (xb === undefined || zb === undefined) return "solid";
  if (xb.kind === "wall" || zb.kind === "wall") return "solid";
  if (xb.kind === "corr" || zb.kind === "corr") return "corr";
  return "room";
}

/** 空いているか（壁でないか） */
export function isOpen(x: number, z: number): boolean {
  return spaceAt(x, z) !== "solid";
}

/** 部屋の見分け。**同じ番号なら同じ意匠にする** */
export function roomKey(x: number, z: number): number {
  if (inBay(x, z)) return 200 + (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0);
  const xb = bandOf(XB, x);
  const zb = bandOf(ZB, z);
  if (xb === undefined || zb === undefined) return -1;
  return xb.id * 16 + zb.id;
}

/**
 * **口を開けない部屋**（偽の部屋）。
 *
 * バニラの森の洋館には**入口の無い部屋**がある。**そこだけ壁を抜かない。**
 */
const SECRET: readonly number[] = [51];

export function isSecret(x: number, z: number): boolean {
  return spaceAt(x, z) === "room" && SECRET.includes(roomKey(x, z));
}

/**
 * 壁に開ける口の位置。
 *
 * **廊下の帯はまるごと抜く**（廊下は壁で切られない）。
 * **部屋の帯は 9 マスごとに 1 口**——長い部屋には 2 つ開く。
 */
function doorOn(list: readonly Band[], v: number): boolean {
  const b = bandOf(list, v);
  if (b === undefined || b.kind === "wall") return false;
  if (b.kind === "corr") return true;
  const len = b.b - b.a + 1;
  const n = Math.max(1, Math.floor(len / 9));
  for (let k = 0; k < n; k++) {
    const c = Math.round(b.a + (len * (k + 0.5)) / n - 0.5);
    if (Math.abs(v - c) <= 1) return true;
  }
  return false;
}

/** 縦の壁（x が固定）に口を開けるか。**位置は z の帯で決める** */
export function doorAtZ(z: number): boolean {
  return doorOn(ZB, z);
}

/** 横の壁（z が固定）に口を開けるか */
export function doorAtX(x: number): boolean {
  return doorOn(XB, x);
}

/** そこは廊下の帯か。**廊下どうしの繋ぎ目は高く抜く** */
export function tallDoorZ(z: number): boolean {
  return bandOf(ZB, z)?.kind === "corr";
}

export function tallDoorX(x: number): boolean {
  return bandOf(XB, x)?.kind === "corr";
}
