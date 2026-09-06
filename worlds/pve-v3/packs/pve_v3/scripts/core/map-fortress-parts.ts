/**
 * 戦場 09「ネザー要塞」の共通部品。**純粋。**
 *
 * 黒レンガの積み方——**基壇・胸壁・迫り持ち・段の付いた台**をここに置く。
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 9 番。
 * 決まりは `spec/14-map-build.md` 0 章。
 *
 * > ### なぜ「段」にこだわるのか
 * >
 * > **0-8 の検査は、湧く所から 1 マスずつ登って届く面しか認めない。**
 * > 壁の天端も屋根も、**どこかで 1 マスずつの段に繋がっていないと落ちる。**
 * > だから壁には**控え壁**を、迫り持ちには**1 マスずつの段**を必ず添える。
 * > 太い塔を建てないのも同じ理由——**1 マスの尖塔なら歩いて回り込める。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise, wave } from "./map-frame.js";
import { inSea, LAVA_Y, SEED } from "./map-fortress-sea.js";

/** 甲板。**全マップ共通で y ＝ 0**（0-1） */
export const DECK = GROUND;

/** 胸壁と側廊の屋根の高さ。**要塞じゅうでここに揃える**——揃えないと繋がらない */
export const CREST = GROUND + 6;

/**
 * **湧く所からゲートへ引いた線**が、その z で通る高さ（0-3）。
 *
 * 中軸（x ＝ 0）に何かを渡すときは、**必ずこれより上に置く。**
 * 数は検査側（`tools/pve3-map-check.mjs`）の引き方に合わせてある。
 */
export function rayY(z: number): number {
  return Math.floor(GROUND + 2.6 + ((z + 39.5) / 80) * 4.4);
}

// ================================================================ 材

/** 黒レンガの天面。**1 マスごとに引く**——同じ煉瓦が続くと板に見える（0-7） */
export function brickCap(x: number, z: number, y = 0): string {
  const r = noise(SEED + 3, x, z, y);
  if (r > 0.955) return "chiseled_nether_bricks";
  if (r > 0.87) return "red_nether_brick";
  if (r > 0.71) return "cracked_nether_bricks";
  return "nether_brick";
}

/** 崩れかけた所の天面。**玄武岩と黒石が混じり、たまに溶けている** */
export function ruinCap(x: number, z: number): string {
  const r = noise(SEED + 8, x, z);
  if (r > 0.91) return "magma";
  if (r > 0.76) return "blackstone";
  if (r > 0.58) return "basalt";
  if (r > 0.32) return "cracked_nether_bricks";
  return "nether_brick";
}

/**
 * 外まわりの敷石。
 *
 * > ### 要塞じゅうを黒レンガで塗ると、形が読めない
 * >
 * > 壁も床も同じ色だと、**遠くからは黒い塊にしか見えない。**
 * > **歩廊だけ黒石と玄武岩を混ぜて明るくする**——壁の輪郭がそこで出る。
 */
export function paveCap(x: number, z: number): string {
  const r = noise(SEED + 19, x, z);
  if (r > 0.94) return "magma";
  if (r > 0.86) return "polished_basalt";
  if (r > 0.6) return "basalt";
  if (r > 0.32) return "blackstone";
  return "nether_brick";
}

/**
 * 溶岩に面した縁。
 *
 * > ### 縁を熱くすると、要塞の輪郭が出る
 * >
 * > 黒レンガのまま溶岩に接すると、**上から見て境目が溶けて分からない。**
 * > **縁の 1 列だけマグマと黒石**にする——熱で焼けた縁として理屈も通る。
 */
export function rimCap(x: number, z: number): string {
  const r = noise(SEED + 23, x, z);
  if (r > 0.58) return "magma";
  if (r > 0.28) return "blackstone";
  return "cracked_nether_bricks";
}

// ================================================================ 積む

/** 縦 1 本。**胴と天面を別の材にする**——絵に出るのは天面だけ */
export function stack(ops: BuildOp[], x: number, z: number, y0: number, y1: number, body: string, cap: string): void {
  if (y1 > y0) ops.push(fill(x, y0, z, x, y1 - 1, z, body));
  ops.push(set(x, y1, z, cap));
}

