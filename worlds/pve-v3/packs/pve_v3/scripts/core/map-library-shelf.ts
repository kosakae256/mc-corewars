/**
 * 16. 大書庫——**書架の迷路。** 1 階と 2 階、倒れた書架、閲覧の机。
 *
 * 間取りは `map-library-plan.ts`。
 *
 * > ### **列の向きは区画ごとに変える**
 * >
 * > 八角を 8 つの扇に割り、**隣り合う扇で列の向きと間隔を変える**（0-6）。
 * > 一方向に揃えると、ただの倉庫に見える。
 *
 * > ### **袋小路ばかりにしない**
 * >
 * > **身廊（|x| ≦ 2）・交差廊（|z| ≦ 2）・外周の回廊（octR ≧ 37）**は
 * > 必ず空ける。そのうえで**列そのものにも 2 割の穴を空ける。**
 *
 * > ### **身廊には 1 階の高さに何も置かない**
 * >
 * > 検査 0-3 の線が x ＝ 0・y ＝ 1〜6 を通る（`14-map-build.md` 0-9）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { AMBULATORY_R, DECK, INNER_R, SEED, hasDeck, inWell, isOpen, octR, runsX } from "./map-library-plan.js";

/** 1 階の書架の帯。**中央の広間（≦ 13）は空ける**——大机と天球儀の下 */
const LOW = [14, AMBULATORY_R - 1] as const;
/** 2 階の書架の帯。**回廊の縁（21〜25）は空ける**——見下ろして撃つ所 */
const HIGH = [26, AMBULATORY_R - 1] as const;

/** 中心から見た扇の番号（0〜7）。**八角の面に合わせて 45 度ずつ** */
function sectorOf(x: number, z: number): number {
  const a = (Math.atan2(z, x) * 180) / Math.PI + 180;
  return Math.min(7, Math.floor(a / 45));
}

/**
 * そこに書架の列が来るか。
 *
 * **扇ごとに向き（x 走り／z 走り）と間隔（3 か 4）を変える。**
 */
function isShelf(x: number, z: number, band: readonly [number, number], seed: number): boolean {
  const r = octR(x, z);
  if (r < band[0] || r > band[1]) return false;
  if (Math.abs(x) <= 2 || Math.abs(z) <= 2) return false;
  if (inWell(x, z, 1)) return false;
  const s = sectorOf(x, z);
  const across = s % 2 === 0 ? z : x;
  const along = s % 2 === 0 ? x : z;
  if ((across + s * 2 + 96) % (3 + (s % 3 === 0 ? 1 : 0)) !== 0) return false;
  // ---- 列の穴。**通り抜けられないと、ただの壁になる**
  return noise(seed, along, 1, across) >= 0.2;
}

/**
 * 1 階の書架。**高さは 3〜4**——2 階の回廊から見下ろして撃てる高さに抑える。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function shelvesLowOps(ops: BuildOp[]): void {
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (!isOpen(x, z) || !isShelf(x, z, LOW, SEED + 11)) continue;
      const n = noise(SEED + 23, x, 4, z);
      const top = n < 0.3 ? 3 : 4;
      ops.push(fill(x, 1, z, x, top, z, "bookshelf"));
      if (n > 0.92) ops.push(set(x, top, z, "chiseled_bookshelf"));
      else if (n < 0.06) ops.push(set(x, top, z, "web"));
      if (n > 0.85 && n < 0.9) ops.push(set(x, top + 1, z, "lantern"));
    }
  }
  rollingRails(ops);
  fallenOps(ops);
  desksOps(ops);
}

/**
 * 2 階の書架。**回廊の縁から 5 マス退げて置く。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function shelvesHighOps(ops: BuildOp[]): void {
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (!hasDeck(x, z) || Math.abs(x) <= 3 || Math.abs(z) <= 3) continue;
      if (!isShelf(x, z, HIGH, SEED + 13)) continue;
      const n = noise(SEED + 29, x, 12, z);
      ops.push(fill(x, DECK + 1, z, x, DECK + (n < 0.35 ? 2 : 3), z, "bookshelf"));
      if (n > 0.94) ops.push(set(x, DECK + 3, z, "chiseled_bookshelf"));
      if (n > 0.88 && n < 0.92) ops.push(set(x, DECK + 4, z, "lantern"));
    }
  }
}

/**
 * 可動書架のレール。**列の足元に敷く。**
 *
 * **書庫らしさは細部**——列が並ぶだけだと倉庫にしか見えない。
 */
function rollingRails(ops: BuildOp[]): void {
  for (const r of runsX((x, z) => isOpen(x, z) && isShelf(x, z, LOW, SEED + 11) && (x + z + 96) % 9 === 0)) {
    ops.push(fill(r.x, 1, r.z1, r.x, 1, r.z2, "rail"));
  }
}

/**
 * 倒れた書架と、散らばった本。
 *
 * **同じ形を並べない**（0-6）——倒れる向きも長さも 1 つずつ変える。
 */
function fallenOps(ops: BuildOp[]): void {
  const spots: readonly (readonly [number, number, number])[] = [
    [-15, -27, 5],
    [17, -21, 4],
    [-28, 6, 6],
    [26, 20, 5],
    [-19, 24, 4],
    [12, 30, 5],
    [-30, -8, 4],
    [30, -6, 6],
  ];
  spots.forEach(([x, z, len], i) => {
    const alongX = i % 2 === 0;
    for (let t = 0; t < len; t++) {
      const bx = alongX ? x + t : x;
      const bz = alongX ? z : z + t;
      if (!isOpen(bx, bz)) continue;
      ops.push(set(bx, 1, bz, t === len - 1 ? "chiseled_bookshelf" : "bookshelf"));
      if (t % 2 === 0) ops.push(set(bx, 2, bz, "bookshelf"));
    }
    // ---- 散らばった本。**周りに紙の色を撒く**
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const n = noise(SEED + 41, x + dx, 7, z + dz);
        if (n > 0.16 || !isOpen(x + dx, z + dz)) continue;
        ops.push(set(x + dx, 1, z + dz, n < 0.05 ? "brown_carpet" : n < 0.11 ? "white_carpet" : "light_gray_carpet"));
      }
    }
    ops.push(set(x, 1, z - 1, "web"));
  });
}

/**
 * 閲覧の机と燭台。**列の合間の空きに置く。**
 *
 * **机は板 1 段**にする——柵と半ブロックで組むと、
 * **通路の幅が読めなくなる**（0 章「絵でしか見つからない事故」）。
 */
function desksOps(ops: BuildOp[]): void {
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if ((x + 96) % 11 !== 0 || (z + 100) % 11 !== 0) continue;
      const r = octR(x, z);
      if (r < 11 || r > AMBULATORY_R - 2 || Math.abs(x) <= 4 || inWell(x, z, 2)) continue;
      if (isShelf(x, z, LOW, SEED + 11) || !isOpen(x, z)) continue;
      const n = noise(SEED + 47, x, 8, z);
      ops.push(fill(x, 1, z, x + 1, 1, z + 1, "dark_oak_planks"));
      ops.push(set(x, 2, z, "lectern"));
      ops.push(set(x + 1, 2, z + 1, n < 0.5 ? "candle" : "lantern"));
      // ---- 椅子。**階段ブロックの向きは既定のまま**——腰掛けに見えれば足りる
      ops.push(set(x - 1, 1, z, "dark_oak_stairs"));
      if (n > 0.6) ops.push(set(x + 1, 2, z, "chiseled_bookshelf"));
    }
  }
}
