/**
 * 氷河の裂け目の**材**——表の雪と、壁に走る地層。**純粋。**
 *
 * > ### **1 マスごとに引く**（`14-map-build.md` 0-7）
 * >
 * > 区画ごとに主役を決めて塗り分けると、**升目の大きい塗り絵**になる。
 * > **場所ごとに引く表を変える**だけにして、引くのは 1 マスずつ。
 *
 * > ### `ice` は使わない
 * >
 * > **明かりで溶ける。** 歩く面は `snow` と `calcite` を主にして、
 * > **滑る氷（`packed_ice` / `blue_ice`）は割れ目と壁に回す。**
 *
 * > ### 帯の中で明るさを揃える
 * >
 * > 1 マスごとの明暗差が広すぎると、**縞も割れ目も消えて灰色の砂嵐**になる。
 * > 表は白どうし、壁は青どうしで混ぜ、**暗い岩は縞にだけ**入れる。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise, smoothWave, speckle } from "./map-frame.js";
import { SEED, type Col } from "./map-crevasse-shape.js";

// ================================================================ 表

/**
 * 表の雪。**歩く面。**
 *
 * > ### 白の中に青を混ぜない（2026-09-06 に直した）
 * >
 * > `packed_ice` を 6 分の 1 混ぜたら、**雪原一面が青い胡麻塩**になり、
 * > **割れ目の青が埋もれて見えなくなった。**
 * > **表は白どうしだけ**にして、**青は割れ目の筋にだけ**出す。
 */
const FIRN = ["snow", "snow", "calcite", "snow", "snow", "calcite"];

/** 割れて覗く青い氷。**筋の中だけ**——長い波を 2 本重ねて、うねった線にする */
const CRACK = ["packed_ice", "blue_ice", "packed_ice", "blue_ice", "packed_ice"];

/** 岩屑（モレーン）。**裂け目の縁と、島の縁に寄せる**（0-7） */
const MORAINE = ["cobblestone", "tuff", "andesite", "stone", "cobblestone", "diorite"];

/** 落ちた岩の肌 */
const BOULDER = ["andesite", "stone", "cobbled_deepslate", "tuff", "cobblestone", "diorite"];

/** 落ちた岩の腹。**下ほど暗い** */
const BOULDER_DEEP = ["cobbled_deepslate", "deepslate", "tuff", "andesite", "cobblestone"];

/** 人が架けた板 */
const PLANK = ["spruce_planks", "dark_oak_planks", "spruce_planks", "oak_planks"];

/**
 * 雪の面。**割れ目・岩屑・雪**の 3 通りを 1 マスずつ引く。
 *
 * **割れ目は表の模様であって、掘った溝ではない。**
 * 掘ると天面が 4 マス下がり、**歩いて行けない面**として検査に落ちる（0-8）。
 */
export function snowSkin(x: number, z: number): string {
  if (Math.abs(smoothWave(SEED + 41, x, z, 15)) < 0.045) return speckle(SEED + 45, x, z, CRACK);
  if (Math.abs(smoothWave(SEED + 43, x, z, 26)) < 0.032) return speckle(SEED + 45, x, z, CRACK);
  // **岩屑の筋。** 氷河は x の向きに流れるので、**x を縮めて波を引く**と
  // 波長が x に長く伸び、**流れに沿った細長い帯**になる。
  // まだらに散らすと、雪原がただ薄汚れて見えた（2026-09-06 に直した）
  const flow = smoothWave(SEED + 47, x * 0.3, z, 20);
  if (Math.abs(flow) < 0.055 + noise(SEED + 49, x, z) * 0.04) return speckle(SEED + 48, x, z, MORAINE);
  return speckle(SEED + 46, x, z, FIRN);
}

/** 岩の詰まった所の面。**低い所ほど雪が溜まっている** */
function jamSkin(c: Col): string {
  if (noise(SEED + 63, c.x, c.z) + (GROUND - c.top) * 0.13 > 0.6) return speckle(SEED + 65, c.x, c.z, FIRN);
  return speckle(SEED + 67, c.x, c.z, BOULDER);
}

/** その 1 マスの表面 */
export function surfaceOf(c: Col): string {
  if (c.kind === "rope") return speckle(SEED + 61, c.x, c.z, PLANK);
  if (c.kind === "jam") return jamSkin(c);
  return snowSkin(c.x, c.z);
}

// ================================================================ 地層

/** 雪（フィルン）。**まだ白い** */
const S_FIRN = ["snow", "calcite", "snow", "packed_ice"];

/**
 * 締まった氷。**白から水色へ。**
 *
 * > ### 層を深く取り過ぎると、青が見えない（2026-09-06 に詰めた）
 * >
 * > 白い層を 12 マス取ったら、**上から覗いて見える範囲が全部白**で、
 * > 「割れて覗く青い氷」にならなかった。**境目を 2 / 7 / 16 / 27 へ上げた。**
 */
