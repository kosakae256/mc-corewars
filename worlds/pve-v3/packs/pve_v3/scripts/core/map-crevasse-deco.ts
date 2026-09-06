/**
 * 氷河の裂け目の**飾り**——氷柱・吊り氷柱・縄橋の索具・ゲートの枠。**純粋。**
 *
 * > ### 上に伸ばすものは「1 マスの柱」か「1 段ずつ」（0-8）
 * >
 * > **並べて塊にすると、その上が登れない面になる。**
 * > だから氷柱は **`(x + 2z) % 3 === 0` の升目にだけ**立てる——
 * > **この升目どうしは決して隣り合わない**（隣は 1 か 2 ずれる）ので、
 * > 届かない面は**必ず 1 マスで途切れる。**
 * >
 * > 縄橋の索は逆に**両端から 1 マスずつ下る三角**にして、
 * > **歩いて登れる形**のまま帆柱まで繋げてある。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GATE_Z, GROUND, noise, SPAWN_Z, speckle } from "./map-frame.js";
import { crevIn, inFissure, key, NEIGH, SEED, type Col } from "./map-crevasse-shape.js";

/** 立った氷柱（セラック）。**白を主に、青は差し色** */
const SERAC = ["packed_ice", "snow", "calcite", "packed_ice", "blue_ice"];

/** 吊り氷柱 */
const ICICLE = ["packed_ice", "blue_ice", "packed_ice", "blue_ice"];

/** **隣り合わない升目か**（0-8 のための間引き） */
function apart(x: number, z: number): boolean {
  return (((x + 2 * z) % 3) + 3) % 3 === 0;
}

/**
 * 立った氷柱。**裂け目の縁ほど密に立つ。**
 *
 * **見通しの帯（|x| ≤ 5）・湧く所・門前には立てない**（0-3）。
 */
export function seracOps(ops: BuildOp[], cols: ReadonlyMap<string, Col>): void {
  for (const c of cols.values()) {
    if (c.kind !== "bank" && c.kind !== "cornice") continue;
    if (Math.abs(c.x) <= 5) continue;
    if (Math.hypot(c.x, c.z - SPAWN_Z) < 8) continue;
    if (Math.abs(c.x) <= 8 && c.z > 33) continue;
    if (!apart(c.x, c.z)) continue;
    const rim = Math.max(0, -crevIn(c.x, c.z));
    // **立て過ぎると、氷原が青い柵になる**（2026-09-06 に間引いた）
    if (noise(SEED + 111, c.x, c.z) > 0.018 + 0.085 * Math.exp(-rim / 6)) continue;
    const h = 2 + Math.floor(noise(SEED + 113, c.x, c.z) * 5.6);
    ops.push(fill(c.x, c.top + 1, c.z, c.x, c.top + h - 1, c.z, speckle(SEED + 115, c.x, c.z, SERAC)));
    ops.push(set(c.x, c.top + h, c.z, h >= 4 ? "blue_ice" : "snow"));
  }
}

/** その空きマスに面した柱のうち、**いちばん浅い腹**を持つもの */
function overhang(cols: ReadonlyMap<string, Col>, x: number, z: number): Col | null {
  let best: Col | null = null;
  for (const [dx, dz] of NEIGH) {
    const n = cols.get(key(x + dx, z + dz));
    if (n === undefined) continue;
    if (best === null || n.bottom > best.bottom) best = n;
  }
  return best;
}

/**
 * 吊り氷柱。**裂け目の壁と雪庇の裏から垂れる。**
 *
 * > ### **裂け目の中だけ**（2026-09-06 に直した）
 * >
 * > 「島に面した空きマス」で引いたら、**島の外周ぐるりに氷柱が下がって**、
 * > 浮島が**簾**になった。**裂け目と枝の亀裂の中に限る。**
 *
 * > ### **必ず横の柱に触れさせる**（0-5）
 * >
 * > 空中に浮かせると**島から切り離された塊**になって検査に落ちる。
 * > **上端を、隣の柱の腹（`bottom`）より上に置く**——そこで必ず接する。
 */
export function icicleOps(ops: BuildOp[], cols: ReadonlyMap<string, Col>): void {
  for (let x = -46; x <= 46; x++) {
    for (let z = -46; z <= 46; z++) {
      if (cols.has(key(x, z)) || !apart(x, z)) continue;
      if (crevIn(x, z) <= 0 && !inFissure(x, z)) continue;
      const n = overhang(cols, x, z);
      if (n === null || noise(SEED + 121, x, z) > 0.3) continue;
      const room = Math.max(0, -n.bottom - 10);
      const y0 = n.bottom < -14 ? Math.round(-3 - noise(SEED + 123, x, z) * room) : n.bottom;
      const len = 2 + Math.floor(noise(SEED + 125, x, z) * 5);
      const end = Math.max(-44, y0 - len);
      if (end >= y0) continue;
      ops.push(fill(x, end + 1, z, x, y0, z, speckle(SEED + 127, x, z, ICICLE)));
      ops.push(set(x, end, z, "blue_ice"));
    }
  }
}

