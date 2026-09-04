/**
 * 休憩所の装飾——**草とテラコッタ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 6 章。
 *
 * > ### 葉は「敷かない」。**囲って植える**（2026-09-04 決定）
 * >
 * > **一面に敷いたら、神殿が野原になった。**
 * > **テラコッタで縁を作った植え込みに入れる**——そこだけ緑が乗る。
 * > **葉ブロック**（アザレア・桜・樫）を使う。土や草は置かない。
 *
 * | | |
 * | --- | --- |
 * | **花壇** | **6 つ**。列柱と太い柱の間（半径 29）。**入口とポータルの正面は空ける** |
 * | **床の帯** | 放射の筋と、同心の輪をテラコッタにする |
 * | **柱の基部** | 太い柱の足元に、テラコッタの沓（くつ） |
 */

import { circlePoints, fill, set, type BuildOp } from "./build.js";

/** 花壇を置く半径 */
const BED_R = 29;

/** 花壇の大きさ（中心からの半分） */
const BED_HALF = 2;

/** 太い柱の半径（`rest-shaft.ts` と揃える） */
const PILLAR_R = 33;

/**
 * 花壇の縁。**彩釉テラコッタ**（模様つき）。
 *
 * > ### 模様のあるほうを使う（2026-09-04 決定）
 * >
 * > **彩釉テラコッタは 1 マスごとに模様が回る。**
 * > **輪に沿って並べると、それだけで縁飾りになる。**
 * > **無地のテラコッタは、沓や段の縁など「面で見せる所」に回す。**
 */
const BED_RIMS: readonly string[] = [
  "cyan_glazed_terracotta",
  "orange_glazed_terracotta",
  "light_blue_glazed_terracotta",
  "magenta_glazed_terracotta",
  "lime_glazed_terracotta",
  "yellow_glazed_terracotta",
];

/** 沓（柱の足元）。**無地のほう**——面で敷くので、模様だと騒がしい */
const SHOE_COLORS: readonly string[] = [
  "cyan_terracotta",
  "orange_terracotta",
  "light_blue_terracotta",
  "white_terracotta",
  "light_gray_terracotta",
  "hardened_clay",
  "purple_terracotta",
  "yellow_terracotta",
];

/** 放射の筋。**彩釉と無地を交互に** */
const SPOKE_COLORS: readonly string[] = [
  "white_terracotta",
  "light_blue_glazed_terracotta",
  "light_gray_terracotta",
  "cyan_glazed_terracotta",
];

/** 花壇を 1 つ置く */
function bed(ops: BuildOp[], cx: number, cz: number, rim: string): void {
  for (let dx = -BED_HALF; dx <= BED_HALF; dx++) {
    for (let dz = -BED_HALF; dz <= BED_HALF; dz++) {
      const edge = Math.abs(dx) === BED_HALF || Math.abs(dz) === BED_HALF;
      const corner = Math.abs(dx) === BED_HALF && Math.abs(dz) === BED_HALF;
      const x = cx + dx;
      const z = cz + dz;
      if (corner) {
        // **四隅は柱**。花壇の形が締まる
        ops.push(fill(x, 1, z, x, 2, z, "chiseled_quartz_block"));
        ops.push(set(x, 3, z, "sea_lantern"));
        continue;
      }
      if (edge) {
        ops.push(set(x, 1, z, rim));
        continue;
      }
      // ---- 中は葉。**刈り込んだ植え込みに見える**
      ops.push(set(x, 1, z, "azalea_leaves"));
    }
  }
  // ---- 真ん中を一段高くして、木のように見せる
  ops.push(set(cx, 2, cz, "cherry_leaves"));
  for (const d of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ops.push(set(cx + (d[0] as number), 2, cz + (d[1] as number), "oak_leaves"));
  }
}

/** 花壇を並べる。**入口（270°）とポータル（90°）の正面は空ける** */
function beds(ops: BuildOp[], cz: number): void {
  let n = 0;
  for (let k = 0; k < 8; k++) {
    const deg = k * 45;
    if (Math.abs(deg - 90) < 20 || Math.abs(deg - 270) < 20) continue;
    const t = (deg * Math.PI) / 180;
    const x = Math.round(Math.cos(t) * BED_R);
    const z = Math.round(Math.sin(t) * BED_R) + cz;
    bed(ops, x, z, BED_RIMS[n % BED_RIMS.length] ?? "hardened_clay");
    n++;
  }
}

/**
 * 床の同心の輪。**彩釉（模様）と無地を交互に重ねる。**
 *
 * 外から: 無地の帯 → 彩釉の輪 → 無地 → …… → 中央の彩釉の輪。
 */
function bands(ops: BuildOp[], cz: number): void {
  for (const [r, block] of [
    [23, "light_gray_terracotta"],
    [22, "white_glazed_terracotta"],
    [21, "light_blue_glazed_terracotta"],
    [20, "white_terracotta"],
    [14, "cyan_terracotta"],
    [13, "purple_glazed_terracotta"],
    [8, "magenta_glazed_terracotta"],
    [7, "light_blue_terracotta"],
    [5, "orange_glazed_terracotta"],
    [4, "yellow_glazed_terracotta"],
  ] as const) {
    for (const p of circlePoints(cz, r)) ops.push(set(p.x, 0, p.z, block));
  }
}

/** 太い柱の足元に、テラコッタの沓 */
function shoes(ops: BuildOp[], cz: number): void {
  for (let k = 0; k < 8; k++) {
    const t = ((22.5 + k * 45) * Math.PI) / 180;
    const cx = Math.round(Math.cos(t) * PILLAR_R);
    const pz = Math.round(Math.sin(t) * PILLAR_R) + cz;
    const rim = SHOE_COLORS[k % SHOE_COLORS.length] ?? "hardened_clay";
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        ops.push(set(cx + dx, 0, pz + dz, rim));
      }
    }
  }
}

/** 放射の筋を、色つきのテラコッタで引き直す */
export function spokeBlock(index: number): string {
  return SPOKE_COLORS[index % SPOKE_COLORS.length] ?? "white_terracotta";
}

/** 装飾を足す。**床と柱を置いたあとに呼ぶ** */
export function decorOps(cz: number): BuildOp[] {
  const ops: BuildOp[] = [];
  bands(ops, cz);
  shoes(ops, cz);
  beds(ops, cz);
  return ops;
}
