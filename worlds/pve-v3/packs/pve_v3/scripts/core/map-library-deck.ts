/**
 * 16. 大書庫——**2 階の回廊。** 床・縁桁・手すり・持ち送り・梁・柱。
 *
 * 間取りは `map-library-plan.ts`。**上がる道は `map-library-stair.ts`。**
 *
 * > ### **縁は形から拾う**
 * >
 * > 吹き抜け・身廊の割れ・階段の抜き穴で、縁の形が場所ごとに違う。
 * > **座標で書き並べると、間取りを変えたときに必ずずれる。**
 * > **「床が有って、隣に床の無い部屋がある」所**を縁とする。
 *
 * > ### **降り口には手すりを立てない**
 * >
 * > **立てると 2 階へ上がれなくなる**（`isLanding`）。
 */

import { fill, set, type BuildOp } from "./build.js";
import {
  ATRIUM_R,
  CEIL_1,
  DECK,
  DECK_R,
  INNER_R,
  hasDeck,
  inNaveSlot,
  inWell,
  isBridge,
  isLanding,
  isOpen,
  octR,
  ringOf,
  runsX,
  runsZ,
} from "./map-library-plan.js";
import { deckAt } from "./map-library-mat.js";

/** 上下左右の 4 方向 */
const AROUND: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * 2 階の床と、その縁。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function deckOps(ops: BuildOp[]): void {
  for (const r of runsX(hasDeck)) ops.push(fill(r.x, DECK, r.z1, r.x, DECK, r.z2, "dark_oak_planks"));
  // ---- 板のまだら。**引き当てたものだけ差し替える**（手順を倍にしない）
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (!hasDeck(x, z)) continue;
      const b = deckAt(x, z);
      if (b !== "dark_oak_planks") ops.push(set(x, DECK, z, b));
    }
  }
  edgeOps(ops);
  ceilBeams(ops);
  postsOps(ops);
  runnerOps(ops);
  underLights(ops);
}

/** そこが回廊の縁か。**隣に「床の無い部屋」が有る所** */
function isDeckEdge(x: number, z: number): boolean {
  return AROUND.some(([dx, dz]) => isOpen(x + dx, z + dz) && !hasDeck(x + dx, z + dz));
}

/**
 * 回廊の敷物。**縁から 2 マス内に、赤い帯を一周させる。**
 *
 * **2 階の床は一面の板**で、絵にすると平らな茶色にしかならなかった（0-8-1）。
 * **帯を 1 本通すと、歩く筋がそこだと分かる。**
 */
function runnerOps(ops: BuildOp[]): void {
  for (const p of ringOf(DECK_R + 2)) {
    if (!hasDeck(p.x, p.z) || isDeckEdge(p.x, p.z)) continue;
    ops.push(set(p.x, DECK + 1, p.z, "red_carpet"));
  }
}

/**
 * 1 階の吊り灯り。**2 階の床の裏に下げる。**
 *
 * **書架の間は天井（＝2 階の床）が 8 マスで低く、奥が真っ暗**だった。
 * **床の裏から吊れば、列の間にも光が回る。**
 */
function underLights(ops: BuildOp[]): void {
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (!hasDeck(x, z) || (x + 102) % 6 !== 0 || (z + 102) % 6 !== 0) continue;
      ops.push(set(x, DECK - 1, z, "lantern"));
    }
  }
}

/**
 * 回廊の縁——**縁桁・手すり・持ち送り。**
 *
 * **切りっぱなしの板の端を見せない。** 縁桁で締め、下に腕木を出す。
 *
 * **縁は形から拾う**（吹き抜け・身廊の割れ・階段の抜き穴で形が違うため）——
 * **床が有って、隣に「床の無い部屋」がある所**が縁。
 */
