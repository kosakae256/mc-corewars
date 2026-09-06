/**
 * 18. 雲海——**雲だけ。実体のある島は作らない。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5-0-2。
 * 決まりは `spec/14-map-build.md` 0 章（**0-5 と 0-8 は免除**。0-10）。
 * 雲 1 枚の作り方は `map-cloudsea-shape.ts`。**ここは並べ方だけ。**
 *
 * > ### 足場どうしは、歩いて渡れない
 * >
 * > **雲と雲は上下左右に離れていて、その間は全部奈落。**
 * > **橋を架けてはいけない**——渡る手段は、後日**移動用の固有ブロック**で用意する
 * > （まだ作らない）。だから **0-5（ひと繋がり）と 0-8（歩いて行ける）は免除。**
 *
 * > ### 離れていることを、数で守る
 * >
 * > 雲は**半径 `r` の中に必ず収まる**（`map-cloudsea-shape.ts` 冒頭）ので、
 * > **中心どうしの隔たり −（`r` の和）が、そのまま最小の隙間**になる。
 * > **どの 2 枚も 6 マス以上**空けてある。**近づけると企画が壊れる。**
 *
 * > ### 高さは散らす
 * >
 * > 天面は **−19 から ＋22 まで**、9 枚が別々の高さ。
 * > **見上げる雲と見下ろす雲**が、どの足場からも両方見える。
 * > **湧く所とゲートだけは y ＝ 0 で固定**（0-1）。
 */

import { fill, type BuildOp } from "./build.js";
import { clearBox, GATE_Z, GROUND, openGate, SPAWN_Z } from "./map-frame.js";
import { emitCloud, type Cloud } from "./map-cloudsea-shape.js";

/**
 * 並べた雲。**9 枚。**
 *
 * **同じ組を 2 回使っていない**（0-6）——
 * `r`（広さ）／`aspect`・`turn`（伸びと向き）／`belly`（厚み）／
 * `lobes`・`wob`・`frill`（輪郭）／`dome`・`relief`（上面）／
 * `wisp`（裾）／`holes`（切れ目）を、1 枚ずつずらしてある。
 */