/**
 * 基壇の 1 本。**溶岩の底から甲板まで隙間なく埋める。**
 *
 * **浮かせない**（0-5）——甲板の下は必ずここで塞ぐ。
 * 溶岩の面のすぐ上だけ黒石にして、**波打ち際の汚れ**に見せる。
 */
export function podium(ops: BuildOp[], x: number, z: number, top: number, cap: string): void {
  ops.push(fill(x, LAVA_Y - 2, z, x, top - 1, z, "nether_brick"));
  if (noise(SEED + 13, x, z) > 0.45) ops.push(fill(x, LAVA_Y - 1, z, x, LAVA_Y + 1, z, "blackstone"));
  ops.push(set(x, top, z, cap));
}

/** 橋の甲板 1 マス。**厚み 3**——下からアーチで受ける */
export function deckAt(ops: BuildOp[], x: number, z: number, cap: string): void {
  stack(ops, x, z, DECK - 2, DECK, "nether_brick", cap);
}

/** 欄干。**柵 1 段だけ**——2 段にすると登れない帯が残る（0-8） */
export function railing(ops: BuildOp[], x: number, z: number): void {
  ops.push(set(x, DECK + 1, z, "nether_brick_fence"));
}

/**
 * 1 マスの尖塔。**太くしない。**
 *
 * > ### 3 × 3 の塔は建てられない
 * >
 * > 天端が 9 マスまとまって残り、**0-8 で「登れない面」として落ちる。**
 * > **1 マスなら歩いて回り込める**ので、規則の側でも許されている。
 */
export function pinnacle(ops: BuildOp[], x: number, z: number, base: number, top: number, cap: string): void {
  stack(ops, x, z, base, top, "nether_brick", cap);
}

/** 溶岩の樋。**縁から海へ落とす**——1 マスの筋 */
export function lavaFall(ops: BuildOp[], x: number, z: number, top: number): void {
  ops.push(fill(x, LAVA_Y, z, x, top, z, "lava"));
}

// ================================================================ 壁

/** 控え壁の付いた壁 1 枚ぶんの指定 */
export interface WallSpec {
  /** 壁が伸びる向き */
  readonly along: "x" | "z";
  /** 伸びない側の、内側の面の座標 */
  readonly at: number;
  /** 外へ向かう向き（＋1 か −1） */
  readonly out: number;
  readonly from: number;
  readonly to: number;
  /** 天端の高さ */
  readonly crest: number;
  /** 厚み */
  readonly thick: number;
  /** 控え壁の間隔。**0 なら付けない**（別の壁と天端が繋がっているとき） */
  readonly step: number;
  /** 門を開ける範囲。**ここは積まない** */
  readonly gap?: readonly [number, number];
}

function at2(s: WallSpec, i: number, t: number): readonly [number, number] {
  const o = s.at + s.out * t;
  return s.along === "x" ? [i, o] : [o, i];
}

/**
 * 控え壁の付いた壁を 1 枚積む。**手順を `ops` に足す。**
 *
 * > ### 天端は「登れる」ことが要る（0-8）
 * >
 * > 6 マスの壁をただ立てると、**天端が帯のまま取り残されて検査に落ちる。**
 * > **控え壁を 1 マスずつ下げて甲板まで繋ぐ**——形は要塞らしく、規則も満たす。
 *
 * 天端は長い波で ±1 だけ揺らす。**崩れかけて見えるが、段は 1 マスを超えない。**
 */
export function wall(ops: BuildOp[], s: WallSpec): void {
  for (let i = s.from; i <= s.to; i++) {
    if (s.gap !== undefined && i >= s.gap[0] && i <= s.gap[1]) continue;
    const crest = s.crest + Math.round(wave(SEED + 21, i, s.at * 3, 13));
    for (let t = 0; t < s.thick; t++) {
      const [x, z] = at2(s, i, t);
      // **外側の天端だけ赤くする。** 壁の頂に筋が通って、上から見ても縄張りが読める
      const face = t === s.thick - 1 && noise(SEED + 27, x, z) > 0.42;
      stack(ops, x, z, DECK, crest, "nether_brick", face ? "red_nether_brick" : brickCap(x, z, crest));
    }
    // **狭間。** 飛び飛びに 1 マスだけ乗せる——並べると帯になって登れなくなる
    if (((i % 3) + 3) % 3 === 0) {
      const [x, z] = at2(s, i, s.thick - 1);
      const m = noise(SEED + 29, x, z);
      ops.push(set(x, crest + 1, z, m > 0.88 ? "glowstone" : m > 0.7 ? "chiseled_nether_bricks" : "red_nether_brick"));
    }
    // **控え壁。** 天端から甲板へ 1 マスずつ落とす。2 マス幅にして厚みを出す
    const phase = (((i - s.from) % s.step) + s.step) % s.step;
    if (s.step > 0 && phase < 2) {
      for (let k = 1; k < crest; k++) {
        const [x, z] = at2(s, i, s.thick - 1 + k);
        stack(ops, x, z, DECK, crest - k, "nether_brick", brickCap(x, z, k));
      }
    }
  }
}

