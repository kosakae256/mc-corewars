/**
 * ネザー要塞の**十字の橋**と、**ゲートまでの回廊**。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 9 番。決まりは `spec/14-map-build.md` 0 章。
 *
 * ```
 *   z 15 … 22   十字の橋。左右へ張り出し、先端は円い稜堡
 *   z 23 … 38   回廊。控え壁の並ぶ壁に挟まれ、上を大きな迫りが跨ぐ
 *   z 39        ゲートの面。**箱（±1, 1〜5）は空ける**（0-2-1）
 *   z 40 … 44   ゲートの背。**塞ぐ**——裏へ回れるポータルは置く意味がない（0-3）
 * ```
 */

import { fill, set, type BuildOp } from "./build.js";
import { GATE_Z, noise } from "./map-frame.js";
import {
  brickCap,
  CREST,
  DECK,
  deckAt,
  lavaFall,
  pinnacle,
  podium,
  railing,
  ribArch,
  paveCap,
  rimCap,
  ruinCap,
  steppedPad,
  wall,
} from "./map-fortress-parts.js";
import { ROCK_TOP, SEED, inSea } from "./map-fortress-sea.js";

/** 十字の橋 */
const CROSS = { x: 29, solid: 13, z1: 15, z2: 22 } as const;

/**
 * ゲートまでの回廊。
 *
 * **奥は島の縁まで詰める。** ゲートの背に溶岩の帯を残すと、
 * **そこだけ島から切り離されて「登れない面」になる**（0-8）。
 */
const KEEP = { x: 13, z1: 23, z2: 46 } as const;

/**
 * 十字の橋。
 *
 * **真ん中は塊、外は橋。** 中庭と回廊に挟まれた所は下まで詰め、
 * **張り出した所だけ橋脚で支える**——アーチが並んで見えるのは外側だけでよい。
 */
/** その x における橋の幅。**先へ行くほど細くする**——太いままだと塊に見える */
function crossZ(x: number): readonly [number, number] {
  const t = Math.abs(x) > 21 ? 1 : 0;
  return [CROSS.z1 + t, CROSS.z2 - t];
}

function crossing(ops: BuildOp[]): void {
  const piers = [-25, -19, 20, 26];
  for (let x = -CROSS.x; x <= CROSS.x; x++) {
    const outer = Math.abs(x) > CROSS.solid;
    const [cz1, cz2] = crossZ(x);
    for (let z = cz1; z <= cz2; z++) {
      if (!inSea(x, z)) continue;
      if (outer) deckAt(ops, x, z, paveCap(x, z));
      else podium(ops, x, z, DECK, Math.abs(x) >= 8 ? paveCap(x, z) : brickCap(x, z));
    }
    if (!outer) continue;
    if (piers.includes(x)) {
      ops.push(fill(x, ROCK_TOP, cz1 + 1, x, DECK - 3, cz2 - 1, "nether_brick"));
      continue;
    }
    // 迫り持ちの肉。**橋脚から離れるほど薄くする**——下から見上げるとアーチになる
    const near = piers.reduce((a, p) => Math.min(a, Math.abs(x - p)), 99);
    const u = Math.min(1, near / 3.5);
    const soffit = DECK - 3 - Math.round(6 * (1 - Math.sqrt(Math.max(0, 1 - u * u))));
    for (const z of [cz1 + 1, cz1 + 2, cz2 - 2, cz2 - 1]) {
      ops.push(fill(x, soffit, z, x, DECK - 3, z, "nether_brick"));
    }
  }
}

/** 橋の欄干と、上を跨ぐ迫り。**中軸（x ＝ 0）には渡さない**（0-3） */
function crossRibs(ops: BuildOp[]): void {
  for (let x = -CROSS.x; x <= CROSS.x; x++) {
    if (Math.abs(x) <= 5 || noise(SEED + 81, x, 0) > 0.82) continue;
    const [cz1, cz2] = crossZ(x);
    railing(ops, x, cz1);
    railing(ops, x, cz2);
  }
  for (const [at, crown, cut] of [
    [-23, 5, undefined],
    [-12, 4, undefined],
    [11, 5, 20],
    [22, 4, undefined],
  ] as const) {
    ribArch(ops, { along: "z", at, from: CROSS.z1, to: CROSS.z2, foot: DECK + 1, crown: DECK + crown, cut });
  }
  steppedPad(ops, -32, 18, 6, 3);
  steppedPad(ops, 32, 19, 6, 3);
  for (const [x, z, base, h] of [
    [-32, 18, 3, 7],
    [32, 19, 3, 6],
    [-14, 16, 1, 4],
    [16, 21, 1, 5],
  ] as const) {
    pinnacle(ops, x, z, DECK + base, DECK + h, "glowstone");
  }
  lavaFall(ops, -CROSS.x - 1, 17, DECK - 3);
  lavaFall(ops, CROSS.x + 1, 20, DECK - 3);
}

