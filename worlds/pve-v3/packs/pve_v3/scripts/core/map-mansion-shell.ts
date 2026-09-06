/**
 * 11「森の洋館」の**躯体。純粋。**
 *
 * ```
 * massOps    外形を詰める（基礎・胴・屋根）
 * carveOps   部屋と廊下を彫る（1 階・2 階・吹き抜け）
 * faceOps    空きに面した壁の 1 本を、木骨と腰壁に塗る
 * deckOps    床と天井を敷く
 * doorOps    壁に口を開ける
 * windowOps  外壁を突き抜く窓を開ける
 * ```
 *
 * > ### **積まずに彫る**
 * >
 * > 外形さえ決まりを満たしていれば、**中をどう抜いても上から見た形は変わらない。**
 * > **彫り残しがそのまま壁と柱になる**ので、浮いたブロックも出ない（0-5）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import {
  BASE,
  F1,
  F2,
  ROOF,
  SEED,
  TOP2,
  doorAtX,
  doorAtZ,
  inMass,
  isOpen,
  isSecret,
  massHalf,
  spaceAt,
  tallDoorX,
  tallDoorZ,
} from "./map-mansion-plan.js";
import { edgeAt, roofAt } from "./map-mansion-roof.js";
import { facadeColumn, footing, roofMat, rowRuns, wainscot, wallColumn } from "./map-mansion-mat.js";

/** 生成する z の端。**外形はこの中に収まっている** */
export const Z0 = -45;
export const Z1 = 45;

/** 屋根がいちばん高くなる段（棟） */
const ROOF_TOP = ROOF + 7;

/** 吹き抜けか。**大広間・玄関大広間・ゲート前の広間** */
export function isTall(x: number, z: number): boolean {
  const s = spaceAt(x, z);
  return s === "hall" || s === "grand";
}

/**
 * 2 階の床が残る所。
 *
 * **吹き抜けでも、縁は回廊として残す**——上から見下ろせて、上へも回れる。
 */
export function isBalcony(x: number, z: number): boolean {
  const s = spaceAt(x, z);
  if (s === "hall") return Math.max(Math.abs(x), Math.abs(z)) >= 8;
  if (s !== "grand") return false;
  // **北は大階段が占めるので、上り切った所だけ。南は側廊をまるごと回廊にする**
  return z < 0 ? Math.abs(x) >= 11 && z >= -33 : Math.abs(x) >= 11;
}

/** そこに 2 階の床があるか */
export function hasDeck2(x: number, z: number): boolean {
  return isOpen(x, z) && (!isTall(x, z) || isBalcony(x, z));
}

/** 外形を詰める。**胴は 1 本の fill**——中は彫るので材を変えても見えない */
export function massOps(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const h = massHalf(z);
    if (h < 0) continue;
    ops.push(fill(-h, F1, z, h, ROOF - 1, z, "dark_oak_planks"));
    ops.push(fill(-h, BASE, z, h, F1 - 1, z, "cobblestone"));
    // **基礎は下から見える**ので、柱ごとに引き直す。
    // **1 マスごとに引くと手順が 6 倍**になる（それだけで 1 万 6 千件）——柱で 1 回に留める
    for (let x = -h; x <= h; x++) {
      if (noise(SEED + 19, x, 1, z) > 0.45) continue;
      ops.push(fill(x, BASE, z, x, F1 - 1, z, footing(x, 0, z)));
    }
  }
}

/** 屋根。**段丘の形は `roofAt`**——ここは段を塗るだけ */
export function roofOps(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const h = massHalf(z);
    if (h < 0) continue;
    for (let y = ROOF; y <= ROOF_TOP; y++) {
      for (const [a, b] of rowRuns(-h, h, (x) => roofAt(x, z) >= y)) {
        ops.push(fill(a, y, z, b, y, z, "dark_oak_planks"));
      }
    }
    // **天面は全マス置く**——棟と破風の筋を、材の違いで見せるため
    for (let x = -h; x <= h; x++) ops.push(set(x, roofAt(x, z), z, roofMat(x, z)));
  }
  chimneys(ops);
}