// ================================================================ 迫り持ち

/** 段の付いた迫り持ち（アーチ）1 本ぶんの指定 */
export interface RibSpec {
  readonly along: "x" | "z";
  readonly at: number;
  readonly from: number;
  readonly to: number;
  /** 迫り元の天端。**壁の天端か欄干に合わせる** */
  readonly foot: number;
  /** 頂の天端 */
  readonly crown: number;
  /** ここより先が落ちている。**片側だけ崩れた迫り** */
  readonly cut?: number;
  /**
   * 頂が抜けている範囲。**通り道を跨ぐ迫りには必ず開ける。**
   *
   * > ### 塞いだ迫りは、道を断ち切る
   * >
   * > 検査（0-8）は**柱の天面だけ**を見る。迫りで 1 列ぜんぶ覆うと、
   * > **下をくぐれるのに「そこで道が切れている」と数えられる。**
   * > **要石の落ちた迫り**にすれば、崩れた見た目のまま道が通る。
   */
  readonly gap?: readonly [number, number];
}

/**
 * 段の付いた迫り持ちを 1 本渡す。**手順を `ops` に足す。**
 *
 * > ### 1 マスずつ上げる
 * >
 * > 飛ばすと天端が繋がらず、**0-8 で「登れない面」として残る。**
 * > 迫り元は壁の天端（か欄干）に置き、そこから 1 マスずつ頂へ上げる。
 *
 * **厚みは 2。** 隣り合う柱が必ず 1 マス重なるので、塊が切れない（0-5）。
 */
export function ribArch(ops: BuildOp[], s: RibSpec): void {
  const mid = (s.from + s.to) / 2;
  const half = Math.max(1, (s.to - s.from) / 2);
  for (let i = s.from; i <= s.to; i++) {
    if (s.cut !== undefined && i > s.cut) continue;
    if (s.gap !== undefined && i >= s.gap[0] && i <= s.gap[1]) continue;
    const t = Math.min(1, Math.abs(i - mid) / half);
    const ideal = s.foot + Math.round((s.crown - s.foot) * Math.sqrt(Math.max(0, 1 - t * t)));
    // **両端からの隔たりで頭を押さえる**——こうしないと迫り元が浮く
    const h = Math.min(ideal, s.foot + (i - s.from), s.foot + (s.to - i));
    const [x, z] = s.along === "x" ? [i, s.at] : [s.at, i];
    ops.push(fill(x, h - 1, z, x, h, z, "nether_brick"));
    ops.push(set(x, h, z, brickCap(x, z, h)));
  }
}

/**
 * 段の付いた円い台（稜堡・隅櫓）。**外から 1 マスずつ上がる。**
 *
 * 橋の先端や露台の隅に置く。**縁が崖にならない**ので 0-8 を満たす。
 * `base` を壁の天端にすれば、**そのまま隅櫓**になる（天端から 1 マスずつ上がる）。
 */
export function steppedPad(ops: BuildOp[], cx: number, cz: number, r: number, rise: number, base: number = DECK): void {
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > r + 0.4) continue;
      const x = cx + dx;
      const z = cz + dz;
      // **島の外へ出さない**（0-1）。台が縁に掛かると、そこだけ宙に浮く（0-5）
      if (!inSea(x, z)) continue;
      const h = base + Math.max(0, Math.min(rise, Math.round(r - d)));
      podium(ops, x, z, h, h > base ? brickCap(x, z, h) : ruinCap(x, z));
    }
  }
}