/** 回廊の基壇と壁。**控え壁が甲板まで降りるので、天端まで登れる**（0-8） */
function corridor(ops: BuildOp[]): void {
  for (let x = -KEEP.x; x <= KEEP.x; x++) {
    for (let z = KEEP.z1; z <= KEEP.z2; z++) {
      if (!inSea(x, z)) continue;
      const worn = noise(SEED + 85, x, z);
      const rim = Math.abs(x) === KEEP.x || !inSea(x + 1, z) || !inSea(x - 1, z) || !inSea(x, z + 1);
      const cap = rim ? rimCap(x, z) : Math.abs(x) >= 8 ? paveCap(x, z) : worn > 0.86 ? ruinCap(x, z) : brickCap(x, z);
      podium(ops, x, z, DECK, cap);
    }
  }
  for (const s of [1, -1]) {
    wall(ops, {
      along: "z",
      at: 6 * s,
      out: s,
      from: KEEP.z1 + 1,
      to: GATE_Z,
      crest: CREST,
      thick: 2,
      step: s > 0 ? 6 : 7,
    });
  }
  // 回廊の床の筋。**奥（ゲート）へ向かって走らせる**
  for (const x of [-4, -1, 3]) ops.push(fill(x, DECK, KEEP.z1, x, DECK, GATE_Z - 2, "red_nether_brick"));
  for (const [x, z, h] of [
    [-5, 27, 4],
    [5, 31, 4],
    [-5, 35, 3],
    [5, 25, 3],
  ] as const) {
    pinnacle(ops, x, z, DECK + 1, DECK + h, "glowstone");
  }
}

/** 回廊を跨ぐ大きな迫り。**線（0-3）の上を通す**ので、迫り元は壁の天端 */
function corridorRibs(ops: BuildOp[]): void {
  for (const [at, crown, g1, g2] of [
    [27, 3, -1, 1],
    [31, 4, 1, 4],
    [36, 3, -3, -1],
  ] as const) {
    ribArch(ops, { along: "x", at, from: -7, to: 7, foot: CREST, crown: CREST + crown, gap: [g1, g2] });
    ops.push(set(g1 - 1, CREST + crown, at, "glowstone"));
  }
}

/**
 * ゲートの正面。
 *
 * > ### **ポータルは置かない**（0-2-1）
 * >
 * > **箱（±1, y 1〜5, z 39）は空けておく。** ゲートは倒し切ったときに進行の側が置く。
 * > **飾りは箱の外側**——枠・楣・灯りだけをここで積む。
 *
 * **|x| ≦ 6 かつ z ≧ 39 は 0-8 の対象外**なので、ここだけは高く積んでよい。
 */
function facade(ops: BuildOp[]): void {
  for (let x = -6; x <= 6; x++) {
    const near = 6 - Math.abs(x);
    for (let z = GATE_Z; z <= KEEP.z2; z++) {
      if (!inSea(x, z)) continue;
      const top = DECK + 8 + near + Math.max(0, 4 - Math.abs(z - (GATE_Z + 2)));
      ops.push(fill(x, DECK, z, x, top - 1, z, "nether_brick"));
      ops.push(set(x, top, z, noise(SEED + 91, x, z) > 0.72 ? "chiseled_nether_bricks" : "red_nether_brick"));
    }
  }
  // 門の枠。**箱のすぐ外を彫りの入った煉瓦で囲う**
  for (let y = DECK; y <= DECK + 6; y++) {
    for (const x of [-2, 2]) ops.push(set(x, y, GATE_Z, "chiseled_nether_bricks"));
  }
  ops.push(fill(-2, DECK + 6, GATE_Z, 2, DECK + 6, GATE_Z, "chiseled_nether_bricks"));
  ops.push(fill(-1, DECK + 7, GATE_Z, 1, DECK + 7, GATE_Z, "glowstone"));
  ops.push(fill(-4, DECK + 9, GATE_Z, 4, DECK + 9, GATE_Z, "red_nether_brick"));
  for (const [x, z, h] of [
    [-5, GATE_Z + 2, 20],
    [5, GATE_Z + 3, 18],
    [-3, GATE_Z + 5, 16],
    [3, GATE_Z + 4, 17],
  ] as const) {
    pinnacle(ops, x, z, DECK + 10, DECK + h, "glowstone");
  }
  ribArch(ops, { along: "x", at: GATE_Z - 1, from: -7, to: 7, foot: CREST, crown: CREST + 4, gap: [-2, 1] });
  for (const [x, z] of [
    [-4, GATE_Z - 3],
    [4, GATE_Z - 3],
  ] as const) {
    pinnacle(ops, x, z, DECK + 1, DECK + 4, "magma");
  }
}

/** 十字の橋・回廊・ゲートの正面を組む。**手順を `ops` に足す** */
export function keepOps(ops: BuildOp[]): void {
  crossing(ops);
  corridor(ops);
  crossRibs(ops);
  corridorRibs(ops);
  facade(ops);
}
