/**
 * 戦場 09「ネザー要塞」（`fortress`）。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 9 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **黒レンガの要塞が、溶岩の海の上に架かっている。**
 * >
 * > 手前の露台から**アーチの並ぶ橋**を渡り、**柱廊のある広間**を抜け、
 * > **ネザーウォートの中庭**を過ぎて、**十字に交わる橋**を越え、
 * > **控え壁の並ぶ回廊**の突き当たりにゲートがある。
 * >
 * > **橋の外は溶岩。落ちたら死ぬ。** 島の縁から先も無い。
 *
 * ## 中身の置き場所
 *
 * | | |
 * | --- | --- |
 * | `map-fortress-sea.ts` | 島の形と溶岩の海 |
 * | `map-fortress-parts.ts` | 積み方の部品（基壇・壁・迫り持ち） |
 * | ここ | 前庭と第一の橋 |
 * | `map-fortress-hall.ts` | 柱廊のある広間 |
 * | `map-fortress-court.ts` | ネザーウォートの中庭 |
 * | `map-fortress-keep.ts` | 十字の橋・回廊・ゲートの正面 |
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, GROUND, noise, openGate, spawnPad, wave } from "./map-frame.js";
import {
  brickCap,
  DECK,
  deckAt,
  lavaFall,
  paveCap,
  pinnacle,
  podium,
  railing,
  ribArch,
  rimCap,
  ruinCap,
  steppedPad,
} from "./map-fortress-parts.js";
import { inSea, LAVA_Y, ROCK_TOP, SEED, seaOps } from "./map-fortress-sea.js";
import { HALL, hallOps } from "./map-fortress-hall.js";
import { courtOps } from "./map-fortress-court.js";
import { keepOps } from "./map-fortress-keep.js";

/**
 * 前庭。**楕円**にする。
 *
 * 四角い露台は、**溶岩の海を四角く食い潰す。**
 * 橋へ向かって細く絞れば、**海が要塞を包んで見える。**
 */
const WARD = { ax: 12, az: 7, cz: -40 } as const;

/** 第一の橋。**細い**——両脇はすぐ溶岩 */
const SPAN = { x: 5, z1: -33, z2: -18 } as const;

/** 崩れ落ちた石段の中心。**ここだけ柵を落とす**（そうしないと降りられない） */
const SLIDE_Z = -39;

/** そこが前庭か */
function inWard(x: number, z: number): boolean {
  if (!inSea(x, z)) return false;
  const u = x / WARD.ax;
  const v = (z - WARD.cz) / WARD.az;
  return u * u + v * v <= 1;
}

/** その z における前庭の西の縁。**崩れた石段の起点**（無ければ null） */
function wardEdge(z: number): number | null {
  for (let x = -WARD.ax - 1; x <= 0; x++) if (inWard(x, z)) return x;
  return null;
}

/** 前庭の床。**手前ほど崩れ、縁は敷石**——中と外で材を変えて、輪郭を出す */
function wardFloor(ops: BuildOp[]): void {
  for (let x = -WARD.ax; x <= WARD.ax; x++) {
    for (let z = WARD.cz - WARD.az; z <= WARD.cz + WARD.az; z++) {
      if (!inWard(x, z)) continue;
      const u = x / WARD.ax;
      const v = (z - WARD.cz) / WARD.az;
      const worn = wave(SEED + 33, x, z, 11) + (z + 40) / 14;
      const rim = !inWard(x + 1, z) || !inWard(x - 1, z) || !inWard(x, z + 1) || !inWard(x, z - 1);
      const cap = rim
        ? rimCap(x, z)
        : u * u + v * v > 0.55
          ? paveCap(x, z)
          : worn < -0.25
            ? ruinCap(x, z)
            : brickCap(x, z);
      podium(ops, x, z, DECK, cap);
      // 転がった瓦礫。**1 マスだけ**なので、どこからでも登れる（0-8）
      if (noise(SEED + 55, x, z) > 0.955) ops.push(set(x, DECK + 1, z, ruinCap(x + 7, z)));
    }
  }
}

