/**
 * 廃村——**町割り。** どこに何が建っていたか。
 *
 * > ### 家は手で並べる
 * >
 * > **自動で撒くと、同じ間隔・同じ大きさで並んで作り物に見える**（0-6）。
 * > **1 軒ずつ、大きさ・高さ・材・崩れ具合を変えて置く。**
 *
 * > ### 路地は細くてよい
 * >
 * > **家と家の隙間は 1〜3 マス。** 通りは目抜き 1 本と横道 4 本だけで、
 * > **あとは建物の隙間が道になる**——**迷路にする**のが 4 番の売り。
 * > ただし**行き止まりだらけにはしない**ので、帯ごとに必ず横道へ抜ける。
 */

import { fill, set, type BuildOp } from "./build.js";
import { noise } from "./map-frame.js";
import { house, type House } from "./map-ruinvill-house.js";
import { SEED, streetX } from "./map-ruinvill-const.js";
import { beam, cart, deadTree, fence, field, graves, oven, rubble, well } from "./map-ruinvill-prop.js";

/** 家 1 軒の並び。**[x0, z0, x1, z1, 壁の高さ, 材, 勾配, 崩れ]** */
type Row = readonly [number, number, number, number, number, number, number, number];

/**
 * 村の家。**45 軒。**
 *
 * **同じ数字の組を 2 度書かない。** 幅・奥行き・高さ・材・屋根・崩れ、
 * どれか 1 つは必ず違う。
 */
const HOUSES: readonly Row[] = [
  // ---- 外れ（z −34〜−27）。**小さく粗末な家**
  [-23, -32, -17, -27, 4, 0, 1, 0.5],
  [-16, -34, -11, -29, 5, 4, 2, 0.3],
  [-9, -33, -6, -28, 3, 1, 0, 0.7],
  [6, -34, 11, -28, 5, 2, 2, 0.35],
  [14, -32, 20, -28, 3, 0, 1, 0.6],
  [22, -30, 26, -27, 4, 6, 0, 0.45],
  // ---- 二番目の帯（z −25〜−19）
  [-30, -25, -24, -20, 6, 5, 2, 0.25],
  [-22, -24, -16, -19, 4, 1, 1, 0.55],
  [-14, -25, -9, -20, 5, 7, 2, 0.4],
  [6, -24, 12, -19, 4, 3, 1, 0.5],
  [15, -25, 22, -20, 6, 0, 2, 0.2],
  [25, -23, 31, -19, 4, 4, 0, 0.65],
  // ---- 三番目の帯（z −13〜−8）。**いちばん賑わっていた辺り**
  [-35, -13, -29, -8, 5, 6, 2, 0.35],
  [-27, -13, -20, -9, 4, 2, 1, 0.45],
  [-18, -12, -12, -8, 6, 1, 2, 0.3],
  [-10, -13, -6, -9, 4, 5, 0, 0.6],
  [6, -13, 13, -8, 5, 3, 2, 0.4],
  [16, -12, 23, -8, 3, 7, 1, 0.55],
  [26, -13, 32, -9, 5, 1, 2, 0.3],
  // ---- 四番目の帯（z −2〜+5）。**大きな家が並ぶ**
  [-37, -2, -30, 3, 4, 0, 1, 0.5],
  [-28, -1, -21, 5, 6, 7, 2, 0.25],
  [-19, -2, -13, 4, 4, 4, 2, 0.6],
  [-11, -1, -6, 5, 5, 2, 1, 0.35],
  [6, -2, 12, 4, 3, 6, 0, 0.7],
  [14, -2, 24, 5, 5, 5, 2, 0.3],
  [26, -2, 33, 4, 4, 3, 1, 0.5],
  [35, 0, 37, 4, 3, 0, 0, 0.75],
  // ---- 五番目の帯（z +11〜+17）
  [-34, 11, -27, 16, 5, 1, 2, 0.4],
  [-25, 12, -18, 17, 3, 6, 1, 0.6],
  [-17, 10, -8, 18, 6, 3, 2, 0.25],
  [6, 12, 13, 17, 4, 7, 1, 0.45],
  [16, 11, 24, 17, 5, 0, 2, 0.35],
  [27, 12, 33, 17, 3, 5, 0, 0.65],
  // ---- 帯からはみ出すもの。**碁盤の目に見せない**（0-6）
  [-41, 7, -34, 14, 4, 4, 1, 0.55],
  [36, -6, 40, 0, 7, 5, 0, 0.4],
  // ---- 小屋。**大きさの幅を広げる**——同じ寸法の箱が並ぶと作り物に見える
  [17, 26, 21, 30, 3, 7, 0, 0.8],
  [-39, -11, -36, -7, 3, 5, 0, 0.6],
  [30, 6, 34, 10, 3, 4, 0, 0.6],
  [-14, 27, -10, 31, 3, 6, 0, 0.75],
  [7, 27, 11, 31, 3, 4, 0, 0.7],
  [30, -20, 34, -16, 3, 3, 0, 0.55],
  [-33, 18, -30, 22, 3, 0, 0, 0.7],
  // ---- 広場のまわりと、鐘楼
  [-28, 23, -21, 28, 4, 2, 1, 0.5],
  [24, 23, 30, 28, 4, 1, 2, 0.4],
  [-21, 26, -15, 32, 10, 3, 0, 0.25],
];

