/**
 * 18. 雲海——**雲 1 枚の形と材。純粋。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5-0-2。
 * 並べ方（どこに何枚）は `map-cloudsea.ts`。**ここは 1 枚の作り方だけ。**
 *
 * > ### 円盤を置かない
 * >
 * > **雲しか無い世界なので、意匠は「形」でしか出せない。**
 * >
 * > | | |
 * > | --- | --- |
 * > | **輪郭** | **膨らみ**（`Puff`）を重ねて崩し、**短い波**でさらに縁を毛羽立たせる |
 * > | **伸び** | `aspect` と `turn` で**楕円にして倒す**——丸い塊を並べない（0-6） |
 * > | **厚み** | 中心で `belly` 段、**縁で 1 段**まで落として溶かす |
 * > | **裾** | 縁から下へ霞を垂らす。**下と横から見たときにだけ効く** |
 *
 * > ### 半径 `r` からは、絶対に出ない
 * >
 * > 膨らみは **`0.86 r` までに詰め**、揺らぎは最大 **＋16 %**——
 * > 掛けても `0.998 r`。**だから「中心の隔たり −（`r` の和）」が最小の隙間になる。**
 * > `map-cloudsea.ts` はこれを頼りに、**どの 2 枚も 6 マス以上**空けている。
 *
 * > ### 上面は「1 回だけ丸める」
 * >
 * > 反りと起伏を**別々に丸めて足すと、境が重なった所で 2 マスの段**が出る。
 * > **なめらかな値のまま足して、最後に 1 回 `Math.round`** すれば、
 * > 隣との差は必ず 1 マス以内になる（`14-map-build.md` 0-8）。
 * >
 * > **反りは「中心からの実距離」で引く**——`depthAt` の値で引くと、
 * > **小さな膨らみの上で傾きが跳ね上がる**（`d` の勾配が膨らみの半径に反比例するため）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { BOTTOM, GROUND, noise, smoothWave } from "./map-frame.js";
import { bodyOf, deckOf, shadeOf, vaporOf } from "./map-cloudsea-mat.js";

/** 種。**変えれば雲の輪郭ごと変わる** */
export const SEED = 4507;

/** 膨らみ 1 つ。**雲の中心からの隔たりで置く**（倒す前の向きで測る） */
export interface Puff {
  readonly ox: number;
  readonly oz: number;
  readonly pr: number;
}

