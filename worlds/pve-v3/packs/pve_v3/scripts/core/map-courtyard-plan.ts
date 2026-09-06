/**
 * 5「城の中庭」の**割り付け。純粋。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 5 番。
 * 決まりは `spec/14-map-build.md` 0 章。
 *
 * ## 帯で決める
 *
 * **城は正方形なので、中心からの「チェビシェフ距離」`c ＝ max(|x|,|z|)` だけで割り付く。**
 *
 * ```
 *    0 〜 33   中庭（石畳・噴水・植え込み）      天面 y ＝ 0
 *      34      回廊の柱列（アーチ）              軒 14
 *   35 〜 38   歩廊（1 階）／その上が 2 階の回廊  屋根 15〜17
 *   39 〜 41   回廊の背面（壁体）                 棟から樋へ 16〜14
 *   42 〜 46   城壁（歩廊と胸壁）                 15〜18
 *      47      控え柱（外面の意匠）               18
 * ```
 *
 * > ### **天面の段差は、どこでも 1 マスまで**（0-8）
 * >
 * > `CROWN` の**隣り合う値の差を 1 以内**に保つこと。
 * > **塔も同じ**——裾を胸壁と同じ高さ（`RIM`）から始めて、1 マスずつ絞る。
 * > **段差 2 マスの天面を作ると、そこから上へ登れなくなる。**
 */

import { GROUND, speckle } from "./map-frame.js";

/** 種。**変えれば別の石目になる** */
export const SEED = 2411;

/** 中庭の外端。**ここまでが石畳** */
export const COURT = 33;
/** 回廊の柱列 */
export const ARC = 34;
/** 歩廊（1 階）の内端と外端 */
export const AISLE_IN = 35;
export const AISLE_OUT = 38;
/** 回廊の背面 */
export const BACK_IN = 39;
export const BACK_OUT = 41;
/** 城壁の内面と外面 */
export const WALL_IN = 42;
export const WALL_OUT = 46;
/** 控え柱。**外面から 1 マスだけ出す** */
export const PILASTER = 47;

/** 2 階の床の天面 */
export const LOFT = GROUND + 7;

/**
 * 胸壁の天。**塔の裾もここに合わせる。**
 *
 * **塔の裾を胸壁より高くすると、そこから先が登れなくなる**（0-8）。
 */
export const RIM = GROUND + 18;

/** `c ＝ 34` から `46` までの天面。**隣との差は 1 以内** */
const CROWN = [14, 15, 16, 17, 17, 16, 15, 14, 15, 16, 16, 17, 18];

/** 石の混ぜ方。**建物なので揃えてよいが、少しだけ古びさせる**（0-7） */
const BODY = ["stone_bricks", "stone_bricks", "stone_bricks", "cracked_stone_bricks", "andesite", "mossy_stone_bricks"];

/**
 * 屋根の瓦。**素焼きの赤。**
 *
 * > ### 石と同じ灰色にしない（2026-09-06）
 * >
 * > **粘板岩で葺いたら、城全体が真っ黒の塊に見えた。**
 * > **屋根だけ暖色にすると、石壁との境がはっきりする。**
 */
const TILE = ["brick_block", "granite", "polished_granite", "brick_block", "hardened_clay"];

/** 中心からのチェビシェフ距離 */
export function cheb(x: number, z: number): number {
  return Math.max(Math.abs(x), Math.abs(z));
}

/** その柱が、輪のどこに居るか。**四辺で同じ意匠を回すための目盛り** */
export function ringT(x: number, z: number): number {
  return Math.abs(x) >= Math.abs(z) ? z : x;
}

/**
 * 柱か。**周期 7・柱 3 マス・間口 4 マス。**
 *
 * **正面（t ＝ 0）は間口にする**——門と大階段の軸に柱が立つと、正面が塞がる。
 */
export function isPier(t: number): boolean {
  return (Math.abs(t) + 4) % 7 <= 2;
}

/** いちばん近い柱までの距離。**アーチの持ち上がりを決める** */
export function toPier(t: number): number {
  for (let d = 1; d <= 4; d++) if (isPier(t - d) || isPier(t + d)) return d;
  return 4;
}

