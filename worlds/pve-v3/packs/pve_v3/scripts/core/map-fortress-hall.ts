/**
 * ネザー要塞の**広間**と**中庭**。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 9 番。決まりは `spec/14-map-build.md` 0 章。
 *
 * ```
 *   x −20 … −16   歩廊（外を一周する）
 *   x −15, −14    外壁（天端 6・控え壁が甲板まで降りる）
 *   x −13 … −7    側廊（屋根 6・ところどころ抜けている）
 *   x −6          柱列。柱と柱の間は迫り持ち
 *   x −5 … +5     身廊。**天井を張らない**——中軸は空けておく（0-3）
 * ```
 *
 * > ### 屋根を「登れる」ようにしてある
 * >
 * > **0-8 は、湧く所から 1 マスずつ登って届く面しか認めない。**
 * > 甲板 → 控え壁 → 外壁の天端 → 屋根、と**段が繋がっている。**
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise, wave } from "./map-frame.js";
import {
  brickCap,
  CREST,
  DECK,
  lavaFall,
  pinnacle,
  podium,
  ribArch,
  paveCap,
  rimCap,
  ruinCap,
  steppedPad,
  wall,
} from "./map-fortress-parts.js";
import { SEED, inSea } from "./map-fortress-sea.js";

/** 広間の外まわり。**歩廊まで含めた基壇。** 東の斜面はこの縁から落とす */
export const HALL = { x: 20, z1: -17, z2: 5 } as const;

/** 側廊の屋根 */
const AISLE = { in: 7, out: 13, z1: -13, z2: 1 } as const;

/** 基壇を敷く。**縁の外は溶岩**なので、島の内側だけ。**歩廊は敷石**にして壁と分ける */
function floor(ops: BuildOp[], hx: number, z1: number, z2: number, pave: number): void {
  for (let x = -hx; x <= hx; x++) {
    for (let z = z1; z <= z2; z++) {
      if (!inSea(x, z)) continue;
      const worn = wave(SEED + 35, x, z, 13);
      // **溶岩に面した縁だけ焼ける。** 輪郭が出て、塊に見えなくなる
      const rim = Math.abs(x) === hx || !inSea(x + 1, z) || !inSea(x - 1, z) || !inSea(x, z + 1) || !inSea(x, z - 1);
      const cap = rim
        ? rimCap(x, z)
        : Math.abs(x) >= pave
          ? paveCap(x, z)
          : worn < -0.4
            ? ruinCap(x, z)
            : brickCap(x, z);
      podium(ops, x, z, DECK, cap);
    }
  }
}

/** 外壁 4 枚。**横の 2 枚にだけ控え壁を付ける**——天端は隅で繋がるので、それで届く */
function walls(ops: BuildOp[]): void {
  for (const s of [1, -1]) {
    wall(ops, {
      along: "z",
      at: 14 * s,
      out: s,
      from: HALL.z1,
      to: HALL.z2,
      crest: CREST,
      thick: 2,
      step: 7,
      // **側廊の端に潜り戸。** ここが無いと外の歩廊へ出られない
      gap: s > 0 ? [2, 3] : [-15, -14],
    });
  }
  wall(ops, { along: "x", at: -16, out: -1, from: -15, to: 15, crest: CREST, thick: 2, step: 0, gap: [-5, 5] });
  wall(ops, { along: "x", at: 4, out: 1, from: -15, to: 15, crest: CREST, thick: 2, step: 0, gap: [-5, 5] });
}

/**
 * 柱列と、その上の迫り持ち。
 *
 * 柱は **1 マス角**。太くすると天端がまとまって残り、0-8 で落ちる。
 * 柱の間は**楣（まぐさ）を 2 段**にして、柱の脇だけ 1 段下げ、迫りの肩を作る。
 */
function arcade(ops: BuildOp[]): void {
  const piers = [-13, -10, -7, -3, 1];
  for (const s of [1, -1]) {
    const x = 6 * s;
    for (let z = AISLE.z1; z <= AISLE.z2; z++) {
      const near = piers.reduce((a, p) => Math.min(a, Math.abs(z - p)), 99);
      if (near === 0) {
        ops.push(fill(x, DECK + 1, z, x, CREST - 1, z, "nether_brick"));
        ops.push(set(x, CREST, z, "chiseled_nether_bricks"));
        continue;
      }
      const head = near === 1 ? CREST - 2 : CREST - 1;
      ops.push(fill(x, head, z, x, CREST - 1, z, "nether_brick"));
      ops.push(set(x, CREST, z, brickCap(x, z, CREST)));
    }
  }
}

/**
 * 側廊の屋根。**外壁の天端と同じ高さ**にして、そのまま歩いて渡れるようにする。
 *
 * **抜けは 1 列だけ**（長さ 3 まで）。2 列抜くと、床が 4 マス以上まとまって
 * 取り残され、**0-8 の「登れない面」に数えられてしまう。**
 */
