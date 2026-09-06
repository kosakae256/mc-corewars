/**
 * ネザー要塞の**溶岩の海と島の形**。**純粋。**
 *
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0 章。
 *
 * > ### 島の縁が、そのまま外壁になっている
 * >
 * > **0-4 は「奈落で閉じる」でも満たせる。** 壁を回さず、
 * > **島を 48 マス手前で切る**——落ちれば溶岩、その先は何も無い。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise, wave } from "./map-frame.js";

/** 種。**変えれば別の崩れ方になる** */
export const SEED = 2959;

/** 溶岩の海の面。**甲板から 9 マス下**——落ちたら死ぬ */
export const LAVA_Y = GROUND - 9;

/** 海底の岩の天端。**溶岩はこの上に 3 マス** */
export const ROCK_TOP = GROUND - 12;

/** 海底の底 */
export const ROCK_BOTTOM = GROUND - 26;

/**
 * 島の縁の半径。
 *
 * > ### **どの向きも 48 マス手前で切れること**（0-4）
 * >
 * > 検査は中心から 50 マスまで歩く。**そこまで床が続くと「外へ出られる」**。
 * > **48 未満に収める**——閉じ方は「奈落」で足りる。壁は要らない。
 */
export function seaRadius(x: number, z: number): number {
  return 46.8 + wave(SEED + 5, x, z, 27) * 0.6 + wave(SEED + 6, x, z, 9) * 0.4;
}

/** そこが溶岩の海（＝島の内側）か。**要塞の足場は必ずここに収める** */
export function inSea(x: number, z: number): boolean {
  return Math.hypot(x, z) <= seaRadius(x, z);
}

/** 溶岩に浮いた瘡蓋（かさぶた）。**海の面をのっぺりさせない** */
export function crustCap(x: number, z: number): string {
  const r = noise(SEED + 11, x, z);
  if (r > 0.7) return "magma";
  if (r > 0.4) return "netherrack";
  if (r > 0.18) return "blackstone";
  return "basalt";
}

/**
 * 溶岩の海。
 *
 * **帯（x の 1 列）ごとにまとめて流す**——1 マスずつ置くと手順が 10 倍になる。
 * 岩は溶岩の下に隠れるので、材を混ぜても見えない。**1 種で足りる。**
 */
function sea(ops: BuildOp[]): void {
  for (let x = -48; x <= 48; x++) {
    let run: number | null = null;
    for (let z = -49; z <= 49; z++) {
      const here = Math.abs(z) <= 48 && inSea(x, z);
      if (here && run === null) run = z;
      if (!here && run !== null) {
        ops.push(fill(x, ROCK_BOTTOM, run, x, ROCK_TOP, z - 1, "netherrack"));
        ops.push(fill(x, LAVA_Y - 2, run, x, LAVA_Y, z - 1, "lava"));
        run = null;
      }
    }
  }
}

/**
 * 海の面の瘡蓋と、縁の岩礁。
 *
 * **一面の溶岩はのっぺりして見える。** 冷えた岩を散らして粒を出す。
 * 縁は 1 マス盛って**岩礁**にする——奈落の切り口が真っ直ぐだと作り物に見える。
 */
function crust(ops: BuildOp[]): void {
  for (let x = -48; x <= 48; x++) {
    for (let z = -48; z <= 48; z++) {
      if (!inSea(x, z)) continue;
      const edge = seaRadius(x, z) - Math.hypot(x, z);
      const r = noise(SEED + 17, x, z);
      if (edge < 1.8) {
        ops.push(fill(x, LAVA_Y, z, x, LAVA_Y + (r > 0.5 ? 1 : 0), z, crustCap(x, z)));
        continue;
      }
      // **散らしすぎない。** 冷えた岩が多いと、溶岩の海に見えなくなる
      if (r > 0.955) ops.push(set(x, LAVA_Y, z, crustCap(x, z)));
      else if (r > 0.945) ops.push(fill(x, LAVA_Y, z, x, LAVA_Y + 1, z, "blackstone"));
    }
  }
}

/**
 * 海に立つ玄武岩の柱。
 *
 * **一面の橙だけだと、海の広さが分からない。** 柱を数本立てると奥行きが出る。
 *
 * > ### **1 マス角にする**
 * >
 * > 太くすると天端がまとまり、**0-8 の「登れない面」で落ちる**。
 * > 1 マスなら歩いて回り込めるので、規則の側でも許されている。
 */
function spires(ops: BuildOp[]): void {
  for (let x = -44; x <= 44; x++) {
    for (let z = -44; z <= 44; z++) {
      const d = Math.hypot(x, z);
      if (d < 19 || !inSea(x, z)) continue;
      const r = noise(SEED + 25, x, z);
      if (r < 0.9982) continue;
      const h = LAVA_Y + 2 + Math.floor(noise(SEED + 26, x, z) * 5);
      ops.push(fill(x, LAVA_Y - 1, z, x, h - 1, z, "basalt"));
      ops.push(set(x, h, z, noise(SEED + 28, x, z) > 0.7 ? "magma" : "smooth_basalt"));
    }
  }
}

/** 溶岩の海を敷く。**手順を `ops` に足す**——要塞はこの上に載る */
export function seaOps(ops: BuildOp[]): void {
  sea(ops);
  crust(ops);
  spires(ops);
}