const S_UPPER = ["packed_ice", "calcite", "packed_ice", "snow", "packed_ice"];

/** 古い氷。**水色から青へ** */
const S_MID = ["packed_ice", "blue_ice", "packed_ice", "blue_ice", "packed_ice"];

/** 底の氷。**いちばん濃い青** */
const S_DEEP = ["blue_ice", "blue_ice", "packed_ice", "blue_ice"];

/**
 * 島の腹。**闇に溶ける**——氷が尽きて、削り取った岩だけが残っている。
 *
 * > ### 青と黒を 1 マスずつ混ぜない（2026-09-06 に直した）
 * >
 * > `blue_ice` と `deepslate` を半々で引いたら、**浮島の底が青黒い胡麻塩**になった。
 * > **明るさの幅は帯の中で狭く取る**——青は 1 つ上の帯（`S_DEEP`）に任せる。
 */
const S_ABYSS = ["deepslate", "cobbled_deepslate", "tuff", "deepslate", "cobbled_deepslate", "andesite"];

/** 縞。**氷河が削り取った岩屑が、層になって挟まっている** */
const S_STRIPE = ["tuff", "cobblestone", "cobbled_deepslate", "deepslate", "andesite"];

/**
 * 帯を 1 本塗って、**次の帯の上端**を返す。
 *
 * **1 マスずつ置くと手順が 10 倍に膨らむ。**
 */
function band(ops: BuildOp[], c: Col, yTop: number, yBottom: number, mats: readonly string[], s: number): number {
  if (yBottom > yTop) return yTop;
  ops.push(fill(c.x, yBottom, c.z, c.x, yTop, c.z, speckle(SEED + s, c.x, c.z, mats)));
  return yBottom - 1;
}

/**
 * 岩屑の縞。**壁に横に走る 3 本。**
 *
 * **境目を柱ごとにずらす**（`smoothWave`）——同じ高さで色が変わると、
 * 地層ではなく**貼り合わせた板**に見える。
 */
function stripes(ops: BuildOp[], c: Col, bot: number, top: number): void {
  for (let i = 0; i < 4; i++) {
    const y = Math.round(top - 5 - i * 8 + smoothWave(SEED + 91 + i, c.x, c.z, 17) * 2.4);
    if (y <= bot || y >= top) continue;
    ops.push(set(c.x, y, c.z, speckle(SEED + 95 + i, c.x, c.z, S_STRIPE)));
  }
}

/** 板の下。**梁を 1 本おきに通す**（浮いた板にしない。0-5） */
function ropeUnder(x: number, z: number): string {
  if (Math.abs(x % 2) === 1) return "spruce_log";
  return speckle(SEED + 105, x, z, PLANK);
}

/** 落ちた岩の腹。**上半分は岩肌、下半分は暗く** */
function jamBody(ops: BuildOp[], c: Col, bot: number, top: number): void {
  const mid = Math.round((bot + top) / 2);
  band(ops, c, top - 1, Math.max(bot, mid), BOULDER, 101);
  band(ops, c, Math.min(top - 1, mid - 1), bot, BOULDER_DEEP, 103);
}

/**
 * 柱の中身を積む。
 *
 * @param face **裂け目や島の縁に面しているか。** 面していない柱は
 *   **下から見るときしか映らない**ので、帯を減らして手順を節約する。
 */
export function bodyOps(ops: BuildOp[], c: Col, face: boolean): void {
  const top = c.top;
  const bot = Math.min(c.bottom, top - 1);
  if (c.kind === "rope") {
    ops.push(fill(c.x, bot, c.z, c.x, top - 1, c.z, ropeUnder(c.x, c.z)));
    return;
  }
  if (c.kind === "jam") {
    jamBody(ops, c, bot, top);
    return;
  }
  const w1 = Math.round(smoothWave(SEED + 71, c.x, c.z, 21) * 2.2);
  const w2 = Math.round(smoothWave(SEED + 73, c.x, c.z, 15) * 3);
  const w3 = Math.round(smoothWave(SEED + 75, c.x, c.z, 26) * 3.4);
  const w4 = Math.round(smoothWave(SEED + 77, c.x, c.z, 12) * 2.6);
  let y = top - 1;
  y = band(ops, c, y, Math.max(bot, top - 2 + w1), S_FIRN, 81);
  if (face) y = band(ops, c, y, Math.max(bot, top - 7 + w2), S_UPPER, 83);
  y = band(ops, c, y, Math.max(bot, top - 16 + w3), S_MID, 85);
  if (face) y = band(ops, c, y, Math.max(bot, top - 27 + w4), S_DEEP, 87);
  band(ops, c, y, bot, S_ABYSS, 89);
  if (face) stripes(ops, c, bot, top);
}