/** 家並みを建てる */
function houses(ops: BuildOp[]): void {
  for (let i = 0; i < HOUSES.length; i++) {
    const r = HOUSES[i];
    const h: House = {
      x0: r[0],
      z0: r[1],
      x1: r[2],
      z1: r[3],
      h: r[4],
      kit: r[5],
      pitch: r[6],
      ruin: r[7],
      seed: SEED + 100 + i * 37,
    };
    house(ops, h);
  }
}

/**
 * 村の教会。**ゲートは、その奥の壁の向こうに立つ。**
 *
 * 屋根は落ち、列柱と壁だけが残っている——**奥行きのある部屋**にして、
 * **たどり着いた感じ**を出す。
 */
function church(ops: BuildOp[]): void {
  const x0 = -10;
  const x1 = 10;
  const z0 = 25;
  const z1 = 37;
  // **崩落口は左右の側壁のまん中に置く。**
  //
  // 大扉と内陣の抜けで外周が 2 つの弧に切れるので、**どちらの弧にも 1 つ要る**（0-8）。
  // 数を増やして散らすと、**均しの効きで壁がまるごと低くなる**——場所まで決める。
  house(ops, {
    x0,
    z0,
    x1,
    z1,
    h: 9,
    kit: 3,
    pitch: -1,
    ruin: 0.55,
    gapAt: [0.42, 0.91],
    seed: SEED + 900,
  });

  // ---- 正面の大扉。**通りをそのまま呑み込む**（見通しを塞がない。0-3）
  const c = streetX(z0);
  // **抜くなら天まで抜く。** 途中で止めると、上に残った壁が宙に浮く（0-5）
  ops.push(fill(c - 3, 1, z0, c + 3, 12, z0, "air"));
  ops.push(fill(c - 4, 1, z0, c - 4, 9, z0, "chiseled_stone_bricks"));
  ops.push(fill(c + 4, 1, z0, c + 4, 7, z0, "chiseled_stone_bricks"));
  ops.push(set(c - 4, 10, z0, "stone_brick_wall"));

  // ---- 身廊の列柱。**1 マスの柱**（回り込めるので、上が登れなくてよい）
  for (const px of [-6, 6]) {
    for (const pz of [28, 31, 34]) {
      const t = 5 + Math.round(noise(SEED + 901, px, pz) * 3);
      ops.push(fill(px, 1, pz, px, t, pz, "stone_bricks"));
      ops.push(set(px, t, pz, noise(SEED + 902, px, pz) > 0.5 ? "mossy_stone_bricks" : "cracked_stone_bricks"));
      // **灯は柱の上に載せる**——宙に浮かせない（0-5）
      ops.push(set(px, t + 1, pz, "lantern"));
    }
  }

  // ---- 内陣の床と、崩れ落ちた祭壇
  ops.push(fill(-4, 0, 33, 4, 0, 36, "stone_bricks"));
  ops.push(fill(-2, 1, 35, 2, 1, 35, "cracked_stone_bricks"));
  ops.push(set(0, 2, 35, "cracked_stone_bricks"));
  for (const dx of [-2, 2]) ops.push(set(dx, 2, 35, "lantern"));

  // ---- 奥の壁を、ゲートのぶんだけ抜く
  ops.push(fill(-3, 1, z1, 3, 12, z1, "air"));
}

/**
 * ゲートの枠。**箱（x −1〜1・y 1〜5・z 39）の外側だけ**を飾る
 * （`14-map-build.md` 0-2-1。**ポータルは置かない**）。
 */
function gateFrame(ops: BuildOp[]): void {
  for (const dx of [-3, -2, 2, 3]) {
    ops.push(fill(dx, 1, 39, dx, 6, 39, dx === -2 || dx === 2 ? "mossy_stone_bricks" : "stone_bricks"));
  }
  ops.push(fill(-3, 6, 39, 3, 6, 39, "chiseled_stone_bricks"));
  ops.push(fill(-3, 7, 39, 3, 7, 39, "stone_brick_wall"));
  // **飾りは z ＝ 39 の面から出さない**——手前へ出すと、
  // そこだけ高い柱になって「歩いて行けない面」になる（0-8。除外は z ≧ 39 まで）
  for (const dx of [-4, 4]) {
    ops.push(fill(dx, 1, 39, dx, 4, 39, "cobblestone"));
    ops.push(set(dx, 5, 39, "lantern"));
  }
  ops.push(fill(-4, 0, 38, 4, 0, 39, "stone_bricks"));
}