function edgeOps(ops: BuildOp[]): void {
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (!hasDeck(x, z)) continue;
      if (!isDeckEdge(x, z)) continue;
      ops.push(set(x, DECK, z, "stripped_dark_oak_log"));
      // **降り口だけは立てない**——塞ぐと 2 階へ上がれなくなる
      if (isLanding(x, z)) continue;
      ops.push(set(x, DECK + 1, z, "dark_oak_fence"));
      // ---- 手すりの合間に燭台。**吹き抜けを見下ろす所を明るくする**
      if ((x + z + 128) % 7 === 0) ops.push(set(x, DECK + 2, z, "lantern"));
    }
  }
  corbels(ops);
}

/**
 * 持ち送り。**縁より 1 マス外へ笠を出し、4 マスに 1 本腕木を下ろす。**
 *
 * **階段の抜き穴には出さない**——頭がつかえて上がれなくなる。
 */
function corbels(ops: BuildOp[]): void {
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (hasDeck(x, z) || !isOpen(x, z) || inWell(x, z)) continue;
      if (!AROUND.some(([dx, dz]) => hasDeck(x + dx, z + dz))) continue;
      ops.push(set(x, DECK, z, "dark_oak_slab"));
      if ((x + z + 128) % 4 === 0) ops.push(set(x, DECK - 1, z, "stripped_dark_oak_log"));
    }
  }
}

/**
 * 2 階の天井の梁。**格間（こうま）に割る。**
 *
 * **平らな一枚天井は手抜きに見える**（0-4）。**帯にまとめて置く**ので手順は軽い。
 */
function ceilBeams(ops: BuildOp[]): void {
  const wing = (x: number, z: number): boolean => octR(x, z) > ATRIUM_R && octR(x, z) <= INNER_R;
  for (const r of runsX((x, z) => wing(x, z) && (x + 96) % 6 === 0)) {
    ops.push(fill(r.x, CEIL_1, r.z1, r.x, CEIL_1, r.z2, "stripped_dark_oak_log"));
  }
  for (const r of runsZ((x, z) => wing(x, z) && (z + 96) % 6 === 0)) {
    ops.push(fill(r.x1, CEIL_1, r.z, r.x2, CEIL_1, r.z, "stripped_dark_oak_log"));
  }
  // ---- 格間の真ん中に明かり。**面から出さない**（出っ張らせると視線に当たる）
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (!wing(x, z) || (x + 99) % 12 !== 0 || (z + 99) % 12 !== 0) continue;
      ops.push(set(x, CEIL_1, z, "glowstone"));
    }
  }
}

/**
 * 2 階の床を支える柱。**書架の列を貫いて立つ。**
 *
 * **支えのない床を張らない**（0-5 の「浮いている岩を作らない」）。
 * **身廊（|x| ≦ 2）には立てない**——0-3 の線が通る。
 */
function postsOps(ops: BuildOp[]): void {
  const post = (x: number, z: number): void => {
    ops.push(fill(x, 1, z, x, DECK - 1, z, "stripped_dark_oak_log"));
    ops.push(set(x, 1, z, "polished_andesite"));
    ops.push(set(x, DECK - 1, z, "dark_oak_planks"));
  };
  for (let x = -INNER_R; x <= INNER_R; x++) {
    for (let z = -INNER_R; z <= INNER_R; z++) {
      if (Math.abs(x) <= 2 || (x + 96) % 8 !== 0 || (z + 96) % 8 !== 0) continue;
      if (hasDeck(x, z) && !inWell(x, z, 1)) post(x, z);
      // ---- 橋の下にも通す。**42 マスを支え無しで渡さない**
      else if (isBridge(x, z) && octR(x, z) <= ATRIUM_R) post(x, z);
    }
  }
  navePosts(ops, post);
}

/**
 * 身廊を挟む列柱。**割れた 2 階の床の端を、下から受ける。**
 *
 * **身廊は両脇が書架の壁で、絵にすると単調だった**（0-8-1）。
 * **4 マスおきに柱を立てると、奥行きが読める。**
 */
function navePosts(ops: BuildOp[], post: (x: number, z: number) => void): void {
  for (let z = -INNER_R; z <= INNER_R; z++) {
    if (!inNaveSlot(0, z) || (z + 100) % 4 !== 0) continue;
    for (const x of [-5, 5]) {
      if (hasDeck(x, z)) post(x, z);
    }
  }
}
