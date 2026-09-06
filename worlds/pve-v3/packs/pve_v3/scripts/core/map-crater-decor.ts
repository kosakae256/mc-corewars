/**
 * 戦場 12「隕石孔」——**造作。純粋。**
 *
 * **隕鉄の塊・砕けた岩の破片・飛び散った岩塊・内壁の露頭。**
 * 決まりは `spec/14-map-build.md` 0-5（浮かせない）・0-6（似た形を並べない）・0-8（登れる）。
 *
 * > ### 掘った所の上に柱を立てると 1 マス浮く（2026-09-06 に分かった）
 * >
 * > 素の地形の高さから積むと、**あとで掘った所では宙に浮く。**
 * > **積む側は必ず「いま置かれている天面」（`tops`）から積む。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise, smoothWave } from "./map-frame.js";
import { craterD, craterR, FLOOR_Y, isLand, SEED } from "./map-crater-form.js";
import { bandIndex, bandMat, EJECTA, grain, IRON } from "./map-crater-mat.js";

/** いま置かれている天面 */
function topAt(tops: Map<string, number>, x: number, z: number): number | undefined {
  return tops.get(`${x},${z}`);
}

/**
 * 1 本ぶん積む。**その柱の天面から積む**ので、掘った所でも浮かない（0-5）。
 *
 * `tops` を書き換える（副作用）。**あとで `smooth` が読む。**
 */
function pillar(
  ops: BuildOp[],
  tops: Map<string, number>,
  x: number,
  z: number,
  up: number,
  mats: readonly string[],
  seed: number
): void {
  if (up <= 0) return;
  const base = topAt(tops, x, z);
  if (base === undefined) return;
  if (up > 1) ops.push(fill(x, base + 1, z, x, base + up - 1, z, grain(seed, x, z, mats)));
  ops.push(set(x, base + up, z, grain(seed + 3, x, z, mats)));
  tops.set(`${x},${z}`, base + up);
}

/**
 * **縁からの隔たりより高くしない**（0-8）。
 *
 * こうしておくと、**どの向きから寄っても 1 マスずつで登れる。**
 */
function step(up: number, rim: number): number {
  return Math.max(0, Math.min(up, rim));
}

/** 隕鉄の塊 1 つぶん */
interface Lump {
  readonly cx: number;
  readonly cz: number;
  readonly rx: number;
  readonly rz: number;
  readonly up: number;
  readonly s: number;
}

/**
 * 隕鉄の塊。**中心に残った、落ちてきたもの。**
 *
 * > ### 真ん中ちょうどには置かない
 * >
 * > **滑って止まったように、少しずらす。** 真円の塚を中心に据えると、
 * > **作り物にしか見えない**（0-6）。大小 5 つに割れて散っている。
 *
 * **地面（y ＝ 0）より上へは出さない**——ゲートが見えなくなる（0-3）。
 */
export function ironMass(ops: BuildOp[], tops: Map<string, number>): void {
  const lumps: readonly Lump[] = [
    { cx: 5, cz: 3, rx: 8, rz: 6, up: 5, s: SEED + 501 },
    { cx: -4, cz: -5, rx: 5, rz: 6, up: 3, s: SEED + 511 },
    { cx: 9, cz: -6, rx: 3, rz: 4, up: 2, s: SEED + 521 },
    { cx: -9, cz: 6, rx: 4, rz: 3, up: 2, s: SEED + 531 },
    { cx: 1, cz: 12, rx: 3, rz: 3, up: 1, s: SEED + 541 },
  ];
  for (const l of lumps) {
    for (let dx = -l.rx; dx <= l.rx; dx++) {
      for (let dz = -l.rz; dz <= l.rz; dz++) {
        const t = (dx / l.rx) ** 2 + (dz / l.rz) ** 2;
        if (t > 1) continue;
        // **縁は欠けさせる。** 楕円のままだと、輪郭が定規で引いたように見える
        if (t > 0.55 && noise(l.s + 1, l.cx + dx, l.cz + dz) > 0.66) continue;
        const x = l.cx + dx;
        const z = l.cz + dz;
        const base = topAt(tops, x, z);
        if (base === undefined || base > FLOOR_Y + 3) continue;
        const rim = Math.round((1 - Math.sqrt(t)) * Math.min(l.rx, l.rz));
        pillar(ops, tops, x, z, Math.min(step(l.up, rim), GROUND - 8 - base), IRON, l.s + 7);
      }
    }
  }
}

/**
 * 砕けた岩の破片。**底に散る、低い薄板。**
 *
 * **中心から外へ向いた向き**に寝かせる——爆風で押し出された形。
 */
export function shards(ops: BuildOp[], tops: Map<string, number>): void {
  for (let i = 0; i < 26; i++) {
    const a = noise(SEED + 601, i, 0) * Math.PI * 2;
    const rr = 6 + noise(SEED + 602, i, 1) * 13;
    const cx = Math.round(-3 + Math.cos(a) * rr * 1.16);
    const cz = Math.round(-2 + Math.sin(a) * rr * 0.9);
    const len = 2 + Math.floor(noise(SEED + 603, i, 2) * 6);
    // **向きは中心から外へ。** 少しだけ捻る
    const dir = a + (noise(SEED + 604, i, 3) - 0.5) * 1.1;
    const ux = Math.cos(dir);
    const uz = Math.sin(dir);
    for (let k = -len; k <= len; k++) {
      const w = noise(SEED + 605, cx + k, i) > 0.6 ? 1 : 0;
      for (let b = -w; b <= w; b++) {
        const x = Math.round(cx + ux * k - uz * b);
        const z = Math.round(cz + uz * k + ux * b);
        const base = topAt(tops, x, z);
        if (base === undefined || base > FLOOR_Y + 6) continue;
        pillar(ops, tops, x, z, 1, EJECTA, SEED + 607 + i);
      }
    }
  }
}

