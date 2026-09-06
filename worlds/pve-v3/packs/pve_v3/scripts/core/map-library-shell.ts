/**
 * 16. 大書庫——**外殻。** 八角の塊を置き、中を彫り、面を張る。
 *
 * 間取りは `map-library-plan.ts`。**意匠は他のファイル。**
 *
 * ```
 * massOps()    八角の塊と段丘の屋根を置く（まだ何も彫っていない）
 * hollowOps()  部屋のぶんだけ中を彫る（床・空・天井を一度に決める）
 * faceOps()    彫り口の面を石に張り替え、吹き抜けの縁に蛇腹を回す
 * ```
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import {
  ATRIUM_R,
  CEIL_A,
  DECK_R,
  INNER_R,
  ALCOVE_CEIL,
  CEIL_1,
  MASS_BOT,
  MASS_R,
  ROOF,
  SEED,
  WALL_R,
  ceilOf,
  inAlcove,
  inMass,
  isOpen,
  octR,
  ringOf,
  roofTop,
  runsX,
} from "./map-library-plan.js";
import { ceilAt, floorAt, stoneAt } from "./map-library-mat.js";

/**
 * 八角の塊と、段丘の屋根。
 *
 * **副作用: `ops` に手順を足す。**
 *
 * **屋根は 1 マスずつの段丘**（`roofTop`）——2 マス上げると、
 * そこから内側が丸ごと「歩いて行けない面」になって 0-8 に落ちる。
 */
export function massOps(ops: BuildOp[]): void {
  // ---- 塊。**まず基準の高さまで平らに埋める**
  for (const r of runsX(inMass, MASS_R)) {
    ops.push(fill(r.x, MASS_BOT, r.z1, r.x, ROOF, r.z2, "stone"));
  }
  // ---- 段丘。**内側ほど 1 段ずつ高い**
  for (const [step, lim] of [
    [1, 36],
    [2, 28],
    [3, 18],
  ] as const) {
    for (const r of runsX((x, z) => octR(x, z) <= lim, lim)) {
      ops.push(fill(r.x, ROOF + step, r.z1, r.x, ROOF + step, r.z2, "stone_bricks"));
    }
  }
  roofFace(ops);
  outerFace(ops);
}

/**
 * 外壁の面。**付け柱と窪み、腰と胴の帯。**
 *
 * **平らな一枚壁は、それ自体が手抜き**（0-4）。
 * **窪みは 1 マスだけ**——壁は 5 マス厚なので、彫っても外へは抜けない。
 * **窪みの上下は残す**ので、屋根の縁が浮くこともない（0-5）。
 */
function outerFace(ops: BuildOp[]): void {
  ringOf(MASS_R).forEach((p, i) => {
    ops.push(fill(p.x, MASS_BOT, p.z, p.x, ROOF, p.z, "stone_bricks"));
    ops.push(fill(p.x, MASS_BOT, p.z, p.x, 2, p.z, "polished_andesite"));
    if (i % 5 === 0) {
      // ---- 付け柱。**5 マスに 1 本、天まで通す**
      ops.push(fill(p.x, 3, p.z, p.x, ROOF, p.z, "chiseled_stone_bricks"));
      return;
    }
    ops.push(fill(p.x, 7, p.z, p.x, 16, p.z, "air"));
    for (const y of [3, 6, 17, 20, ROOF]) ops.push(set(p.x, y, p.z, "polished_andesite"));
  });
}

/**
 * 屋根の天面。**段丘の縁に帯を回し、まだらを撒く。**
 *
 * **石を積んだだけの円盤にしない**（0-4 の「垂直な壁ほど意匠で見せる」）。
 */
function roofFace(ops: BuildOp[]): void {
  for (const r of [44, 38, 36, 30, 28, 20, 18]) {
    for (const p of ringOf(r)) ops.push(set(p.x, roofTop(p.x, p.z), p.z, "polished_andesite"));
  }
  for (let x = -MASS_R; x <= MASS_R; x++) {
    for (let z = -MASS_R; z <= MASS_R; z++) {
      if (!inMass(x, z)) continue;
      const n = noise(SEED + 61, x, 2, z);
      if (n > 0.14) continue;
      ops.push(set(x, roofTop(x, z), z, n < 0.05 ? "andesite" : "cobblestone"));
    }
  }
}

/**
 * 部屋のぶんだけ中を彫る。**床・空・天井を一度に決める。**
 *
 * **副作用: `ops` に手順を足す。**
 *
 * **同じ天井が続く z は 1 手にまとめる**（`runsX`）——
 * 柱ごとに置くと、床だけで 5 千手を超える。
 */
export function hollowOps(ops: BuildOp[]): void {
  for (const lvl of [ATRIUM_R, INNER_R]) {
    const lo = lvl === ATRIUM_R ? 0 : ATRIUM_R + 1;
    const pick = (x: number, z: number): boolean => {
      const r = octR(x, z);
      return r >= lo && r <= lvl;
    };
    const ceil = lvl === ATRIUM_R ? CEIL_A : CEIL_1;
    for (const r of runsX(pick)) {
      ops.push(fill(r.x, 1, r.z1, r.x, ceil - 1, r.z2, "air"));
      ops.push(fill(r.x, 0, r.z1, r.x, 0, r.z2, "dark_oak_planks"));
      ops.push(fill(r.x, ceil, r.z1, r.x, ceil, r.z2, "dark_oak_planks"));
    }
  }
  // ---- 玄関の窪み。**壁の中を彫る**（`inAlcove` の理由はそちらに書いた）
  for (const r of runsX(inAlcove, MASS_R)) {
    ops.push(fill(r.x, 1, r.z1, r.x, ALCOVE_CEIL - 1, r.z2, "air"));
    ops.push(fill(r.x, 0, r.z1, r.x, 0, r.z2, "stone_bricks"));
    ops.push(fill(r.x, ALCOVE_CEIL, r.z1, r.x, ALCOVE_CEIL, r.z2, "chiseled_stone_bricks"));
  }
  surfaces(ops);
}

