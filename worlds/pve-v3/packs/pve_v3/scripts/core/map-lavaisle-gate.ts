/**
 * 3. 溶岩の島——**門構えと、湧く所の桟橋。**
 *
 * 決まりは `spec/14-map-build.md` 0-2・0-3・0-8。**形は `map-lavaisle-land.ts`。**
 *
 * > ### **ポータルは置かない**（0-2-1）
 * >
 * > **箱（1,1,39〜−1,5,39）は空けておく**——
 * > **門は、敵を倒し切ったときに進行の側が置く。**
 * > ここで作るのは**その周りの枠と、裏を塞ぐ壁**だけ。
 *
 * > ### 裏は溶岩で閉じる
 * >
 * > **門の面では島の幅が |x| ≤ 6 しかない**（`gateWidth`）。
 * > **その外は海**なので、壁を回り込もうとすると溶岩に落ちる。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise } from "./map-frame.js";
import { SEA_TOP, SEED } from "./map-lavaisle-land.js";

/** 人が積んだ黒石。**1 マスごとに引く**（0-7。建物なので揃い気味に） */
const CUT = [
  "polished_blackstone_bricks",
  "polished_blackstone_bricks",
  "polished_blackstone",
  "cracked_polished_blackstone_bricks",
  "chiseled_polished_blackstone",
  "blackstone",
];

/** その柱を、海面から積む。**下から支えが続く**ので浮かない（0-5） */
function post(ops: BuildOp[], x: number, z: number, top: number, seed: number, cap?: string): void {
  for (let y = SEA_TOP; y <= top; y++) {
    const m = noise(seed, x, z + y * 7);
    ops.push(set(x, y, z, m > 0.9 ? "gilded_blackstone" : (CUT[Math.floor(m * CUT.length)] ?? "blackstone")));
  }
  if (cap !== undefined) ops.push(set(x, top + 1, z, cap));
}

/**
 * 参道の柱。
 *
 * **左右で本数も間隔も高さも変える**（0-6）。
 * **帯（|x| ≤ 7）の外に立てる**ので、門への見通しは塞がない（0-3）。
 */
const PILLARS: ReadonlyArray<readonly [number, number, number]> = [
  [-9, 26, 8],
  [-10, 29, 5],
  [-8, 32, 11],
  [-9, 34, 6],
  [9, 27, 6],
  [8, 30, 10],
  [10, 33, 5],
  [8, 35, 9],
];

/**
 * 門の左右に立つ塔。**1 マス角**なので、登れない面が広がらない（0-8）。
 *
 * > ### 高い塔は、門の面（z ＝ 39）から生やす
 * >
 * > **手前（z ＝ 38）に立てたら、塔の天面が門の壁と地続きになり、
 * > 「登れない面 37 マス」として検査に落ちた。**
 * > **検査が飾りとして見逃すのは |x| ≤ 6・z ≥ 39** だけ——そこへ寄せる。
 * > 手前に置く低い柱は、**壁から離す**（塊にならない）。
 */
const TOWERS: ReadonlyArray<readonly [number, number, number]> = [
  [-5, 39, 15],
  [5, 39, 12],
  [-6, 40, 17],
  [6, 41, 9],
];

/**
 * 門の枠（z ＝ 39）。
 *
 * **箱の中（|x| ≤ 1・y 1〜5）には何も置かない**——`openGate` が最後に空ける。
 * **枠は箱の外側**に、袖壁・まぐさ・鎹（かすがい）の順で組む。
 */
function frame(ops: BuildOp[]): void {
  const z = 39;
  for (let x = -6; x <= 6; x++) {
    const a = Math.abs(x);
    if (a <= 1) continue;
    // **袖は外へ行くほど低い。** 天端は 1 マスずつ欠けさせる
    const h = a <= 3 ? 6 : 4 - (noise(SEED + 610, x, z) > 0.55 ? 1 : 0);
    post(ops, x, z, GROUND + h, SEED + 611);
  }
  // ---- まぐさ。**門の上を渡す**
  for (let x = -3; x <= 3; x++) {
    ops.push(set(x, GROUND + 6, z, Math.abs(x) === 3 ? "gilded_blackstone" : "polished_blackstone"));
    if (Math.abs(x) <= 1) ops.push(set(x, GROUND + 7, z, "chiseled_polished_blackstone"));
  }
  // ---- 門口の左右に灯り。**箱の外**
  for (const x of [-2, 2]) ops.push(set(x, GROUND + 5, z, "lantern"));
}

