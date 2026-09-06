/**
 * 3. 溶岩の島——**どこが陸で、そこは何の高さか。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 3 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * > ### 形は 1 か所にまとめる
 * >
 * > **橋も飾りも、ここの `landAt` を読んで積む。**
 * > ここからは橋・飾りを読まない——**読み合うと輪になり、
 * > 読み込みの途中で定数が空のまま使われる**（`map-basin-const.ts` に同じ失敗の記録がある）。
 */

import { GROUND, speckle, wave } from "./map-frame.js";

/** 種。**変えれば別の島並びになる** */
export const SEED = 2137;

/**
 * 溶岩の海の広さ。**揺らぎを足しても 48.5 で止まる**ので、±50 を越えない（0-1）。
 *
 * **海の外は奈落**——これで「歩いて外へ出られない」が成り立つ（0-4）。
 * **壁で閉じない**のは、壁の天面が「登れない面」として丸ごと残るため（0-8）。
 */
export const SEA_R = 46;
const SEA_WOBBLE = 2;

/** 陸の外側。**海のほうが必ず広い**——島が溶岩の外へ飛び出さない */
const LAND_R = SEA_R - 2;

/**
 * 溶岩の面。**地面より 1 だけ低い。**
 *
 * > ### 2 マス下げてはいけない
 * >
 * > **島から海へ 1 マスで降りられなくなると、海の面が丸ごと
 * > 「歩いて行けない面」として残る**（0-8）。**落ちれば死ぬ**のは同じ。
 */
export const SEA_TOP = GROUND - 1;

/** 見通しの帯の半幅（0-3）。**ここは平ら。高さのあるものを置かない** */
export const LANE = 7;

/** 1 つの島 */
export interface Isle {
  /** 名前。**絵を見て直すときの目印** */
  readonly name: string;
  readonly cx: number;
  readonly cz: number;
  readonly rx: number;
  readonly rz: number;
  /** 中心の盛り上がり。**縁では 0 に戻る** */
  readonly rise: number;
  readonly seed: number;
  /**
   * 地表。**1 マスごとに引く**（0-7）。
   *
   * **同じ材を 2 回書くと、その材に寄る**——島ごとに性格を変えるのに使う。
   */
  readonly mats: readonly string[];
  /** 門の島か。**奥を細い舌にして、裏へ回れないようにする**（0-3） */
  readonly gate?: boolean;
}

/**
 * 島。**大きさも向きも間隔も散らす**（0-6）。
 *
 * ```
 *        門の島（奥の岸・人が敷いた黒石）   z ＝ +33
 *   黒曜石の林          吹き出し口          z ＝ +15
 *        中央の盾（いちばん広い）            z ＝  −6
 *   西の岩板            東の丘              z ＝ −18
 *     南西の岩        南東の岩              z ＝ −24
 *        湧く島（手前の岸）                  z ＝ −35
 * ```
 *
 * **手前と奥の島は、外周の冷えた縁と地続き**——
 * **「岸に降り、海を渡り、向こう岸の門へ着く」**という読みにする。
 * ```
 */
export const ISLES: readonly Isle[] = [
  {
    name: "湧く島",
    cx: 0,
    cz: -35,
    rx: 14,
    rz: 10,
    rise: 2,
    seed: SEED + 10,
    mats: ["blackstone", "basalt", "smooth_basalt", "deepslate", "polished_basalt", "blackstone"],
  },
  {
    name: "中央の盾",
    cx: 0,
    cz: -6,
    rx: 20,
    rz: 13,
    rise: 4,
    seed: SEED + 20,
    mats: ["basalt", "blackstone", "smooth_basalt", "obsidian", "magma", "basalt"],
  },
  {
    name: "西の岩板",
    cx: -25,
    cz: -18,
    rx: 10,
    rz: 8,
    rise: 3,
    seed: SEED + 30,
    mats: ["deepslate", "cobbled_deepslate", "polished_deepslate", "blackstone", "tuff"],
  },
  {
    name: "東の丘",
    cx: 25,
    cz: -17,
    rx: 10,
    rz: 8,
    rise: 4,
    seed: SEED + 40,
    mats: ["netherrack", "crimson_nylium", "magma", "blackstone", "netherrack", "soul_sand"],
  },
  {
    name: "黒曜石の林",
    cx: -25,
    cz: 14,
    rx: 11,
    rz: 9,
    rise: 3,
    seed: SEED + 50,
    mats: ["obsidian", "blackstone", "black_concrete", "smooth_basalt", "deepslate"],
  },
  {
    name: "吹き出し口",
    cx: 26,
    cz: 17,
    rx: 10,
    rz: 9,
    rise: 3,
    seed: SEED + 60,
    mats: ["magma", "netherrack", "blackstone", "basalt", "gilded_blackstone", "magma"],
  },
  {
    name: "南西の岩",
    cx: -20,
    cz: -24,
    rx: 8,
    rz: 7,
    rise: 2,
    seed: SEED + 80,
    mats: ["blackstone", "basalt", "deepslate", "obsidian", "smooth_basalt", "blackstone"],
  },
  {
    name: "南東の岩",
    cx: 20,
    cz: -24,
    rx: 7,
    rz: 6,
    rise: 2,
    seed: SEED + 90,
    mats: ["netherrack", "blackstone", "magma", "basalt", "crimson_nylium"],
  },
  {
    name: "門の島",
    cx: 0,
    cz: 33,
    rx: 14,
    rz: 11,
    rise: 0,
    seed: SEED + 70,
    gate: true,
    mats: [
      "polished_blackstone_bricks",
      "polished_blackstone",
      "cracked_polished_blackstone_bricks",
      "chiseled_polished_blackstone",
      "blackstone",
      "polished_blackstone_bricks",
    ],
  },
];