/** 前庭の柵。**縁を一周**。**ところどころ落ちている**——一周そろうと作り物に見える */
function wardRail(ops: BuildOp[]): void {
  for (let x = -WARD.ax; x <= WARD.ax; x++) {
    for (let z = WARD.cz - WARD.az; z <= WARD.cz + WARD.az; z++) {
      if (!inWard(x, z)) continue;
      const open =
        !inWard(x + 1, z) || !inWard(x - 1, z) || !inWard(x, z - 1) || (!inWard(x, z + 1) && Math.abs(x) > SPAN.x);
      // **崩れ落ちた側には柵を残さない**——ここが海へ降りる唯一の道（0-8）
      if (x < 0 && Math.abs(z - SLIDE_Z) <= 3) continue;
      if (!open || noise(SEED + 41, x, z) > 0.72) continue;
      railing(ops, x, z);
    }
  }
}

/**
 * 崩れた石段。**前庭の西の縁が欠けて、溶岩へ落ちている。**
 *
 * > ### これが無いと検査に落ちる
 * >
 * > 甲板（y ＝ 0）と溶岩の面（y ＝ −9）は 9 マス離れている。
 * > **海の面へ 1 マスずつ降りられないと、海全部が「登れない面」になる**（0-8）。
 * > **崩れ落ちた瓦礫として作る**——規則のための道でも、要塞の見どころにする。
 */
function collapse(ops: BuildOp[]): void {
  for (let dz = -5; dz <= 3; dz++) {
    const z = SLIDE_Z + dz;
    // **縁からそのまま落とす**——露台が楕円なので、起点は z ごとに違う
    const edge = wardEdge(z);
    if (edge === null) continue;
    for (let k = 0; k <= 9; k++) {
      // **扇形に広げる。** 狭いと、脇に溶岩の袋小路（届かない面）が残る
      if (Math.abs(dz + 1) > 5 - Math.floor(k / 3)) continue;
      const x = edge - 1 - k;
      const top = Math.max(LAVA_Y, DECK - 1 - k);
      if (!inSea(x, z)) continue;
      ops.push(fill(x, ROCK_TOP, z, x, top, z, "netherrack"));
      ops.push(set(x, top, z, ruinCap(x, z)));
    }
  }
}

/**
 * 東の斜面。**広間の控え壁が丸ごと崩れて、瓦礫が海へ流れている。**
 *
 * > ### 海は要塞に二分されている
 * >
 * > 要塞は手前から奥まで途切れずに続くので、**溶岩の海は東と西に割れる。**
 * > **西の石段だけでは、東半分に降りられない**——0-8 で丸ごと落ちる。
 * > **こちらは石段ではなく崩れた壁の瓦礫**にして、同じ形を繰り返さない（0-6）。
 */
function spill(ops: BuildOp[]): void {
  for (let k = 0; k <= 9; k++) {
    // **広間の縁からそのまま落とす。** 離すと、間に降りられない溶岩が残る
    const x = HALL.x + 1 + k;
    const mid = -8 + Math.round(wave(SEED + 47, k * 2, 0, 8) * 2);
    const half = 3 - Math.floor(k / 4);
    const top = Math.max(LAVA_Y, DECK - 1 - k);
    for (let dz = -half; dz <= half; dz++) {
      const z = mid + dz;
      if (!inSea(x, z)) continue;
      ops.push(fill(x, ROCK_TOP, z, x, top, z, "netherrack"));
      ops.push(set(x, top, z, ruinCap(x, z)));
    }
  }
}

/** 前庭の飾り。**隅の稜堡・火皿・尖塔。** 等間隔に置かない（0-6） */
function wardDecor(ops: BuildOp[]): void {
  steppedPad(ops, -8, -42, 4, 3);
  steppedPad(ops, 9, -41, 4, 3);
  steppedPad(ops, 8, -35, 3, 2);
  for (const [x, z, h] of [
    [-8, -37, 4],
    [8, -38, 3],
    [-11, -40, 6],
    [7, -44, 4],
    [-6, -45, 3],
  ] as const) {
    if (!inSea(x, z)) continue;
    pinnacle(ops, x, z, DECK + 1, DECK + h, noise(SEED + 51, x, z) > 0.5 ? "glowstone" : "magma");
  }
}