/** 柱 1 本ぶんの天面 */
export interface Crown {
  /** 天面の高さ */
  readonly top: number;
  /** 天面に置く材 */
  readonly cap: string;
  /** その下に詰める材 */
  readonly body: string;
  /** どの部位か。**中を抜く所を選ぶのに使う** */
  readonly kind: "roof" | "wall" | "turret" | "gate";
}

/** 隅塔と、壁から張り出す小塔 */
export interface Turret {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

/**
 * 塔。**同じ形を並べない**（0-6）——半径を変え、置き所も揃えない。
 *
 * **高さは `RIM + r`。** こうすると裾がちょうど胸壁の高さになり、
 * **1 マスずつ登って頂まで行ける。**
 */
export const TURRETS: readonly Turret[] = [
  { x: -42, z: -42, r: 7 },
  { x: 42, z: -42, r: 6 },
  { x: -42, z: 42, r: 6 },
  { x: 42, z: 42, r: 7 },
  { x: -45, z: 4, r: 4 },
  { x: 45, z: -10, r: 4 },
  { x: -13, z: -45, r: 4 },
  { x: 14, z: -45, r: 4 },
];

/**
 * 塔の頂の高さ。**裾から 1 マスずつしか上げられない**（0-8）——
 * **外の 2 輪は狭間つきの平らな縁**なので、円錐が始まるのは `r − 2` から。
 */
export function turretTop(t: Turret): number {
  return RIM + t.r - 1;
}

/** 屋根に載る小さな切妻。**長い屋根面を切って、単調さを消す** */
const GABLET_T = [-30, -19, -6, 7, 18, 29];

/** 煙突。**1 マスだけ。**まとまった天面にならないので高く伸ばせる */
const CHIMNEYS: readonly (readonly [number, number])[] = [
  [-39, -24],
  [39, 10],
  [-26, -39],
  [19, 39],
  [-39, 29],
  [31, -39],
  [40, -31],
  [-40, 17],
];

/** 控え柱を出す目盛り。**等間隔に置かない**（0-6） */
const PILASTER_T = [-38, -25, -14, -3, 9, 21, 33];

/** 門楼。**|x| ≤ 6・z ≥ 39 は 0-8 の対象外**なので、ここだけは高く立てられる */
const GH_HALF = 6;
const GH_TOP = GROUND + 24;

function body(x: number, z: number): string {
  return speckle(SEED + 7, x, z, BODY);
}

/** 屋根の天面の材 */
function roofCap(x: number, z: number, c: number): string {
  if (c === ARC) return "stone_bricks";
  if (c === 37 || c === 38) return "gray_terracotta";
  if (c === BACK_OUT) return "polished_deepslate";
  return speckle(SEED + 3, x, z, TILE);
}

/**
 * 城壁の天面の材。
 *
 * > ### 外壁は明るい石にする（2026-09-06）
 * >
 * > **屋根を赤くしたら、今度は灰色の壁が沈んで見えた。**
 * > **上へ行くほど明るく**——巡回の踏み面、腰、狭間の順に白くする。
 */
function wallCap(x: number, z: number, c: number): string {
  if (c === 43 || c === 44) return speckle(SEED + 11, x, z, ["andesite", "polished_andesite", "smooth_stone"]);
  if (c === 45) return "smooth_stone";
  return "stone_bricks";
}

function gablet(t: number, c: number): number | undefined {
  if (c > ARC + 2) return undefined;
  for (const g of GABLET_T) {
    const d = Math.abs(t - g);
    if (d <= 1) return GROUND + 16 + (c - ARC) - d;
  }
  return undefined;
}

function chimney(x: number, z: number): Crown | undefined {
  for (const [cx, cz] of CHIMNEYS) {
    if (x === cx && z === cz)
      return { top: GROUND + 20, cap: "polished_blackstone", body: "polished_blackstone", kind: "roof" };
  }
  return undefined;
}

/**
 * 控え柱。**外壁の意匠は、これで持たせる**（0-4）。
 *
 * 真ん中の 1 本だけを**小尖塔**にして胸壁より高く抜く——
 * **1 マス角なので、天面がまとまらず 0-8 に掛からない。**
 */
function pilaster(x: number, z: number): Crown | undefined {
  const t = ringT(x, z);
  for (const p of PILASTER_T) {
    if (t === p) return { top: RIM + 3, cap: "chiseled_stone_bricks", body: body(x, z), kind: "wall" };
    if (Math.abs(t - p) <= 1) return { top: RIM + 1, cap: "polished_diorite", body: body(x, z), kind: "wall" };
  }
  return undefined;
}

/**
 * 丸塔。**狭間つきの縁と、その内側の円錐屋根。**
 *
 * ```
 *          ▲          d ＝ 0     頂（RIM + r − 1）
 *        ／ ＼        d ≤ r−2   円錐（1 輪ごとに 1 マス）
 *      ▄▄     ▄▄      d ＝ r−1  巡回の縁（RIM）
 *      █▄█▄█▄█▄█      d ＝ r    狭間（RIM ＋ 0/1）
 * ```
 *
 * **円錐だけの塔にすると、ただの土饅頭に見えた**（2026-09-06）。
 */
function turret(x: number, z: number): Crown | undefined {
  for (const t of TURRETS) {
    const d = Math.round(Math.hypot(x - t.x, z - t.z));
    if (d > t.r) continue;
    const b = body(x, z);
    if (d === t.r) {
      const merlon = (((x + z) % 5) + 5) % 5 < 3;
      const cap = merlon ? "polished_diorite" : "smooth_stone";
      return { top: RIM + (merlon ? 1 : 0), cap, body: b, kind: "turret" };
    }
    if (d === t.r - 1) return { top: RIM, cap: "polished_andesite", body: b, kind: "turret" };
    const cap = d === 0 ? "gray_terracotta" : speckle(SEED + 5, x, z, TILE);
    return { top: turretTop(t) - d, cap, body: b, kind: "turret" };
  }
  return undefined;
}

function gateHouse(x: number, z: number): Crown | undefined {
  if (Math.abs(x) > GH_HALF || z < 39 || z > 46) return undefined;
  const b = "stone_bricks";
  if (Math.abs(x) >= GH_HALF - 1 && z >= 41 && z <= 44) {
    return { top: GH_TOP + 3, cap: "chiseled_stone_bricks", body: b, kind: "gate" };
  }
  const edge = Math.abs(x) >= GH_HALF - 1 || z === 39 || z === 46;
  if (!edge) return { top: GH_TOP, cap: "andesite", body: b, kind: "gate" };
  const t = Math.abs(x) >= GH_HALF - 1 ? z : x;
  const merlon = (Math.abs(t) + 1) % 4 < 3;
  const cap = merlon ? "chiseled_stone_bricks" : "smooth_stone";
  return { top: GH_TOP + (merlon ? 2 : 1), cap, body: b, kind: "gate" };
}

function bandCrown(x: number, z: number, c: number): Crown | undefined {
  if (c < ARC) return undefined;
  if (c === PILASTER) return pilaster(x, z);
  if (c > WALL_OUT) return undefined;
  const t = ringT(x, z);
  const gab = gablet(t, c);
  if (gab !== undefined) return { top: gab, cap: "gray_terracotta", body: body(x, z), kind: "roof" };
  const chim = chimney(x, z);
  if (chim !== undefined) return chim;
  if (c === WALL_OUT) {
    const merlon = (Math.abs(t) + 1) % 4 < 3;
    const cap = merlon ? "polished_diorite" : "smooth_stone";
    return { top: GROUND + (merlon ? 18 : 17), cap, body: body(x, z), kind: "wall" };
  }
  const top = GROUND + (CROWN[c - ARC] ?? 0);
  const roof = c <= BACK_OUT;
  return { top, cap: roof ? roofCap(x, z, c) : wallCap(x, z, c), body: body(x, z), kind: roof ? "roof" : "wall" };
}

/**
 * その柱の天面。**何も無い所は `undefined`。**
 *
 * **門楼 → 塔 → 帯**の順に強い。塔と帯が重なる所は**高いほうを採る**——
 * **低いほうを採ると、塔の裾に穴が開く。**
 */
export function crownAt(x: number, z: number): Crown | undefined {
  const gate = gateHouse(x, z);
  if (gate !== undefined) return gate;
  const c = cheb(x, z);
  const band = bandCrown(x, z, c);
  const tur = turret(x, z);
  if (tur === undefined) return band;
  if (band === undefined || tur.top >= band.top) return tur;
  return band;
}
