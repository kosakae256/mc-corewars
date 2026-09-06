/**
 * 戦場 12「隕石孔」——**地形の形。純粋。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 12 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * > ### 数と形だけをここに置く（**輪を切るため**）
 * >
 * > 材（`map-crater-mat.ts`）と造作（`map-crater-decor.ts`）が
 * > **互いを読み合うと、読み込みの途中で定数が空になる**（`map-basin-const.ts` の顛末）。
 * > **ここは誰も読まない口**にしておく。
 *
 * ## この島の形
 *
 * ```
 *        放出物の裾        縁のめくれ        漏斗          底
 *   ─────＼＿             ／‾＼            ＼          ／
 *   奈落    ＼＿＿＿＿＿＿／     ＼＿＿＿＿＿＿＼＿＿＿／   y ＝ −15
 *                                                  隕鉄
 * ```
 *
 * **中央が低い。** だから**縁に立つと全体が見下ろせる。**
 */

import { BOTTOM, GROUND, noise, smoothWave } from "./map-frame.js";

/** 種。**変えれば別の孔になる** */
export const SEED = 3370;

/** 漏斗の底。**中央がいちばん低い**（`02-map.md` 12 番） */
export const FLOOR_Y = GROUND - 12;

/** 底の平らな所の半径。**隕鉄が座る場所** */
export const FLOOR_R = 5;

/**
 * **孔の中心。島の中心ではない。**
 *
 * > ### 真ん中に真円の孔を開けると、的にしか見えない（2026-09-06 に絵で分かった）
 * >
 * > **斜めに入ったものとして、少しずらし、楕円に潰す。**
 * > **島の中心（0, 0）とは別**なので、裾の広さが向きによって変わる。
 */
const CX = -3;
const CZ = -2;

