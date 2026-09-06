/**
 * 戦場 12「隕石孔」——**材。純粋。**
 *
 * 決まりは `spec/14-map-build.md` 0-7（**1 マスごとに引く**）。
 *
 * ## 何を見せたいのか
 *
 * > ### 「石をただ置いただけ」にしない
 * >
 * > **漏斗の内壁に、地層の縞を輪として出す。**
 * > 高さ y で帯を切るので、**斜面では自然に同心円**になる——
 * > 上から順に **土（茶）→ 灰岩（白）→ 赤土（赤）→ 凝灰岩（灰）**、
 * > そして**底は焦げて黒い。** 縁に立つと、この 5 本の輪が一度に見える。
 *
 * > ### 明るさは帯の中で揃える（2026-09-06 に分かった）
 * >
 * > 1 マスごとの明暗差を広く取ると、**帯そのものが消えて砂嵐になる。**
 * > **帯の中は近い明るさで揃え、明るい線（条線）だけを浮かせる。**
 */

import { GROUND, noise, smoothWave } from "./map-frame.js";
import { craterA, craterD, craterR, distOf, isleRim, pitAt, SEED } from "./map-crater-form.js";

// ================================================================ 帯

/** 表土。**茶で揃える** */
const SOIL = ["coarse_dirt", "dirt", "cobblestone", "grass_path", "podzol", "packed_mud"];
/** 灰岩の層。**白で揃える。ここがいちばん目立つ輪** */
const PALE = ["diorite", "polished_diorite", "calcite", "smooth_stone", "diorite"];
/** 赤土の層。**暖かい中間色で揃える** */
const RUST = ["granite", "polished_granite", "hardened_clay", "dripstone_block", "packed_mud"];
/** 凝灰岩の層 */
const GREY = ["tuff", "chiseled_tuff", "andesite", "stone", "cobbled_deepslate"];
/** 深層岩 */
const DEEP = ["deepslate", "cobbled_deepslate", "polished_deepslate", "tuff", "chiseled_tuff"];
/** 島の根。**いちばん古くて黒い** */
const BASE = ["blackstone", "basalt", "smooth_basalt", "deepslate", "obsidian"];

/**
 * 帯の切れ目（地面からの深さ）。**上ほど薄く、下ほど厚い。**
 *
 * **漏斗の深さ 12 に、上の 3 本が収まるように取ってある**——
 * ここを深く取ると、**赤土の輪が焦げに隠れて出てこない**（2026-09-06 に数えて分かった）。
 */
const CUTS = [-2, -6, -10, -17, -30];
const BANDS: readonly (readonly string[])[] = [SOIL, PALE, RUST, GREY, DEEP, BASE];

/** 焦げた岩。**中心。暗い中で揃える** */
const CHAR = ["blackstone", "basalt", "smooth_basalt", "obsidian", "coal_block", "gilded_blackstone"];
/** 溶けて固まった玻璃 */
const GLASS = ["tinted_glass", "obsidian", "black_concrete", "tinted_glass", "sculk"];
/** めくれ上がった土。**下から出てきた黒い石が、そのまま上に乗っている** */
const THROWN = ["cobbled_deepslate", "deepslate", "blackstone", "tuff", "basalt", "polished_deepslate"];
/** 裾の地面。**中間の灰で揃える**——条線を浮かせるための下地 */
const APRON = ["andesite", "stone", "cobblestone", "cobblestone", "tuff", "stone"];
/** 放射状の条線。**明るい方へ大きく振る。ここだけが浮く** */
const RAY = ["calcite", "diorite", "polished_diorite", "white_concrete", "calcite"];
/** 隕鉄。**金気のある灰で揃える** */
export const IRON = ["deepslate_iron_ore", "iron_ore", "lodestone", "netherite_block", "basalt", "smooth_basalt"];
/** 飛んできた岩塊。**深い所の石**でできている */
export const EJECTA = ["cobbled_deepslate", "deepslate", "tuff", "blackstone", "chiseled_tuff", "basalt"];