/**
 * 門の裏の壁。**回り込めないようにする**（0-3）。
 *
 * **焼けた筋は、その柱の天端までしか入れない**——
 * **壁より上に置くと、そこだけ 1 マス浮く**（0-5 の検査に落ちた）。
 */
function screen(ops: BuildOp[]): void {
  for (let x = -6; x <= 6; x++) {
    const a = Math.abs(x);
    // **天端は段になっている。** 真ん中がいちばん高く、外へ向かって落ちる
    const h = GROUND + (a <= 2 ? 13 : a <= 4 ? 10 : 7) - (noise(SEED + 620, x, 40) > 0.6 ? 1 : 0);
    post(ops, x, 40, h, SEED + 621);
    if (a <= 4) post(ops, x, 41, GROUND + (a <= 2 ? 5 : 3), SEED + 622);
    // ---- 壁の顔。**磨いた面に、焼けた筋を 1 マスずつ入れる**
    for (let y = GROUND + 1; y <= h; y++) {
      if (noise(SEED + 623, x, y) > 0.14) continue;
      ops.push(set(x, y, 40, noise(SEED + 624, x, y) > 0.5 ? "magma" : "gilded_blackstone"));
    }
  }
}

/**
 * 柱の頭。
 *
 * > ### 高い柱の上に灯りを載せない
 * >
 * > **絵にすると、柱まるごとが灯りの色で塗られて、白い棒が林立して見えた。**
 * > **高いものは焼けた頭（マグマ）、低いものだけ灯り**にする。
 */
function cap(h: number): string {
  return h <= 5 ? "lantern" : "magma";
}

/** 門構えを組む */
export function gateFront(ops: BuildOp[]): void {
  for (const [x, z, h] of PILLARS) post(ops, x, z, GROUND + h, SEED + 601, cap(h));
  for (const [x, z, h] of TOWERS) post(ops, x, z, GROUND + h, SEED + 602, cap(h));
  screen(ops);
  frame(ops);
}

/**
 * 湧く所の桟橋。
 *
 * **`spawnPad` の後に呼ぶ**——足場（|x| ≤ 4・z −44〜−36）は空けたままにしたいので、
 * **飾りはその外側だけ**に置く（0-2）。
 */
export function spawnDeck(ops: BuildOp[]): void {
  // ---- 足場を囲む輪。**高さは足さない**ので、見通しも段差も増えない
  for (let x = -7; x <= 7; x++) {
    for (let z = -47; z <= -33; z++) {
      const d = Math.hypot(x, z + 40);
      if (d < 4.6 || d > 6.4) continue;
      if (noise(SEED + 701, x, z) > 0.72) continue;
      ops.push(set(x, GROUND, z, noise(SEED + 702, x, z) > 0.5 ? "magma" : "gilded_blackstone"));
    }
  }
  // ---- 灯りの柱。**左右で高さを変える**（0-6）
  for (const [x, z, h] of [
    [-8, -42, 4],
    [9, -41, 3],
    [-9, -34, 5],
    [8, -33, 3],
  ] as ReadonlyArray<readonly [number, number, number]>) {
    post(ops, x, z, GROUND + h, SEED + 703, cap(h));
  }
  // ---- 焚き火は**真上を外して**置く（0-2。頭上を埋めない）
  for (const [x, z] of [
    [-6, -41],
    [6, -42],
  ] as ReadonlyArray<readonly [number, number]>) {
    ops.push(fill(x, GROUND + 1, z, x, GROUND + 3, z, "air"));
    ops.push(set(x, GROUND + 1, z, "campfire"));
  }
}