/** 中心からの隔たり */
export function distOf(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** 中心から見た角度（ラジアン）。**0 が ＋x** */
export function angleOf(x: number, z: number): number {
  return Math.atan2(z, x);
}

/**
 * 島の縁までの隔たり。
 *
 * > ### **座標では揺らさない。角度だけで揺らす**（2026-09-06 に分かった）
 * >
 * > 座標の雑音を縁に足すと、**縁の外側に小さな島が切り離されて残る。**
 * > 角度だけなら、**中心から見て縁は必ず 1 本**になる。
 *
 * **湧く所の側（−z）だけ広げる**——そうしないと足場の岬が
 * **島から棒のように突き出して見える**（2026-09-06 に絵で分かった）。
 *
 * **上限 45.5。** ±50 の外へは 1 マスも出さない（0-1）し、
 * **d ＝ 47 まで行けば必ず奈落**になる（0-4 の検査が通る）。
 */
export function isleRim(x: number, z: number): number {
  const a = angleOf(x, z);
  const wob = 2.4 * Math.sin(2 * a + 0.6) + 1.6 * Math.sin(3 * a + 2.2) + 0.9 * Math.sin(5 * a + 4.1);
  return Math.min(45.5, 42 + wob + 3.5 * Math.max(0, -Math.sin(a)) ** 1.4);
}

/**
 * **ゲートの裏を断つ線**（0-3）。
 *
 * **浮島なので、裏は塞がずに奈落にする。** ここから奥に島は無い。
 * **x の関数**にしてあるので、柱ごとに z の帯が 1 本になり、**切り離された塊ができない。**
 */
export function cutZ(x: number): number {
  return 40.5 + Math.round(smoothWave(SEED + 71, x, 0, 15) * 1.4);
}

/** 角の取れた四角（**超楕円**）。**真円を並べない**ための道具（0-6） */
function boxy(dx: number, dz: number, hx: number, hz: number): number {
  return (Math.abs(dx) / hx) ** 4 + (Math.abs(dz) / hz) ** 4;
}

/**
 * そこに島が有るか。
 *
 * **湧く所とゲートの足元は、地形の気分に任せない**（0-2）——
 * **形が揺れても必ず陸になる**よう、四角で押さえてある。
 */
export function isLand(x: number, z: number): boolean {
  // ---- ゲートの裏。**|x| ≤ 7 は z ＝ 40 まで残す**（ゲートの足元が要る）
  if (Math.abs(x) > 7 ? z > cutZ(x) : z > 40) return false;
  // ---- 湧く所の岬。**足場 9 × 9 を必ず含む**（0-2）
  if (Math.abs(x) <= 5 && z >= -45 && z <= -34) return true;
  if (boxy(x, z + 34, 12, 11.5) <= 1) return true;
  // ---- ゲートの舌
  if (Math.abs(x) <= 7 && z >= 28) return true;
  if (boxy(x, z - 32, 10, 9) <= 1) return true;
  return distOf(x, z) <= isleRim(x, z);
}

/**
 * **孔の中心から見た隔たり。**
 *
 * **x を伸ばし z を詰める**ので、真円ではなく**斜めに潰れた楕円**になる。
 * 焦げも条線も割れ目も、**すべてこの座標系で測る**——中心が 1 つに揃う。
 */
export function craterD(x: number, z: number): number {
  return Math.hypot((x - CX) / 1.16, (z - CZ) / 0.9);
}

/** 孔の中心から見た角度 */
export function craterA(x: number, z: number): number {
  return Math.atan2(z - CZ, x - CX);
}

/**
 * 漏斗の縁までの隔たり（`craterD` で測る）。
 *
 * **角度で 2 つ・3 つの波を重ね**、そこへ**波長の長い雑音**を少しだけ足す。
 * **真円の漏斗にしない**ため（0-6）。
 */
export function craterR(x: number, z: number): number {
  const a = craterA(x, z);
  return 25 + 1.8 * Math.sin(2 * a + 1.4) + 1.1 * Math.sin(3 * a + 5.0) + smoothWave(SEED + 11, x, z, 27) * 1.2;
}

/**
 * **見通しの帯を守る係数**（0-3）。**|x| ≤ 6 では 0。**
 *
 * > ### 縁のめくれを、帯の中に作らない
 * >
 * > 湧く所の目の高さからゲートへ引いた線は、**x ＝ 0 の柱**しか通らない。
 * > **そこに高さ 1 でも積むと、線が遮られて検査に落ちる。**
 * > **6 マスかけて 0 → 1 に戻す**ので、段差も 1 マスに収まる。
 */
export function laneFade(x: number): number {
  return Math.max(0, Math.min(1, (Math.abs(x) - 6) / 6));
}

/** 二次の小孔。**飛び散った破片が開けた、浅い凹み** */
interface Pit {
  readonly cx: number;
  readonly cz: number;
  readonly r: number;
  readonly d: number;
}

/**
 * 小孔を撒く。**等間隔に置かない**（0-6）——
 * 角度も隔たりも大きさも、**1 つずつ引き直す。**
 */
function makePits(): readonly Pit[] {
  const out: Pit[] = [];
  for (let i = 0; i < 34; i++) {
    const a = noise(SEED + 301, i, 0) * Math.PI * 2;
    const rr = 26 + noise(SEED + 302, i, 1) * 16;
    const cx = Math.round(Math.cos(a) * rr);
    const cz = Math.round(Math.sin(a) * rr);
    // **見通しの帯と、湧く所・ゲートの足元は掘らない**
    if (Math.abs(cx) <= 10) continue;
    if (Math.abs(cx) <= 16 && (cz < -26 || cz > 24)) continue;
    out.push({
      cx,
      cz,
      r: 2 + Math.floor(noise(SEED + 303, i, 2) * 7),
      d: 1 + Math.floor(noise(SEED + 304, i, 3) * 3),
    });
  }
  return out;
}

const PITS = makePits();

/**
 * その柱が、小孔でどれだけ下がるか。
 *
 * **鐘形にする**——縁でも中心でも傾きが 0 になるので、
 * **周りと必ず 1 マスで繋がる**（0-8）。
 */
export function pitAt(x: number, z: number): number {
  let deep = 0;
  for (const p of PITS) {
    const dd = Math.hypot(x - p.cx, z - p.cz);
    if (dd >= p.r) continue;
    deep = Math.max(deep, p.d * 0.5 * (1 + Math.cos((Math.PI * dd) / p.r)));
  }
  return deep;
}

/**
 * その柱の地面の高さ。**造作を載せる前の、素の地形。**
 *
 * > ### 漏斗と裾を、**1 つの式**で作る
 * >
 * > 地形と造作を別々に積むと、**足し算で 2 マスの段差が出る**（0-8）。
 * > **縁の高さ（`rimH`）を内と外で共有する**ので、境目で必ず繋がる。
 *
 * **傾きは、ほぼ 1 マスに収まる。** 深さ 12 を半径 20 で落とすので 0.6、
 * 楕円と揺らぎを足しても 1 の前後。**残った端数は `smooth` が埋める。**
 */
export function groundAt(x: number, z: number): number {
  const d = craterD(x, z);
  const a = craterA(x, z);
  const R = craterR(x, z);
  const fade = laneFade(x);
  // **縁のめくれ。** 内と外で同じ値を使う——ここが繋ぎ目になる
  const rimH = (2.3 + 0.9 * Math.sin(3 * a + 1.1)) * fade;
  const roll = smoothWave(SEED + 31, x, z, 23) * 1.15 * fade;

  if (d >= R) {
    // ---- 外。**放出物の裾**。縁からゆっくり平らへ戻る
    const t = Math.min(1, (d - R) / 11);
    return GROUND + Math.round(rimH * (1 - t) ** 1.5 + roll - pitAt(x, z));
  }

  // ---- 内。**漏斗**。t ＝ 0 が縁、t ＝ 1 が底
  const t = Math.min(1, (R - d) / Math.max(1, R - FLOOR_R));
  // **壁のうねり。縁と底では 0 に戻す**——繋ぎ目を作らず、底は平らに保つ
  const wall = smoothWave(SEED + 41, x, z, 18) * 1.05 * (2.6 * t * (1 - t));
  return GROUND + Math.round((rimH + roll) * (1 - t) + (FLOOR_Y - GROUND) * t + wall);
}

/**
 * その柱の底。**島の裏側の形。**
 *
 * > ### 打たれた真下は、**下へ膨らむ**
 * >
 * > 漏斗の底が薄いと、**下から見たときに孔が透けて見えて安っぽい。**
 * > 中心の下だけ厚くして、**雫のように垂れ下がらせる。**
 */
export function baseOf(x: number, z: number): number {
  const d = distOf(x, z);
  const u = Math.min(1, d / Math.max(6, isleRim(x, z)));
  const bulge = 8 * Math.exp(-((d / 16) ** 2));
  const t = 6 + 25 * (1 - u) ** 1.15 + bulge + smoothWave(SEED + 51, x, z, 14) * 3;
  return Math.max(BOTTOM + 1, groundAt(x, z) - Math.round(t));
}