// ================================================================ 引き方

/**
 * **1 マスごとに材を引く**（0-7）。**ただし、粒を少しだけ寄せる。**
 *
 * > ### 純粋な 1 マス乱数だと、砂嵐になる（2026-09-06 に絵で分かった）
 * >
 * > 6 種を一様に引くと、**どの帯も同じ灰色の点々**に見えて、
 * > **地層の縞も条線も消えた。**
 * >
 * > **波長 6 の緩い波を混ぜて、数マスの塊を作る。**
 * > 引くのは 1 マスごとのままなので、区画の塗り分けにはならない。
 */
export function grain(seed: number, x: number, z: number, mats: readonly string[]): string {
  const clump = (smoothWave(seed + 7, x, z, 6) + 1) / 2;
  const r = 0.5 + (noise(seed, x, z) - 0.5) * 0.9 + (clump - 0.5) * 1.1;
  const i = Math.floor(Math.max(0, Math.min(0.999, r)) * mats.length);
  return mats[Math.min(mats.length - 1, i)];
}

// ================================================================ 帯を引く

/** 帯の境目の揺らぎ。**真横一直線にしない**（地層は波打っている） */
function jitter(x: number, z: number): number {
  return Math.round(smoothWave(SEED + 61, x, z, 16) * 1.7);
}

/** その高さがどの帯か（0 が表土、5 が島の根） */
export function bandIndex(y: number, x: number, z: number): number {
  const v = y - GROUND - jitter(x, z);
  for (let i = 0; i < CUTS.length; i++) if (v >= CUTS[i]) return i;
  return BANDS.length - 1;
}

/** その帯のいちばん下の高さ。**縁の崖に縞を出すのに使う** */
export function bandFloor(i: number, x: number, z: number): number {
  return GROUND + jitter(x, z) + CUTS[i];
}

/** その帯の材 */
export function bandMat(i: number, x: number, z: number): string {
  return grain(SEED + 161 + i * 7, x, z, BANDS[i]);
}

// ================================================================ 意匠

/** 焦げの広がり（0〜1）。**中心ほど濃く、外へ向かって粒に散る** */
export function charMix(x: number, z: number): number {
  const a = craterA(x, z);
  const r = 8.5 + 2.2 * Math.sin(3 * a + 0.9) + smoothWave(SEED + 81, x, z, 15) * 2.2;
  return Math.max(0, Math.min(1, (r - craterD(x, z)) / 7 + 0.12));
}

/**
 * **中心から走る割れ目**か。
 *
 * 角度を 7 倍して正弦を取ると**放射状の 7 本**になる。
 * そこへ雑音で捻りを足し、**中心へ寄るほど太く**する（`2 / (d + 4)`）。
 */
export function crackAt(x: number, z: number): boolean {
  const d = craterD(x, z);
  if (d < 2 || d > 24) return false;
  const a = craterA(x, z) * 7 + smoothWave(SEED + 97, x, z, 11) * 2.2;
  return Math.abs(Math.sin(a)) < 0.1 + 2 / (d + 4);
}

/** 条線 1 本 */
interface Ray {
  readonly a: number;
  readonly w: number;
  readonly len: number;
}

/** 条線を引く。**等間隔に置かない**——角度も幅も長さも 1 本ずつ引き直す（0-6） */
function makeRays(): readonly Ray[] {
  const out: Ray[] = [];
  for (let i = 0; i < 13; i++) {
    out.push({
      a: (i / 13) * Math.PI * 2 + (noise(SEED + 401, i, 0) - 0.5) * 0.44,
      w: 0.045 + noise(SEED + 402, i, 1) * 0.1,
      len: 0.62 + noise(SEED + 403, i, 2) * 1.05,
    });
  }
  return out;
}

const RAYS = makeRays();

/**
 * その柱が条線にどれだけ乗っているか（0〜1）。
 *
 * **縁で 1、外へ向かって 0 に落ちる。** 呼ぶ側が乱数と比べるので、
 * **端では点々に散って消える**——境目が線にならない。
 */