function roof(ops: BuildOp[]): void {
  for (const s of [1, -1]) {
    const x1 = Math.min(AISLE.in * s, AISLE.out * s);
    const x2 = Math.max(AISLE.in * s, AISLE.out * s);
    for (let z = AISLE.z1; z <= AISLE.z2; z++) {
      ops.push(fill(x1, CREST, z, x2, CREST, z, "nether_brick"));
      // **屋根は壁より明るく、筋を通す。**
      // 同じ黒レンガのままだと、上から見たときに壁と見分けが付かず、ただの塊になる
      const band = ((z % 4) + 4) % 4 === 0;
      for (let x = x1; x <= x2; x++) {
        const r = noise(SEED + 57, x, z);
        const cap =
          r > 0.93
            ? "glowstone"
            : band
              ? "red_nether_brick"
              : r > 0.74
                ? "blackstone"
                : r > 0.5
                  ? "cracked_nether_bricks"
                  : "nether_brick";
        ops.push(set(x, CREST, z, cap));
      }
    }
    // 棟。**1 マスの筋**なので、屋根から 1 段で上がれる
    const ridge = 10 * s;
    ops.push(fill(ridge, CREST + 1, AISLE.z1 + 1, ridge, CREST + 1, AISLE.z2 - 2, "nether_brick"));
    ops.push(set(ridge, CREST + 1, AISLE.z1 + 3, "chiseled_nether_bricks"));
  }
  // 落ちた屋根。**梁が抜けて、そこから光が落ちる**
  for (const [x1, x2, z] of [
    [8, 10, -11],
    [-15, -13, -5],
    [9, 11, 0],
  ] as const) {
    ops.push(fill(x1, CREST, z, x2, CREST, z, "air"));
  }
}

/** 身廊の中身。**壇と火皿。** 中軸（x ＝ 0）には何も立てない（0-3） */
function nave(ops: BuildOp[]): void {
  for (let x = -3; x <= 3; x++) {
    for (let z = -8; z <= -3; z++) {
      const rim = Math.abs(x) === 3 || z === -8 || z === -3;
      ops.push(set(x, DECK + 1, z, rim ? "chiseled_nether_bricks" : "red_nether_brick"));
    }
  }
  for (const [x, z] of [
    [-3, -8],
    [3, -3],
  ] as const) {
    pinnacle(ops, x, z, DECK + 2, DECK + 4, "glowstone");
  }
  for (const [x, z, h] of [
    [-4, -12, 3],
    [4, -10, 4],
    [-4, 1, 4],
    [4, -1, 3],
    [-2, 3, 3],
  ] as const) {
    pinnacle(ops, x, z, DECK + 1, DECK + h, noise(SEED + 63, x, z) > 0.5 ? "magma" : "glowstone");
  }
  // 身廊の床の帯。**縦縞にして、奥（ゲート側）へ目を向かせる**
  for (const x of [-5, -1, 2, 5]) ops.push(fill(x, DECK, -15, x, DECK, 3, "red_nether_brick"));
}

/**
 * 門の上の大きな迫り。**中軸を跨ぐので、線（0-3）より高い所に置く。**
 *
 * **どれも要石が落ちている。** 塞いだ迫りは、
 * **下をくぐれても検査の上では道を断つ**（`RibSpec.gap`）。
 * 抜け方を 1 本ずつ変えて、揃った並びにしない（0-6）。
 */
function gates(ops: BuildOp[]): void {
  ribArch(ops, { along: "x", at: -16, from: -6, to: 6, foot: CREST, crown: CREST + 3, gap: [-1, 1] });
  ribArch(ops, { along: "x", at: -17, from: -6, to: 6, foot: CREST, crown: CREST + 2, gap: [0, 2] });
  // **奥の門は 2 列とも同じ所を抜く。** ずらすと、抜けの重ならない所で道が切れる
  ribArch(ops, { along: "x", at: 5, from: -6, to: 6, foot: CREST, crown: CREST + 3, gap: [3, 5] });
  ribArch(ops, { along: "x", at: 4, from: -6, to: 6, foot: CREST, crown: CREST + 2, cut: 2 });
}

/**
 * 隅櫓。**壁の天端から 1 マスずつ上がる段の塔。**
 *
 * > ### 太い塔は「登れない面」になる
 * >
 * > 3 × 3 の平らな屋根は、**天端が 9 マスまとまって残り 0-8 で落ちる。**
 * > **段にすれば登れる。** 頂の 1 マスだけ尖塔を伸ばして高さを出す。
 *
 * 大きさと高さを 1 つずつ変える（0-6）——同じ塔を 4 つ並べない。
 */
function turrets(ops: BuildOp[]): void {
  // **潜り戸（側廊の端）には掛けない。** 塞ぐと外の歩廊へ出られなくなる（0-8）
  for (const [cx, cz, r, rise, spire] of [
    [-15, -10, 3, 2, 13],
    [15, -15, 2, 2, 11],
    [-15, 3, 2, 2, 10],
    [15, -3, 3, 3, 14],
  ] as const) {
    steppedPad(ops, cx, cz, r, rise, CREST);
    pinnacle(ops, cx, cz, CREST + rise, DECK + spire, "glowstone");
  }
}

/** 広間を組む。**手順を `ops` に足す** */
export function hallOps(ops: BuildOp[]): void {
  floor(ops, HALL.x, HALL.z1, HALL.z2, 16);
  walls(ops);
  arcade(ops);
  roof(ops);
  nave(ops);
  gates(ops);
  turrets(ops);
  for (const [x, z] of [
    [-20, -6],
    [20, -12],
    [19, 2],
  ] as const) {
    lavaFall(ops, x, z, DECK - 1);
  }
}