/** 広場と、その置き物 */
function square(ops: BuildOp[]): void {
  ops.push(fill(-14, 0, 21, 14, 0, 24, "cobblestone"));
  for (let x = -14; x <= 14; x++) {
    for (let z = 21; z <= 24; z++) {
      const r = noise(SEED + 61, x, z);
      if (r > 0.45) continue;
      ops.push(set(x, 0, z, r > 0.3 ? "mossy_cobblestone" : r > 0.15 ? "andesite" : "cracked_stone_bricks"));
    }
  }
  well(ops, 9, 23);
  oven(ops, -8, 23);
  cart(ops, 13, 19, "x");
  beam(ops, -13, 19, 6, "x", "spruce_log");
  rubble(ops, -4, 27, 3, SEED + 63);
  graves(ops, 15, 26, 22, 33);
  fence(ops, 13, 25, 13, 34, "oak_fence");
  fence(ops, 13, 34, 23, 34, "oak_fence");
  for (const t of [
    [14, 30, 4],
    [21, 28, 5],
    [-24, 33, 4],
  ]) {
    deadTree(ops, t[0], t[1], t[2], "spruce_log");
  }
}

/** 村の外れ——**畑と、朽ちた柵と、倒れた門** */
function outskirts(ops: BuildOp[]): void {
  field(ops, -30, -44, -12, -36);
  field(ops, 12, -44, 30, -36);
  fence(ops, -11, -44, -11, -35, "oak_fence");
  fence(ops, 11, -44, 11, -35, "oak_fence");
  fence(ops, -34, -35, -12, -35, "dark_oak_fence");
  fence(ops, 12, -35, 34, -35, "dark_oak_fence");
  // ---- 村の門の跡。**通りをまたぐ梁は y ＝ 8 より上**（見通しを塞がない）
  //
  // > ### **梁は落ちている**
  // >
  // > 通りをまたぐ横木は、**その上がまるごと「歩いて行けない面」になる**（0-8）。
  // > **門は折れた**ことにして、**柱だけを残す**——1 マスの柱なら回り込める。
  //
  // **柱は湧く所の足場（x −5〜+5）から外へ出す**——
  // 足場を置き直すときに根元が消えて、上だけが宙に浮く（0-5）。
  ops.push(fill(-9, 1, -36, -9, 9, -36, "cobblestone"));
  ops.push(set(-9, 10, -36, "mossy_cobblestone"));
  ops.push(fill(9, 1, -36, 9, 6, -36, "cobblestone"));
  ops.push(set(9, 7, -36, "cracked_stone_bricks"));
  beam(ops, 10, -36, 5, "x", "oak_log");
  beam(ops, -14, -36, 4, "x", "spruce_log");
  cart(ops, -14, -33, "z");
  beam(ops, 15, -31, 7, "z", "oak_log");
  rubble(ops, 27, -35, 3, SEED + 67);
  rubble(ops, -28, -32, 4, SEED + 69);
  for (const t of [
    [-33, -25, 5],
    [33, -28, 4],
    [-37, 9, 5],
    [36, 12, 4],
    [-31, 30, 4],
  ]) {
    deadTree(ops, t[0], t[1], t[2], "oak_log");
  }
}

/**
 * 通り沿いの飾り。
 *
 * > ### 通りの真上（中心 ±3）には置かない
 * >
 * > **見通しを守るために最後に空ける**ので、置いても消える（`map-ruinvill.ts` の `lane`）。
 * > **側溝の一列（±4）に寄せる**——そこは残るし、道幅も狭く見える。
 */
function streetSide(ops: BuildOp[]): void {
  // ---- 折れかけの街灯。**1 マスの柱なので、上が登れなくてよい**（0-8）
  for (const z of [-30, -22, -12, -2, 9, 17, 24]) {
    const c = streetX(z);
    const x = c > 0 ? c - 4 : c + 4;
    ops.push(fill(x, 1, z, x, 3, z, "oak_log"));
    ops.push(set(x, 4, z, "lantern"));
  }
  cart(ops, streetX(-8) + 7, -8, "z");
  cart(ops, streetX(13) - 7, 13, "z");
  beam(ops, streetX(3) + 5, 3, 5, "z", "spruce_log");
  beam(ops, streetX(-19) - 5, -19, 4, "z", "oak_log");
  rubble(ops, streetX(-26) - 5, -26, 3, SEED + 71);
  rubble(ops, streetX(20) + 5, 20, 2, SEED + 73);
}

/** 町のぜんぶ */
export function townOps(ops: BuildOp[]): void {
  houses(ops);
  church(ops);
  square(ops);
  outskirts(ops);
  streetSide(ops);
  gateFrame(ops);
}