export const CLOUDS: readonly Cloud[] = [
  // ---- 湧く所。**いちばん広い足場。天面 y ＝ 0 で固定。**
  //      x に大きく伸ばし、z は浅く——**端（z ＝ −50）から出さない**
  {
    id: "spawn",
    cx: 0,
    cz: -37,
    top: GROUND,
    r: 25,
    aspect: 0.6,
    turn: 0.15,
    belly: 9,
    lobes: 5,
    wob: 0.11,
    frill: 9,
    dome: 0,
    relief: 2.2,
    grain: 13,
    wisp: 0.5,
    // **湧く所（0, −40）の真下を塞ぐ**——膨らみの谷間に当たると床が抜ける
    anchor: [{ ox: 0, oz: -5, pr: 11 }],
    seed: 11,
  },
  // ---- ゲート。**分厚い雲。** ゲートの箱（z ＝ 39）を載せる。
  //      **z に潰して**、ポータルの裏に広い床を残さない（0-3）
  {
    id: "gate",
    cx: 0,
    cz: 36,
    top: GROUND,
    r: 24,
    aspect: 0.62,
    turn: 0,
    belly: 13,
    lobes: 4,
    wob: 0.08,
    frill: 14,
    dome: 0,
    relief: 2,
    grain: 17,
    wisp: 0.35,
    // **ゲート（z ＝ 39）と、その先の着地点（z ＝ 40）の真下を塞ぐ**
    anchor: [{ ox: 0, oz: 5, pr: 9 }],
    seed: 23,
  },
  // ---- 左の中ほど。**いちばん高く、いちばん厚い。** ここから下の雲を見下ろせる
  {
    id: "west-mid",
    cx: -31,
    cz: -8,
    top: 18,
    r: 20,
    aspect: 0.72,
    turn: 0.9,
    belly: 16,
    lobes: 4,
    wob: 0.12,
    frill: 11,
    dome: 3,
    relief: 2.4,
    grain: 12,
    wisp: 0.3,
    seed: 53,
  },
  // ---- 右の中ほど。**いちばん長くて、いちばん薄い。** 真ん中が 2 か所裂けている
  {
    id: "east-mid",
    cx: 31,
    cz: -6,
    top: -8,
    r: 19,
    aspect: 0.62,
    turn: 2.3,
    belly: 4,
    lobes: 5,
    wob: 0.16,
    frill: 7,
    dome: 1,
    relief: 2.6,
    grain: 15,
    wisp: 0.95,
    holes: [
      { ox: -3, oz: 3, pr: 5 },
      { ox: 9, oz: -5, pr: 4 },
    ],
    seed: 61,
  },
  // ---- 中央。**いちばん低い。**
  //      湧く所からゲートを見るとき、**視線のはるか下に沈んでいる**（0-3 を邪魔しない）
  {
    id: "deep",
    cx: 0,
    cz: 3,
    top: -19,
    r: 16,
    aspect: 0.92,
    turn: 0.15,
    belly: 15,
    lobes: 3,
    wob: 0.1,
    frill: 12,
    dome: 3,
    relief: 1.8,
    grain: 14,
    wisp: 0.6,
    seed: 67,
  },
  // ---- 左の奥。**低い。** ゲートの雲から落ちた先のように敷く
  {
    id: "west-far",
    cx: -36,
    cz: 28,
    top: -11,
    r: 17,
    aspect: 0.7,
    turn: 2.5,
    belly: 7,
    lobes: 7,
    wob: 0.13,
    frill: 6,
    dome: 2,
    relief: 2.5,
    grain: 10,
    wisp: 0.55,
    holes: [{ ox: -3, oz: 3, pr: 4 }],
    seed: 71,
  },
  // ---- 右の奥。**いちばん高い。** ここに立てれば盤面を見渡せる
  {
    id: "east-far",
    cx: 35,
    cz: 29,
    top: 22,
    r: 16,
    aspect: 0.85,
    turn: 0.2,
    belly: 12,
    lobes: 5,
    wob: 0.1,
    frill: 10,
    dome: 2,
    relief: 2.1,
    grain: 11,
    wisp: 0.7,
    seed: 79,
  },
  // ---- 手前の左。**いちばん低い側。薄くたなびく。** 切れ目が縁を食って C 字になる
  {
    id: "west-near",
    cx: -38,
    cz: -38,
    top: -15,
    r: 13,
    aspect: 0.7,
    turn: 0.5,
    belly: 5,
    lobes: 3,
    wob: 0.15,
    frill: 7,
    dome: 1,
    relief: 2,
    grain: 11,
    wisp: 0.85,
    holes: [{ ox: 6, oz: -4, pr: 4.5 }],
    seed: 37,
  },
  // ---- 手前の右。**いちばん小さい。見上げる。** 小ぶりで厚い、団子のような塊
  {
    id: "east-near",
    cx: 38,
    cz: -38,
    top: 11,
    r: 13,
    aspect: 0.9,
    turn: 1.8,
    belly: 10,
    lobes: 6,
    wob: 0.09,
    frill: 8,
    dome: 2,
    relief: 1.6,
    grain: 15,
    wisp: 0.4,
    seed: 41,
  },
];

/**
 * 組み立ての手順。
 *
 * **順番に意味がある**——雲を積んでから、**湧く所とゲートの頭上を空け**、
 * **最後にゲートの箱を空ける**（`14-map-build.md` 0-2 / 0-2-1）。
 * **ポータルは置かない**——倒し切ったときに進行の側が置く。
 */
export function cloudseaOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  for (const c of CLOUDS) emitCloud(ops, c);
  // **湧く所の頭上を空ける**（0-2）。天面は雲が y ＝ 0 で敷いているので、上だけ抜く
  ops.push(fill(-5, GROUND + 1, SPAWN_Z - 5, 5, GROUND + 4, SPAWN_Z + 5, "air"));
  // **ゲートの前後も空ける**——ここに雲が被ると、ゲートが埋まる
  ops.push(fill(-4, GROUND + 1, GATE_Z - 4, 4, GROUND + 6, GATE_Z + 4, "air"));
  openGate(ops);
  return ops;
}