/**
 * 床と天井のまだら。**3 割だけ差し替える。**
 *
 * **全マス置くと手順が倍になる**ので、引き当てたものだけ上書きする（0-7）。
 */
function surfaces(ops: BuildOp[]): void {
  for (let x = -MASS_R; x <= MASS_R; x++) {
    for (let z = -MASS_R; z <= MASS_R; z++) {
      const ceil = ceilOf(x, z);
      if (ceil === 0) continue;
      const f = floorAt(x, z);
      if (f !== "dark_oak_planks") ops.push(set(x, 0, z, f));
      // ---- 吹き抜けの天井は石。**下の板張りと対比させる**
      if (ceil === CEIL_A) ops.push(set(x, ceil, z, stoneAt(x, ceil, z)));
      else {
        const c = ceilAt(x, z);
        if (c !== "dark_oak_planks") ops.push(set(x, ceil, z, c));
      }
    }
  }
}

/**
 * 彫り口の面を張り替え、吹き抜けの縁に蛇腹を回す。
 *
 * **副作用: `ops` に手順を足す。**
 *
 * **掘りっぱなしの生石を見せない**——書庫は人の建てたものなので、
 * 面は積んだ石でなければならない。**1 マスごとに苔とひびを引く**（0-7）。
 */
export function faceOps(ops: BuildOp[]): void {
  for (const p of ringOf(WALL_R)) {
    // **窪みの口は塞がない**——ここを埋めると湧く所が閉じる
    if (isOpen(p.x, p.z)) continue;
    ops.push(fill(p.x, 0, p.z, p.x, CEIL_1, p.z, "stone_bricks"));
    for (let y = 0; y <= 18; y++) {
      const b = stoneAt(p.x, y, p.z);
      if (b !== "stone_bricks") ops.push(set(p.x, y, p.z, b));
    }
  }
  cornice(ops);
  atriumRibs(ops);
}

/**
 * 吹き抜けの縁の蛇腹。
 *
 * **2 階の天井（18）と吹き抜けの天井（22）の段差**が、
 * そのままだと 4 マスの切りっぱなしの帯になる。**輪郭を付けて見せる。**
 */
function cornice(ops: BuildOp[]): void {
  for (const p of ringOf(DECK_R)) {
    ops.push(fill(p.x, 18, p.z, p.x, 21, p.z, "polished_andesite"));
    ops.push(set(p.x, 18, p.z, "stripped_dark_oak_log"));
    ops.push(set(p.x, 21, p.z, "chiseled_stone_bricks"));
  }
  // ---- 縁の少し内側に、持ち送りの笠。**板の端を丸く見せる**
  for (const p of ringOf(ATRIUM_R)) {
    ops.push(set(p.x, 21, p.z, "dark_oak_slab"));
  }
}

/**
 * 吹き抜けの天井の骨。**中心から放射状に木の筋を通す。**
 *
 * **平らな一枚天井は、平らな一枚壁と同じで手抜きに見える**（0-4）。
 */
function atriumRibs(ops: BuildOp[]): void {
  for (let a = 0; a < 16; a++) {
    const rad = (a * Math.PI) / 8;
    for (let d = 3; d <= ATRIUM_R; d++) {
      const x = Math.round(Math.cos(rad) * d);
      const z = Math.round(Math.sin(rad) * d);
      if (octR(x, z) > ATRIUM_R) break;
      ops.push(set(x, CEIL_A, z, "stripped_dark_oak_log"));
    }
  }
  // ---- 中央の花形。**天球儀を吊る所の真上**
  for (let x = -2; x <= 2; x++) {
    for (let z = -1; z <= 3; z++) {
      if (Math.abs(x) + Math.abs(z - 1) > 2) continue;
      ops.push(set(x, CEIL_A, z, "chiseled_stone_bricks"));
    }
  }
}

/**
 * 湧く所の床を引き直す。
 *
 * **副作用: `ops` に手順を足す。**
 *
 * **`spawnPad` は無地の 11 × 11 を敷く**ので、そのままだと玄関の床だけ
 * 塗り絵に見える（`map-stronghold.ts` と同じ理由）。
 */
export function spawnFloorOps(ops: BuildOp[]): void {
  for (let x = -5; x <= 5; x++) {
    for (let z = -45; z <= -35; z++) {
      if (!isOpen(x, z)) continue;
      ops.push(set(x, 0, z, floorAt(x, z)));
    }
  }
  // ---- 玄関の紋章。**輪を 2 重に敷いて、正面だと分かるようにする**
  for (let x = -5; x <= 5; x++) {
    for (let z = -43; z <= -33; z++) {
      const d = Math.hypot(x, z + 38);
      if (d > 4.6) continue;
      const b =
        d < 1.5
          ? "chiseled_stone_bricks"
          : d < 2.6
            ? "polished_andesite"
            : d < 3.6
              ? "dark_oak_planks"
              : "stone_bricks";
      ops.push(set(x, 0, z, b));
    }
  }
}