/** そこに岩塊を置いてよいか。**通り道と要所は空ける** */
function freeOut(x: number, z: number, tops: Map<string, number>): boolean {
  if (topAt(tops, x, z) === undefined) return false;
  // **見通しの帯**（0-3）
  if (Math.abs(x) <= 8) return false;
  // **湧く所の足場とゲートの足元**（0-2）
  if (Math.abs(x) <= 12 && (z <= -32 || z >= 31)) return false;
  return isLand(x, z);
}

/** 丸い塚。**縦横を別々に引く**ので真円にならない */
function mound(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, s: number): void {
  const rx = 2 + Math.floor(noise(s + 1, cx, cz) * 4);
  const rz = 2 + Math.floor(noise(s + 2, cx, cz) * 4);
  const up = 1 + Math.floor(noise(s + 3, cx, cz) * 2);
  for (let dx = -rx; dx <= rx; dx++) {
    for (let dz = -rz; dz <= rz; dz++) {
      const t = (dx / rx) ** 2 + (dz / rz) ** 2;
      if (t > 1) continue;
      if (t > 0.5 && noise(s + 4, cx + dx, cz + dz) > 0.6) continue;
      if (!freeOut(cx + dx, cz + dz, tops)) continue;
      const rim = Math.round((1 - Math.sqrt(t)) * Math.min(rx, rz));
      pillar(ops, tops, cx + dx, cz + dz, step(up, rim), EJECTA, s + 5);
    }
  }
}

/** 細長い畝。**向きを引く** */
function ridge(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, s: number): void {
  const len = 3 + Math.floor(noise(s + 6, cx, cz) * 6);
  const dir = noise(s + 7, cx, cz) * Math.PI;
  const ux = Math.cos(dir);
  const uz = Math.sin(dir);
  for (let k = -len; k <= len; k++) {
    const w = noise(s + 8, cx + k, cz) > 0.45 ? 1 : 0;
    for (let b = -w; b <= w; b++) {
      const x = Math.round(cx + ux * k - uz * b);
      const z = Math.round(cz + uz * k + ux * b);
      if (!freeOut(x, z, tops)) continue;
      pillar(ops, tops, x, z, step(2, len - Math.abs(k) + 1 - Math.abs(b)), EJECTA, s + 9);
    }
  }
}

/** 平たい板。**1 マスだけ。角ばらせる** */
function slab(ops: BuildOp[], tops: Map<string, number>, cx: number, cz: number, s: number): void {
  const hx = 2 + Math.floor(noise(s + 10, cx, cz) * 5);
  const hz = 2 + Math.floor(noise(s + 11, cx, cz) * 5);
  for (let dx = -hx; dx <= hx; dx++) {
    for (let dz = -hz; dz <= hz; dz++) {
      if (noise(s + 12, cx + dx, cz + dz) > 0.78) continue;
      if (!freeOut(cx + dx, cz + dz, tops)) continue;
      pillar(ops, tops, cx + dx, cz + dz, 1, EJECTA, s + 13);
    }
  }
}

/**
 * 飛び散った岩塊。**裾に散らばる、深い所から出てきた石。**
 *
 * > ### 大きさも形も 1 つずつ変える（0-6）
 * >
 * > **丸い塚と、細長い畝と、平たい板**の 3 通りを混ぜ、
 * > **升目の中で位置を揺らして**、間隔そのものを散らす。
 * > **遠いほど疎ら**にするので、縁の外側に向かって自然に消えていく。
 */
export function boulders(ops: BuildOp[], tops: Map<string, number>): void {
  const STEP = 9;
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -5; gz <= 5; gz++) {
      if (noise(SEED + 701, gx, gz) > 0.62) continue; // **3 つに 1 つは置かない**
      const x = gx * STEP + Math.round((noise(SEED + 703, gx, gz) - 0.5) * STEP);
      const z = gz * STEP + Math.round((noise(SEED + 705, gx, gz) - 0.5) * STEP);
      const d = craterD(x, z);
      if (d < craterR(x, z) - 2) continue;
      if (noise(SEED + 707, gx, gz) > 1.35 - d / 50) continue;
      const s = SEED + 800 + gx * 61 + gz * 97;
      const kind = Math.floor(noise(s, gx, gz) * 3);
      if (kind === 0) mound(ops, tops, x, z, s);
      else if (kind === 1) ridge(ops, tops, x, z, s);
      else slab(ops, tops, x, z, s);
    }
  }
}

/**
 * 内壁の露頭。**地層の硬い所だけ、1 マス前へ出て残る。**
 *
 * **その高さの帯と同じ材**で積むので、**縞が途切れずに前へ出る。**
 * 横に長い雑音を使うので、**輪に沿って伸びる形**になる。
 */
export function outcrops(ops: BuildOp[], tops: Map<string, number>): void {
  for (let x = -34; x <= 34; x++) {
    for (let z = -34; z <= 34; z++) {
      // **見通しの帯には置かない**（0-3）
      if (Math.abs(x) <= 7) continue;
      const base = topAt(tops, x, z);
      if (base === undefined || base >= GROUND - 1 || base <= FLOOR_Y + 1) continue;
      if (craterD(x, z) > craterR(x, z)) continue;
      if (smoothWave(SEED + 901, x * 3, z, 13) < 0.62) continue;
      if (noise(SEED + 903, x, z) > 0.72) continue;
      ops.push(set(x, base + 1, z, bandMat(bandIndex(base + 1, x, z), x, z)));
      tops.set(`${x},${z}`, base + 1);
    }
  }
}
