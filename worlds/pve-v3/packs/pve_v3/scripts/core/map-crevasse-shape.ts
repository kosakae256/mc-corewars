/**
 * 戦場 13「氷河の裂け目」——**平面と高さ。純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 13 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **氷河が割れて、底の見えない裂け目が島を真っ二つにしている。**
 * >
 * > 表は雪、割れ目から**青い氷の層**が覗く。壁には**岩屑の縞**が横に走り、
 * > **下へ行くほど青が濃くなって**、やがて闇に消える。
 * >
 * > **渡れるのは 3 本だけ。**
 * > 西に**自然に残った氷の橋**、真ん中に**落ちた岩が挟まった所**、
 * > 東に**人が架けた板と縄。** それ以外は落ちる。
 *
 * > ### 裂け目に底を作らない（**0-8 のため**）
 * >
 * > 底を敷くと、そのマスの天面が**湧く所から 30 マス下**になり、
 * > **歩いて行けない面**が一面に残って検査に落ちる。
 * > **島を貫く切れ目**にして、下は奈落にする——**落ちれば戻される**（0-4）。
 *
 * > ### 形の判定は、この口に集める
 * >
 * > 材（`map-crevasse-mat.ts`）と飾り（`map-crevasse-deco.ts`）が
 * > **同じ形を読む。** 互いに読み合わせると読み込みの輪ができる。
 */

import { BOTTOM, GROUND, smoothWave } from "./map-frame.js";

/** 種。**変えれば別の裂け目になる** */
export const SEED = 3507;

/** 柱の名前 */
export function key(x: number, z: number): string {
  return `${x},${z}`;
}

/** 4 近傍 */
export const NEIGH: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// ================================================================ 島の輪郭

/** 超楕円。**角を落とした四角**——真円だと湧く所（z ＝ −40）が縁からはみ出す */
const RA = 45;
const RB = 45;
const POW = 2.6;

/** 芯からの隔たり。**1 が縁** */
export function landF(x: number, z: number): number {
  return (Math.abs(x) / RA) ** POW + (Math.abs(z) / RB) ** POW;
}

/**
 * 奥の縁。**ゲートのすぐ裏で島が終わる。**
 *
 * **回り込めるポータルは置く意味がない**（0-3）。
 * 浮島なので**裏は縁の外＝奈落**でよい——ゲートは氷河の突端に立っている。
 */
function brinkZ(x: number): number {
  return 43 + smoothWave(SEED + 2, x, 0, 17) * 1.8 + smoothWave(SEED + 12, x, 0, 7) * 0.9;
}

/**
 * **芯から 46 マスより外へは、1 マスも置かない。**
 *
 * > ### 浮島には外壁が立てられない
 * >
 * > 0-4 の検査は**芯から 20〜50 マスを放射に辿り、
 * > 途中で床が切れれば「奈落で閉じている」**と見なす。
 * > **半径 46 に収めておけば、どの向きも 47 マス目で必ず切れる**——
 * > 超楕円の角（斜め 49 マス）が残っていて、実際に 1 方向落ちた。
 */
export const REACH = 46;

/** 島の上か。**半径 46 に収める**（0-1 の上限は ±50） */
export function onIsland(x: number, z: number): boolean {
  if (Math.hypot(x, z) > REACH) return false;
  if (z > brinkZ(x)) return false;
  return landF(x, z) <= 1 + smoothWave(SEED + 1, x, z, 15) * 0.14;
}

// ================================================================ 裂け目

function bump(d: number, w: number): number {
  return Math.exp(-((d * d) / (w * w)));
}

/**
 * 裂け目の芯（z）。**うねらせる**——真っ直ぐな溝は掘った跡に見える。
 *
 * **端では 0 へ寄せる**——島の東西の先まで確実に切り抜くため
 * （切り残すと裂け目を回り込めてしまい、**渡る所が 3 本**でなくなる）。
 */
export function crevZ(x: number): number {
  const damp = 1 - Math.min(1, Math.max(0, (Math.abs(x) - 30) / 15));
  return (smoothWave(SEED + 3, x, 0, 33) * 5.5 + smoothWave(SEED + 4, x, 0, 13) * 1.8) * damp;
}

/**
 * 裂け目の半幅。**幅 12〜27。**
 *
 * **渡る所ごとに変える**（0-6）——氷の橋は狭まった所に残り、
 * 岩が詰まったのは**いちばん広く開いた所。**
 *
 * > ### 広げ過ぎると、奥岸が細くなる（2026-09-06 に詰めた）
 * >
 * > 芯を ＋3 に置いて半幅 16 まで許したら、**奥岸が 15 マスしか残らず**、
 * > ゲートの手前が廊下になった。**芯を 0 に戻して、半幅を 14 で止める。**
 */