/**
 * 煙突と屋根の明かり。
 *
 * **1 マス角にする**——3 × 3 の平屋根を作ると、天面 9 マスが
 * **登れない面**として残って 0-8 に落ちる。
 */
function chimneys(ops: BuildOp[]): void {
  const spots: readonly (readonly [number, number])[] = [
    [-31, -12],
    [-24, 8],
    [-14, -21],
    [-6, 17],
    [9, -16],
    [17, 6],
    [26, -8],
    [33, 14],
    [-13, 39],
    [12, -38],
  ];
  for (const [x, z] of spots) {
    if (!inMass(x, z)) continue;
    const t = roofAt(x, z);
    const hi = Math.min(28, t + 2 + Math.floor(noise(SEED + 31, x, 7, z) * 3));
    ops.push(fill(x, t + 1, z, x, hi, z, "cobblestone"));
    ops.push(set(x, hi, z, "mossy_cobblestone"));
  }
  for (let z = Z0 + 3; z <= Z1 - 3; z += 7) {
    const h = massHalf(z);
    if (h < 3) continue;
    for (const x of [-h + 1, h - 1]) ops.push(set(x, roofAt(x, z) + 1, z, "lantern"));
  }
}

/** 部屋と廊下を彫る。**1 階・2 階・吹き抜けの 3 回** */
export function carveOps(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const h = massHalf(z);
    if (h < 0) continue;
    for (const [a, b] of rowRuns(-h, h, (x) => isOpen(x, z))) {
      ops.push(fill(a, F1 + 1, z, b, F2 - 1, z, "air"));
      ops.push(fill(a, F2 + 1, z, b, TOP2 - 1, z, "air"));
    }
    for (const [a, b] of rowRuns(-h, h, (x) => isTall(x, z) && !isBalcony(x, z))) {
      ops.push(fill(a, F2, z, b, F2, z, "air"));
    }
  }
}

/** 空きに面した壁を、木骨と腰壁に塗る。**1 本ずつ材を引く**ので縦縞になる */
export function faceOps(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const h = massHalf(z);
    if (h < 0) continue;
    for (let x = -h; x <= h; x++) {
      if (spaceAt(x, z) !== "solid") continue;
      const touch = isOpen(x - 1, z) || isOpen(x + 1, z) || isOpen(x, z - 1) || isOpen(x, z + 1);
      if (!touch) continue;
      ops.push(fill(x, F1 + 1, z, x, TOP2 - 1, z, wallColumn(x, z)));
      ops.push(fill(x, F1 + 1, z, x, F1 + 2, z, wainscot(x, z)));
      ops.push(fill(x, F2 + 1, z, x, F2 + 2, z, wainscot(x, z + 7)));
    }
  }
}

/** 床と天井。**梁を渡して、板一面にしない** */
export function deckOps(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const h = massHalf(z);
    if (h < 0) continue;
    for (const [a, b] of rowRuns(-h, h, (x) => isOpen(x, z))) {
      ops.push(fill(a, F1, z, b, F1, z, "dark_oak_planks"));
      ops.push(fill(a, TOP2, z, b, TOP2, z, "dark_oak_planks"));
    }
    for (const [a, b] of rowRuns(-h, h, (x) => hasDeck2(x, z))) {
      ops.push(fill(a, F2, z, b, F2, z, "dark_oak_planks"));
    }
    for (let x = -h; x <= h; x++) {
      if (!isOpen(x, z)) continue;
      // **梁は皮を剥いだ丸太**——`dark_oak_log` は板と同色で、絵にすると消える
      const beam = (((x + z * 2) % 7) + 7) % 7 === 0;
      if (beam) {
        ops.push(set(x, TOP2, z, "stripped_dark_oak_log"));
        if (hasDeck2(x, z)) ops.push(set(x, F2, z, "stripped_dark_oak_log"));
      }
    }
  }
}