/** 見通しの帯の中か（0-3） */
export function inLane(x: number): boolean {
  return Math.abs(x) <= LANE;
}

/** 帯の中は平ら（0-3）。**5 マスかけて外の起伏へ戻す**——急に立てると段差 2 になる（0-8） */
export function laneFactor(x: number): number {
  return Math.min(1, Math.max(0, (Math.abs(x) - LANE) / 5));
}

/**
 * 門の島の、その z における半幅。
 *
 * > ### 奥へ行くほど細くする
 * >
 * > **門の裏へ回り込めるポータルは、置く意味がない**（0-3）。
 * > **門の面（z ＝ 39）では |x| ≤ 6**——その外は溶岩なので、回り込めない。
 * > **検査が「登れなくてよい」と認める範囲**（|x| ≤ 6・z ≥ 39）にも収まる。
 */
export function gateWidth(z: number): number {
  if (z <= 31) return 99;
  return Math.max(6, 13 - (z - 31));
}

/** 島の中心からの隔たり（1 で縁）。**真楕円にしない**——縁を揺らす（0-6） */
export function isleT(isle: Isle, x: number, z: number): number {
  const dx = (x - isle.cx) / isle.rx;
  const dz = (z - isle.cz) / isle.rz;
  const wob = wave(isle.seed + 7, x, z, 11) * 0.11 + wave(isle.seed + 8, x, z, 5) * 0.05;
  return Math.hypot(dx, dz) + wob;
}

/**
 * その柱の天面。
 *
 * **縁では GROUND に戻す**——海（GROUND − 1）との段差を 1 に保つ（0-8）。
 * **揺らぎは波長を長く、振幅を小さく**取って、傾きを 1 マス以内に収める。
 */
export function isleTop(isle: Isle, x: number, z: number, t: number): number {
  const dome = (1 - t) ** 1.4 * isle.rise;
  const edge = Math.min(1, (1 - t) * 3);
  const relief = wave(isle.seed + 3, x, z, 15) * 1.3 * edge;
  return GROUND + Math.round((dome + relief) * laneFactor(x));
}

/** そこの陸 */
export interface Land {
  readonly isle: Isle;
  readonly top: number;
  /** 島の中心からの隔たり（0 が中心、1 が縁） */
  readonly t: number;
}

/** そこは陸か。**陸なら、どの島の何の高さか**を返す */
export function landAt(x: number, z: number): Land | undefined {
  if (Math.hypot(x, z) > LAND_R) return undefined;
  let best: Land | undefined;
  for (const isle of ISLES) {
    if (isle.gate === true && Math.abs(x) > gateWidth(z)) continue;
    const t = isleT(isle, x, z);
    if (t > 1) continue;
    const top = isleTop(isle, x, z, t);
    if (best === undefined || top > best.top) best = { isle, top, t };
  }
  return best;
}

/**
 * その向きの、海の縁までの隔たり。**角度だけで決める。**
 *
 * > ### 場所で揺らすと、縁に離れ小島ができる
 * >
 * > `hypot(x, z) ≤ R(x, z)` の R が**半径の向きにも動く**と、
 * > **縁に 1〜2 マスの浮き島が残った**（0-5 の検査に落ちた）。
 * > **角度だけの R にすれば、どのマスからも中心へ向かって必ず繋がる。**
 */
function seaEdge(x: number, z: number): number {
  const a = Math.atan2(z, x);
  return SEA_R + wave(SEED + 5, Math.cos(a) * 16, Math.sin(a) * 16, 7) * SEA_WOBBLE;
}

/** そこは溶岩の海か */
export function seaAt(x: number, z: number): boolean {
  return Math.hypot(x, z) <= seaEdge(x, z);
}

/**
 * 海の縁の、**冷えた殻**。0 なら溶岩、1 に近いほど外側。
 *
 * > ### 縁まで溶岩にすると、ただの橙色の円盤になる
 * >
 * > **溶岩は、何にも接していない縁から先に冷える。**
 * > **外周を黒い殻にする**と、赤い海の輪郭が締まり、
 * > **奈落へ落ちる縁**もはっきり見える。**幅は場所ごとに変える**（0-6）。
 */
export function rimAt(x: number, z: number): number {
  const a = Math.atan2(z, x);
  const w = 2.5 + wave(SEED + 6, Math.cos(a) * 14, Math.sin(a) * 14, 5) * 1.5;
  const into = Math.hypot(x, z) - (seaEdge(x, z) - w);
  return into <= 0 ? 0 : Math.min(1, into / w);
}

/** 島の裏。**中ほどは厚く、縁で薄い**——下から見て 1 つの塊に見えるように */
export function landBottom(t: number): number {
  return GROUND - 7 - Math.round((1 - t) ** 1.4 * 20);
}

/** 海の底。**外へ行くほど薄い** */
export function seaBottom(x: number, z: number): number {
  const d = Math.min(1, Math.hypot(x, z) / SEA_R);
  return SEA_TOP - 4 - Math.round((1 - d) ** 1.3 * 15);
}

/** 地表の材。**1 マスごとに引く**（0-7） */
export function landSurface(land: Land, x: number, z: number): string {
  return speckle(land.isle.seed + 11, x, z, land.isle.mats);
}
