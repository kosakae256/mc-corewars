/**
 * 3. 溶岩の島——**島を繋ぐ橋。**
 *
 * 決まりは `spec/14-map-build.md` 0-5・0-6・0-8。**形は `map-lavaisle-land.ts`。**
 *
 * > ### 橋は 1 種類にしない
 * >
 * > **同じ橋を 6 本架けると、作り物に見える**（0-6）。
 * > **土手・石のアーチ・岩の背・崩れかけ**を混ぜ、幅も高さも向きも変える。
 *
 * > ### アーチは、両端から迫り上げる
 * >
 * > **迫（せり）を海面まで下ろす**ので、真ん中が浮かない（0-5）。
 * > **下は抜けている**——遠くから見て「橋」に見えるのはここ。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { landAt, type Land, SEA_TOP, SEED } from "./map-lavaisle-land.js";
import { PYLONS, type Span, SPANS } from "./map-lavaisle-plan.js";

/** 橋の 1 マス */
interface Deck {
  readonly x: number;
  readonly z: number;
  /** 中央からの位置（−1〜+1） */
  readonly u: number;
  /** 中心からの左右（±half が縁） */
  readonly w: number;
}

/**
 * 線を 1 マスも欠けさせずに拾う。
 *
 * > ### 斜めに飛んだら、間を埋める
 * >
 * > **x と z を同時に丸めると、1 マス幅の斜めの橋が「角でしか繋がらない」形になる。**
 * > 実際、細橋の頂上 4 マスが**歩いて行けない面**として検査に落ちた（0-8）。
 * > **前のマスと縦横どちらも違ったら、曲がり角のマスを足す。**
 */
function raster(s: Span): Deck[] {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const long = Math.hypot(dx, dz);
  const nx = -dz / long;
  const nz = dx / long;
  const steps = Math.max(1, Math.round(long * 4));
  const seen = new Set<string>();
  const out: Deck[] = [];
  const prev = new Map<number, readonly [number, number]>();
  const put = (x: number, z: number, u: number, w: number): void => {
    const k = `${x},${z}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, z, u, w });
  };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (s.cut !== undefined && t > s.cut) break;
    const u = t * 2 - 1;
    for (let w = -s.half; w <= s.half; w++) {
      const x = Math.round(s.x1 + dx * t + nx * w);
      const z = Math.round(s.z1 + dz * t + nz * w);
      const p = prev.get(w);
      if (p !== undefined && p[0] !== x && p[1] !== z) put(p[0], z, u, w);
      put(x, z, u, w);
      prev.set(w, [x, z]);
    }
  }
  return out;
}

/** 手すりを 1 マス置く。**所どころ欠けさせる**——揃っていると作り物に見える */
function rail(ops: BuildOp[], s: Span, d: Deck, top: number): void {
  if (s.rail === "none" || Math.abs(d.w) !== s.half || s.half === 0) return;
  const r = noise(s.seed + 3, d.x, d.z);
  if (r > 0.82) return;
  ops.push(set(d.x, top + 1, d.z, s.rail === "bars" ? "iron_bars" : "polished_blackstone"));
  // **灯りは柱の上だけ。** 通り抜けられるので、登れる面は増えない
  if (r < 0.12) ops.push(set(d.x, top + 2, d.z, "lantern"));
}

/**
 * 1 本架ける。
 *
 * > ### 高さは「岸からどれだけ離れたか」で決める
 * >
 * > **橋の真ん中を持ち上げる式**（`arch × (1 − u²)`）だと、
 * > **島を大きくしたときに、岸のすぐ横がもう 2 マス高くなる**——
 * > そこが登れない面になる（0-8）。
 * >
 * > **岸から 1 マスにつき 1 マスずつ上げる。**
 * > 島の形を変えても、**両端の取り付きは必ず 1 マス刻み**になる。
 */
function span(ops: BuildOp[], s: Span): void {
  const cells = raster(s);
  const lands = cells.map((c) => landAt(c.x, c.z));
  for (let i = 0; i < cells.length; i++) {
    const d = cells[i];
    if (d === undefined) continue;
    const here = lands[i];
    const top = here !== undefined ? here.top : Math.min(s.arch, Math.floor(shore(cells, lands, d)) - 1);
    // **迫は、低い所では海面まで下ろす**（浮かせない。0-5）。高い所だけ下を抜く
    const foot = top >= 2 ? top - 2 : SEA_TOP;
    const body = noise(s.seed, d.x, d.z) > 0.5 ? "blackstone" : "polished_blackstone";
    if (top - 1 >= foot) ops.push(fill(d.x, foot, d.z, d.x, top - 1, d.z, body));
    const face =
      s.edge !== undefined && Math.abs(d.w) === s.half && s.half > 0
        ? s.edge
        : (s.deck[Math.floor(noise(s.seed + 1, d.x, d.z) * s.deck.length)] ?? "blackstone");
    ops.push(set(d.x, top, d.z, face));
    rail(ops, s, d, top);
  }
}

/** いちばん近い岸までの隔たり。**橋の上でしか使わない**ので、総当たりで足りる */
function shore(cells: readonly Deck[], lands: ReadonlyArray<Land | undefined>, at: Deck): number {
  let best = 99;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c === undefined || lands[i] === undefined) continue;
    best = Math.min(best, Math.hypot(c.x - at.x, c.z - at.z));
  }
  return best;
}

/** 崩れた先の瓦礫。**橋の続きだった所に、頭だけ出ている** */
function rubble(ops: BuildOp[], s: Span): void {
  if (s.cut === undefined) return;
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  for (let i = 0; i < 5; i++) {
    const t = s.cut + 0.11 * (i + 1);
    if (t >= 1) break;
    if (noise(s.seed + 5, i, 0) > 0.72) continue;
    const x = Math.round(s.x1 + dx * t + (noise(s.seed + 6, i, 1) - 0.5) * 5);
    const z = Math.round(s.z1 + dz * t + (noise(s.seed + 7, i, 2) - 0.5) * 5);
    const h = Math.floor(noise(s.seed + 8, x, z) * 3);
    ops.push(fill(x, SEA_TOP, z, x, SEA_TOP + h, z, noise(s.seed + 9, x, z) > 0.5 ? "obsidian" : "blackstone"));
  }
}

/** 塔を 1 本立てる。**1 マス角**なので、上に立てる面が広がらない（0-8） */
function pylon(ops: BuildOp[], x: number, z: number, h: number): void {
  for (let y = 0; y <= h; y++) {
    const m = noise(SEED + 490, x, z + y);
    ops.push(set(x, SEA_TOP + y, z, m > 0.7 ? "gilded_blackstone" : m > 0.35 ? "polished_blackstone" : "blackstone"));
  }
  // **高い塔の頭は灯りにしない**——柱まるごとが灯りの色で塗られて、白い棒に見える
  ops.push(set(x, SEA_TOP + h + 1, z, h <= 4 ? "lantern" : "magma"));
}

/** 橋を全部架ける */
export function spans(ops: BuildOp[]): void {
  for (const s of SPANS) {
    span(ops, s);
    rubble(ops, s);
  }
  for (const [x, z, h] of PYLONS) pylon(ops, x, z, h);
}