/**
 * 外壁の面。**いちばん外の 1 枚だけを塗り替える。**
 *
 * > ### 外は奈落だが、**遠景の輪郭としては必ず見える**
 * >
 * > **平らな一枚壁は、それ自体が手抜き**（`spec/14-map-build.md` 0-4）。
 * > **丸石の腰・木骨の柱・軒の帯**の 3 段で、のっぺりさせない。
 */
export function facadeOps(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const h = massHalf(z);
    if (h < 0) continue;
    for (let x = -h; x <= h; x++) {
      if (edgeAt(x, z) !== 1) continue;
      ops.push(fill(x, F1, z, x, F1 + 1, z, wainscot(x, z)));
      ops.push(fill(x, F1 + 2, z, x, ROOF - 1, z, facadeColumn(x, z)));
      // **軒と胴の帯。** 階の切り替わりを外からも読ませる
      for (const y of [F1 + 2, F2, TOP2, ROOF - 1]) ops.push(set(x, y, z, "stripped_dark_oak_log"));
    }
  }
}

/** 壁に口を開ける。**廊下の帯はまるごと、部屋は真ん中 3 マス** */
export function doorOps(ops: BuildOp[]): void {
  for (let z = -23; z <= 22; z++) {
    for (let x = -38; x <= 38; x++) {
      if (spaceAt(x, z) !== "solid") continue;
      if (isOpen(x - 1, z) && isOpen(x + 1, z) && doorAtZ(z) && !isSecret(x - 1, z) && !isSecret(x + 1, z)) {
        cut(ops, x, z, tallDoorZ(z));
      }
      if (isOpen(x, z - 1) && isOpen(x, z + 1) && doorAtX(x) && !isSecret(x, z - 1) && !isSecret(x, z + 1)) {
        cut(ops, x, z, tallDoorX(x));
      }
    }
  }
}

/** 口を 1 本抜く。**楣（まぐさ）を 1 段載せる** */
function cut(ops: BuildOp[], x: number, z: number, tall: boolean): void {
  const top = tall ? 6 : 5;
  ops.push(fill(x, F1 + 1, z, x, F1 + top, z, "air"));
  ops.push(set(x, F1 + top + 1, z, "dark_oak_log"));
  ops.push(fill(x, F2 + 1, z, x, F2 + top, z, "air"));
  ops.push(set(x, F2 + top + 1, z, "dark_oak_log"));
}

/**
 * 外壁の窓。**内側の面から外へ突き抜くまでガラスを通す。**
 *
 * > ### 窓は「壁の厚みぶん」貫かないと、外から光が入らない
 * >
 * > 外壁は 2〜3 マスある。**内側 1 枚だけ差し替えても、ただの飾りになる。**
 */
export function windowOps(ops: BuildOp[]): void {
  const dirs: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let z = Z0; z <= Z1; z++) {
    const h = massHalf(z);
    if (h < 0) continue;
    for (let x = -h; x <= h; x++) {
      if (!isOpen(x, z)) continue;
      for (const [dx, dz] of dirs) {
        let k = 1;
        while (k <= 4 && inMass(x + k * dx, z + k * dz) && !isOpen(x + k * dx, z + k * dz)) k++;
        if (k < 2 || k > 4 || inMass(x + k * dx, z + k * dz)) continue;
        const t = dx !== 0 ? z : x;
        const m = ((t % 5) + 5) % 5;
        if (m !== 1 && m !== 2) continue;
        const x1 = x + dx;
        const z1 = z + dz;
        const x2 = x + (k - 1) * dx;
        const z2 = z + (k - 1) * dz;
        ops.push(fill(x1, F1 + 3, z1, x2, F1 + 5, z2, "glass_pane"));
        ops.push(fill(x1, F2 + 3, z1, x2, F2 + 5, z2, "glass_pane"));
      }
    }
  }
}