// ================================================================ 縄橋

/** 帆柱の高さ。**索はここから 1 マスずつ下る**（0-8） */
const MAST = 5;

/** 板と縄の橋の索具。**両端に錨の丸太、縁に手すり、真ん中で索が垂れる** */
export function ropeOps(ops: BuildOp[], cols: ReadonlyMap<string, Col>): void {
  let z0 = 99;
  let z1 = -99;
  for (const c of cols.values()) {
    if (c.kind !== "rope") continue;
    z0 = Math.min(z0, c.z);
    z1 = Math.max(z1, c.z);
  }
  if (z1 < z0) return;
  const a = z0 - 1;
  const b = z1 + 1;
  for (const x of [25, 29]) {
    for (let z = a; z <= b; z++) {
      const c = cols.get(key(x, z));
      if (c === undefined) continue;
      const h = Math.max(1, MAST - Math.min(Math.abs(z - a), Math.abs(z - b)));
      if (z === a || z === b) {
        ops.push(fill(x, c.top + 1, z, x, c.top + MAST - 1, z, "spruce_log"));
        ops.push(set(x, c.top + MAST, z, "lantern"));
        continue;
      }
      ops.push(set(x, c.top + 1, z, "spruce_fence"));
      if (h >= 2) ops.push(fill(x, c.top + 2, z, x, c.top + h, z, "iron_chain"));
    }
  }
  stays(ops, cols, a, b);
}

/**
 * 吊り索と錨。**板の下へ鎖を垂らし、両端の岸に丸太を伏せる。**
 *
 * **柱の中に足す**ので天面は変わらない——登れない面にならない（0-8）。
 */
function stays(ops: BuildOp[], cols: ReadonlyMap<string, Col>, a: number, b: number): void {
  for (let z = a + 2; z < b; z += 3) {
    for (const x of [25, 29]) {
      if (!cols.has(key(x, z))) continue;
      const len = 3 + Math.floor(noise(SEED + 131, x, z) * 6);
      ops.push(fill(x, GROUND - 1 - len, z, x, GROUND - 2, z, "iron_chain"));
    }
  }
  for (const z of [a - 1, b + 1]) {
    for (const x of [26, 28]) {
      const c = cols.get(key(x, z));
      if (c === undefined) continue;
      ops.push(set(x, c.top, z, "stripped_dark_oak_log"));
    }
  }
}

// ================================================================ ゲート

/**
 * ゲートの枠。**箱（x −1〜1・y 1〜5・z 39）の外側にだけ置く**（0-2-1）。
 *
 * > ### **ポータルそのものは置かない**
 * >
 * > **敵を倒し切ったときに、進行の側が立てる**（`20-portal.md` 0-2）。
 * > ここで作るのは**氷の門柱と楣、吊るした灯りだけ。**
 *
 * **|x| ≤ 6 かつ z ≥ 39 は、登れない面の勘定から外れている**（門の飾りのため）。
 */
export function gateFrameOps(ops: BuildOp[]): void {
  for (const x of [-2, 2]) {
    ops.push(fill(x, GROUND + 1, GATE_Z, x, GROUND + 5, GATE_Z, speckle(SEED + 141, x, GATE_Z, ICICLE)));
  }
  for (const x of [-3, 3]) {
    ops.push(fill(x, GROUND + 1, GATE_Z, x, GROUND + 6, GATE_Z, "packed_ice"));
    ops.push(set(x, GROUND + 7, GATE_Z, "blue_ice"));
  }
  ops.push(fill(-2, GROUND + 6, GATE_Z, 2, GROUND + 6, GATE_Z, "blue_ice"));
  ops.push(fill(-3, GROUND + 8, GATE_Z, 3, GROUND + 8, GATE_Z, "packed_ice"));
  for (const x of [-5, 5]) {
    ops.push(fill(x, GROUND + 1, GATE_Z, x, GROUND + 4, GATE_Z, "packed_ice"));
    ops.push(fill(x, GROUND + 5, GATE_Z, x, GROUND + 7, GATE_Z, "blue_ice"));
    ops.push(set(x, GROUND + 8, GATE_Z, "calcite"));
    ops.push(fill(x, GROUND + 1, GATE_Z + 1, x, GROUND + 3, GATE_Z + 1, "iron_chain"));
    ops.push(set(x, GROUND + 4, GATE_Z + 1, "lantern"));
  }
  for (const x of [-6, 6]) {
    ops.push(fill(x, GROUND + 1, GATE_Z + 1, x, GROUND + 5, GATE_Z + 1, speckle(SEED + 143, x, GATE_Z, SERAC)));
    ops.push(set(x, GROUND + 6, GATE_Z + 1, "blue_ice"));
  }
}