export function crevHalf(x: number): number {
  let h = 9.5 + smoothWave(SEED + 5, x, 0, 29) * 2.6 + smoothWave(SEED + 6, x, 0, 12) * 1.1;
  h -= 3.0 * bump(x + 29, 8);
  h += 2.6 * bump(x, 14);
  h -= 1.2 * bump(x - 27, 7);
  if (Math.abs(x) > 32) h += (Math.abs(x) - 32) * 0.8;
  return Math.min(14, Math.max(5.5, h));
}

/** 裂け目へどれだけ入っているか。**正なら裂け目の中、負なら岸**（絶対値が縁からの隔たり） */
export function crevIn(x: number, z: number): number {
  return crevHalf(x) + smoothWave(SEED + 8, x, z, 9) * 1.7 - Math.abs(z - crevZ(x));
}

/**
 * 枝の亀裂。**本流から岸へ食い込んで、行き止まりで終わる。**
 *
 * **先を島の縁まで届かせない**——届くと岸が割れて、渡れない区画ができる。
 */
interface Fissure {
  readonly x: number;
  readonly side: number;
  readonly len: number;
  readonly tilt: number;
  readonly w: number;
}

const FISSURES: readonly Fissure[] = [
  { x: -19, side: -1, len: 14, tilt: -0.3, w: 2.7 },
  { x: 15, side: -1, len: 10, tilt: 0.45, w: 2.0 },
  { x: -13, side: 1, len: 12, tilt: -0.4, w: 2.3 },
  { x: 21, side: 1, len: 16, tilt: 0.22, w: 2.9 },
  { x: 36, side: -1, len: 9, tilt: -0.2, w: 1.8 },
];

export function inFissure(x: number, z: number): boolean {
  let i = 0;
  for (const f of FISSURES) {
    i++;
    const az = crevZ(f.x) + f.side * (crevHalf(f.x) - 1);
    const dx = f.tilt * f.len;
    const dz = f.side * f.len;
    const t = Math.max(0, Math.min(1, ((x - f.x) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (f.x + dx * t), z - (az + dz * t));
    if (d < f.w * (1 - t * 0.8) + smoothWave(SEED + 70 + i, x, z, 6) * 0.6) return true;
  }
  return false;
}

// ================================================================ 渡る所

export type Cross = "arch" | "jam" | "rope";

interface CrossDef {
  readonly kind: Cross;
  readonly x: number;
  readonly half: number;
  /** 縁の揺らぎ。**人が架けたものは揺らさない**（0-7 の但し書き） */
  readonly wob: number;
}

/** **3 本だけ。** 姿はすべて変える（0-6） */
export const CROSSES: readonly CrossDef[] = [
  { kind: "arch", x: -29, half: 4.4, wob: 1.6 },
  { kind: "jam", x: 0, half: 4.0, wob: 2.4 },
  { kind: "rope", x: 27, half: 2.5, wob: 0 },
];

/** そこが渡る所か。**裂け目の中でだけ意味がある** */
export function crossAt(x: number, z: number): Cross | null {
  let i = 0;
  for (const c of CROSSES) {
    i++;
    const w = c.wob === 0 ? c.half : c.half + smoothWave(SEED + 20 + i, x, z, 8) * c.wob;
    if (Math.abs(x - c.x) <= w) return c.kind;
  }
  return null;
}

/**
 * 雪庇の張り出し。**縁から裂け目へ、何マス突き出すか**（0 なら無し）。
 *
 * **支えのある形にする**（0-5）——突き出した下は
 * 縁の側で厚く、先で薄い**楔**になっていて、そこから氷柱が下がる。
 */
export function corniceReach(x: number, z: number): number {
  const side = z > crevZ(x) ? 1 : 0;
  const lean = smoothWave(SEED + 25 + side, x, 0, 12) + smoothWave(SEED + 27 + side, x, 0, 5) * 0.4;
  return Math.max(0, Math.min(3, Math.round(1.5 + lean * 2)));
}

// ================================================================ 柱

export type Kind = "bank" | "cornice" | "arch" | "jam" | "rope";

/** 1 本ぶん。**天面と下端。** relax で下げるので `readonly` にしない */
export interface Col {
  readonly x: number;
  readonly z: number;
  top: number;
  bottom: number;
  readonly kind: Kind;
}

/**
 * 島の腹。**芯ほど深く、縁で薄い**——浮島の底（0-4）。
 *
 * 裂け目は島の芯を通るので、**壁は 30 マス以上の高さ**になる。
 * そこに地層を積んで見せる（`map-crevasse-mat.ts`）。
 */
export function landBottom(x: number, z: number): number {
  const t = Math.max(0, 1 - landF(x, z));
  const b = GROUND - 3 - 34 * t ** 0.7 + smoothWave(SEED + 51, x, z, 14) * 3 + smoothWave(SEED + 53, x, z, 6) * 1.5;
  return Math.max(BOTTOM + 2, Math.round(Math.min(GROUND - 2, b)));
}