/** 雲 1 枚 */
export interface Cloud {
  readonly id: string;
  readonly cx: number;
  readonly cz: number;
  /** 天面の基準の高さ。**湧く所とゲートの雲だけは 0 で固定**（0-1） */
  readonly top: number;
  /** 外に出さない半径。**膨らみも揺らぎも、必ずこの中に収まる**（冒頭の注記） */
  readonly r: number;
  /** 潰し具合（0.5〜1）。**1 が丸、小さいほど細長い** */
  readonly aspect: number;
  /** 倒す向き（ラジアン）。**細長い雲を、ばらばらの向きに寝かせる**（0-6） */
  readonly turn: number;
  /** 腹の深さ。**中心でいちばん厚く、縁で 1 段になる** */
  readonly belly: number;
  /** 膨らみの数。**枚ごとに変える**（0-6） */
  readonly lobes: number;
  /** 輪郭の荒れ（0〜0.16） */
  readonly wob: number;
  /** 荒れの波長。**短いほど毛羽立つ** */
  readonly frill: number;
  /** 中央の反り。**上面が何マス盛り上がるか** */
  readonly dome: number;
  /** 上面の起伏の振れ幅。**1 マス前後に抑える**（0-8） */
  readonly relief: number;
  /** 起伏の波長。**長いほど、ゆったりうねる** */
  readonly grain: number;
  /** 裾の垂れやすさ（0〜1）。**縁から下へ落ちる霞** */
  readonly wisp: number;
  /** 抜けている所。**雲の切れ目**（無くてよい） */
  readonly holes?: readonly Puff[];
  /**
   * **必ず覆う膨らみ。**
   *
   * > ### 足場を乱数任せにしない（`14-map-build.md` 0-2）
   * >
   * > 膨らみの角度は種で散らしてあるので、**塊と塊の谷間**ができる。
   * > **ゲートの雲では、その谷間がちょうどゲートの下に来て、床が抜けた**
   * > （2026-09-06 に断面を数えて分かった。**中に立っていても気づけない**）。
   * > **湧く所とゲートの下だけは、膨らみを名指しで置いて塞ぐ。**
   *
   * **`|中心からの隔たり| + pr ≤ 0.86 r`** を守ること——**半径 `r` の外に出さない。**
   */
  readonly anchor?: readonly Puff[];
  readonly seed: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 膨らみを並べる。
 *
 * **等間隔・等半径に置かない**（0-6）——角度も隔たりも大きさも種で散らす。
 * **端が `0.86 r` を超えないように詰める**ので、揺らぎを掛けても `r` の中に収まる。
 */
export function puffsOf(c: Cloud): readonly Puff[] {
  // **芯は小さく、膨らみは外へ大きく**——芯を太くすると、union が円に戻ってしまう
  const out: Puff[] = [{ ox: 0, oz: 0, pr: c.r * 0.4 }];
  for (let i = 0; i < c.lobes; i++) {
    const a = ((i + noise(c.seed, i, 1) * 0.85) / c.lobes) * Math.PI * 2;
    const d = c.r * (0.3 + noise(c.seed, i, 2) * 0.26);
    const pr = c.r * (0.28 + noise(c.seed, i, 3) * 0.18);
    out.push({ ox: Math.cos(a) * d, oz: Math.sin(a) * d, pr: Math.min(pr, c.r * 0.86 - d) });
  }
  if (c.anchor !== undefined) out.push(...c.anchor);
  return out;
}

/** 揺らぎの倍率。**雲ごとに 1 つ**——膨らみ別に引くと、輪郭が繋がらない */
function wobbleAt(c: Cloud, x: number, z: number): number {
  return 1 + smoothWave(SEED + c.seed, x, z, c.frill) * c.wob;
}

/** 倒した向きに引き戻して、潰す。**細長い雲を、好きな向きに寝かせるため** */
function localOf(c: Cloud, x: number, z: number): { readonly u: number; readonly v: number } {
  const dx = x - c.cx;
  const dz = z - c.cz;
  const cs = Math.cos(-c.turn);
  const sn = Math.sin(-c.turn);
  return { u: dx * cs - dz * sn, v: (dx * sn + dz * cs) / c.aspect };
}

/**
 * その柱の「雲の中の深さ」。**0 以下なら雲の外、1 が中心。**
 *
 * 膨らみの**いちばん深いもの**を採るので、重なりが 1 つのもこもこした塊になる。
 */
export function depthAt(c: Cloud, puffs: readonly Puff[], x: number, z: number): number {
  const { u, v } = localOf(c, x, z);
  const w = wobbleAt(c, x, z);
  let best = -1;
  for (const p of puffs) {
    const r = p.pr * w;
    if (r <= 0) continue;
    const d = 1 - Math.hypot(u - p.ox, v - p.oz) / r;
    if (d > best) best = d;
  }
  if (c.holes !== undefined) {
    for (const h of c.holes) {
      // **切れ目は雲の外**——輪郭と同じ揺らぎで抜くので、穴の縁ももこもこする
      if (Math.hypot(u - h.ox, v - h.oz) < h.pr * w) return -1;
    }
  }
  return best;
}

/**
 * 上面の高さ。**反りと起伏を足してから、1 回だけ丸める**（冒頭の注記）。
 *
 * **中央の帯で盛り上げない**——湧く所からゲートが見えなくなる（0-3）。
 * **手前は 7 マス幅、ゲートの周り（z ≥ 34）は 5 マス幅**まで平らに保つ——
 * 見通しの検査はゲートの手前 6 マスで打ち切るので、**そこから先は起伏を許す。**
 * **いきなり平らにすると段が出る**ので、6 マスかけて戻す。
 */
export function topAt(c: Cloud, x: number, z: number): number {
  const rad = Math.hypot(x - c.cx, z - c.cz);
  let h = c.dome * clamp01(1 - rad / (c.r * 0.95));
  h += ((smoothWave(SEED + c.seed + 31, x, z, c.grain) + 1) / 2) * c.relief;
  if (c.top >= GROUND) h *= clamp01((Math.abs(x) - (z <= 33 ? 7 : 5)) / 6);
  return c.top + Math.round(h);
}

/**
 * 厚み。**縁は 1 段、中心は `belly` 段。**
 *
 * > ### 平方根で立ち上げると、太鼓になる（2026-09-06 に絵で分かった）
 * >
 * > `sqrt` だと**縁の 2〜3 マスで厚みが半分まで立ち上がる**ので、
 * > 側面が垂直な壁になり、**上下が平らな太鼓**に見えた。
 * > **S 字（`t²(3−2t)`）に変える**と、**薄い縁 → 中央だけ膨らむ**——
 * > 下から見上げたときに、雲の腹らしい丸みが出る。
 *
 * 1 マスごとの粒を足して、**腹の底を凸凹にする**（平らな底は雲に見えない）。
 */
export function thickAt(c: Cloud, d: number, x: number, z: number): number {
  const t = clamp01(d);
  const grain = t > 0.25 && noise(c.seed + 21, x, z) > 0.62 ? 1 : 0;
  return 1 + Math.round(t * t * (3 - 2 * t) * c.belly) + grain;
}

/** 柱 1 本を積む。**天面・胴・腹・底の 4 段に分けて材を引く** */
function pillar(ops: BuildOp[], c: Cloud, x: number, z: number, top: number, th: number, d: number): void {
  const bot = top - th + 1;
  // **起伏を作っているのと同じ波**で材を分ける——高さと影がずれない
  const low = smoothWave(SEED + c.seed + 31, x, z, c.grain) < -0.15;
  ops.push(set(x, top, z, deckOf(c.seed, x, z, d < 0.22, low)));
  if (th === 1) return;
  ops.push(set(x, bot, z, vaporOf(c.seed + 4, x, z)));
  if (th === 2) return;
  // **胴と腹の境目を、柱ごとにずらす**——同じ高さで切ると横縞になる
  const mid = bot + 1 + Math.floor((th - 2) * (0.45 + noise(c.seed + 33, x, z) * 0.25));
  if (mid <= top - 1) ops.push(fill(x, mid, z, x, top - 1, z, bodyOf(c.seed, x, z)));
  if (bot + 1 <= mid - 1) ops.push(fill(x, bot + 1, z, x, mid - 1, z, shadeOf(c.seed, x, z)));
}

/**
 * 裾。**縁から下へ落ちる霞。** 下から見上げたときと、横から見たときにだけ効く。
 *
 * > ### 1 マスごとに引くと、机の脚になる（2026-09-06 に絵で分かった）
 * >
 * > 独立に引くと**細い柱がばらばらに垂れて、脚が生えたよう**に見えた。
 * > **短い波で「塊」を作ってから**粒を足すと、**隣どうしが同じ長さに寄る**——
 * > ひとつながりの**簾**になって、雲から霞が落ちているように見える。
 */
function tail(ops: BuildOp[], c: Cloud, x: number, z: number, bot: number, d: number): void {
  if (c.wisp <= 0 || d > 0.8) return;
  // **波長を長めに取って、垂れる所を数か所にまとめる**——縁を一周させると簾になる
  const patch = (smoothWave(SEED + c.seed + 61, x, z, 9) + 1) / 2;
  if (patch * 0.85 + noise(c.seed + 71, x, z) * 0.3 < 1.12 - c.wisp * 0.6) return;
  const len = 1 + Math.floor((patch * 0.8 + noise(c.seed + 73, x, z) * 0.45) * 5);
  const y0 = Math.max(BOTTOM, bot - len);
  if (y0 > bot - 1) return;
  ops.push(fill(x, y0, z, x, bot - 1, z, vaporOf(c.seed + 14, x, z)));
}

/** 雲を 1 枚積む。**`ops` に足す**（副作用はこれだけ） */
export function emitCloud(ops: BuildOp[], c: Cloud): void {
  const puffs = puffsOf(c);
  const rr = Math.ceil(c.r) + 1;
  for (let x = c.cx - rr; x <= c.cx + rr; x++) {
    for (let z = c.cz - rr; z <= c.cz + rr; z++) {
      const d = depthAt(c, puffs, x, z);
      if (d <= 0) continue;
      const top = topAt(c, x, z);
      const th = thickAt(c, d, x, z);
      pillar(ops, c, x, z, top, th, d);
      tail(ops, c, x, z, top - th + 1, d);
    }
  }
}