export function rayMix(x: number, z: number): number {
  const d = craterD(x, z);
  const R = craterR(x, z);
  if (d < R) return 0;
  const span = Math.max(12, isleRim(x, z) - R + 8);
  const a = craterA(x, z);
  let best = 0;
  for (const r of RAYS) {
    // **必ず 0〜π に畳んでから比べる**（2026-09-06 に絵で分かった）
    //
    // 角度を畳まずに引き算すると **`dd` が負**になり、
    // `(dd / w) ** 1.6` が **NaN** を返す。`Math.max` は NaN に汚染されるので、
    // **条線がまるごと消えていた**（裾が一面の灰色だった原因）。
    let dd = Math.abs(a - r.a) % (Math.PI * 2);
    if (dd > Math.PI) dd = Math.PI * 2 - dd;
    if (dd > r.w) continue;
    const t = (d - R) / (span * r.len);
    if (t > 1) continue;
    best = Math.max(best, (1 - (dd / r.w) ** 1.6) * (1 - Math.max(0, t)) ** 1.2);
  }
  return best;
}

/**
 * その柱の天面の材。
 *
 * **中心から外へ、順に決まる**——
 * 焦げ → 内壁の地層 → 縁のめくれ → 放射状の条線 → 裾。
 *
 * > ### 高さで「めくれ」を見分けてはいけない（2026-09-06 に絵で分かった）
 * >
 * > 裾のうねりでも天面は 1 マス上がるので、
 * > **「y ＞ 0 ならめくれ」にすると、裾じゅうに黒い斑が散った。**
 * > **縁からの隔たりで見分ける。**
 */
export function surfaceAt(x: number, z: number, top: number): string {
  const d = craterD(x, z);
  const R = craterR(x, z);
  // ---- 中心。**砕けた岩と焦げ、溶けて固まった玻璃**
  const ch = charMix(x, z);
  if (ch > 0 && noise(SEED + 111, x, z) < ch) {
    if (crackAt(x, z) && noise(SEED + 113, x, z) > 0.3) return grain(SEED + 115, x, z, GLASS);
    // **まだ冷めていない所**。明かりが要る——底が真っ暗だと何も見えない
    if (noise(SEED + 119, x, z) > 0.955) return "crying_obsidian";
    return grain(SEED + 117, x, z, CHAR);
  }
  // ---- 漏斗の内壁。**地層をそのまま天面に出す**——輪になって見える
  if (d < R) return bandMat(bandIndex(top, x, z), x, z);
  // ---- 二次の小孔。**底は黒い石、縁は掻き出された明るい土**
  //
  // **深い小孔だけが黒い底を持つ。** 浅いものは明るい縁だけで終わる——
  // **同じ模様を並べない**（0-6）。
  const pit = pitAt(x, z);
  if (pit > 1) return grain(SEED + 141, x, z, THROWN);
  if (pit > 0.15 && noise(SEED + 145, x, z) < 0.8 - pit * 0.35) return grain(SEED + 143, x, z, RAY);
  // ---- 放射状に飛び散った条線。**縁のめくれより先に見る**
  //
  // 条線は**縁から噴き出したもの**なので、めくれの上も走っていて構わない。
  // **芯は塗り潰し、外側だけ点々に散らす**——さもないと灰と白が混ざって消える。
  const ray = rayMix(x, z);
  if (ray > 0.38 || (ray > 0 && noise(SEED + 131, x, z) < ray * 1.7)) return grain(SEED + 133, x, z, RAY);
  // ---- 縁の外へめくれ上がった土。**外へ向かって解けていく**
  const out = (d - R) / 5;
  if (out < 1 && noise(SEED + 121, x, z) < 1 - out * 0.9) return grain(SEED + 123, x, z, THROWN);
  return grain(SEED + 151, x, z, APRON);
}

/** 裾の地面の材。**湧く所を均すときに使う** */
export function apronMat(x: number, z: number): string {
  return grain(SEED + 151, x, z, APRON);
}