/**
 * 第一の橋。**細い甲板を、下からアーチで受ける。**
 *
 * 橋脚は等間隔に置かない（0-6）。橋脚と橋脚の間は、
 * **迫り持ちの曲線ぶんだけ肉を落として**、下から見上げるとアーチが並ぶ。
 */
function span(ops: BuildOp[]): void {
  const piers = [-31, -25, -20];
  for (let z = SPAN.z1; z <= SPAN.z2; z++) {
    for (let x = -SPAN.x; x <= SPAN.x; x++) {
      deckAt(ops, x, z, brickCap(x, z));
    }
    // 橋脚。**溶岩の中まで下ろす**（0-5。浮かせない）
    if (piers.includes(z)) {
      for (let x = -SPAN.x; x <= SPAN.x; x++) ops.push(fill(x, ROCK_TOP, z, x, DECK - 3, z, "nether_brick"));
      continue;
    }
    // 迫り持ちの肉。**外側の 2 列だけ**——真ん中は抜いて、橋を軽く見せる
    const near = piers.reduce((a, p) => Math.min(a, Math.abs(z - p)), 99);
    const u = Math.min(1, near / 3.5);
    const soffit = DECK - 3 - Math.round(6 * (1 - Math.sqrt(Math.max(0, 1 - u * u))));
    for (const x of [-SPAN.x, -SPAN.x + 1, SPAN.x - 1, SPAN.x]) {
      ops.push(fill(x, soffit, z, x, DECK - 3, z, "nether_brick"));
    }
  }
  for (let z = SPAN.z1; z <= SPAN.z2; z++) {
    for (const x of [-SPAN.x, SPAN.x]) if (noise(SEED + 43, x, z) > 0.14) railing(ops, x, z);
  }
}

/** 橋の上の迫り持ち。**欄干から立ち上げる**——中軸は空けておく（0-3） */
function spanRibs(ops: BuildOp[]): void {
  ribArch(ops, { along: "x", at: -30, from: -SPAN.x, to: SPAN.x, foot: DECK + 1, crown: DECK + 6 });
  ribArch(ops, { along: "x", at: -23, from: -SPAN.x, to: SPAN.x, foot: DECK + 1, crown: DECK + 7 });
  // **片側だけ落ちた迫り。** 崩れを 1 つ混ぜると、揃った並びが崩れる（0-6）
  ribArch(ops, { along: "x", at: -19, from: -SPAN.x, to: SPAN.x, foot: DECK + 1, crown: DECK + 6, cut: 1 });
  for (const [x, z] of [
    [-SPAN.x, -27],
    [SPAN.x, -22],
  ] as const) {
    pinnacle(ops, x, z, DECK + 1, DECK + 4, "glowstone");
  }
  lavaFall(ops, -SPAN.x, -33, DECK - 3);
  lavaFall(ops, SPAN.x, -21, DECK - 3);
}

/** 組み立ての手順 */
export function fortressOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  seaOps(ops);
  wardFloor(ops);
  collapse(ops);
  span(ops);
  hallOps(ops);
  courtOps(ops);
  keepOps(ops);
  spill(ops);
  wardRail(ops);
  wardDecor(ops);
  spanRibs(ops);

  // **湧く所は最後に置き直す**（0-2）——地形や飾りに消させない
  spawnPad(ops, "nether_brick");
  for (let x = -6; x <= 6; x++) {
    for (let z = -46; z <= -34; z++) {
      if (Math.max(Math.abs(x), Math.abs(z + 40)) !== 6) continue;
      ops.push(set(x, GROUND, z, noise(SEED + 61, x, z) > 0.7 ? "red_nether_brick" : "nether_brick"));
    }
  }
  openGate(ops);
  return ops;
}
