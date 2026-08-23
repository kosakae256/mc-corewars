/**
 * 拠点島の設計。
 *
 * 要件: docs/game/02-map.md の 2-B
 *
 * ## 構成
 *
 *   2階   **屋上。** 空へ開く。ジェネレータと**コア**
 *   1階   ショップ・チェスト・エンダーチェスト・ジェネレータ・リスポーン地点
 *   浮島   1階と同じ高さ。段差なしで入れる
 *
 * ## 向き
 *
 * **+Z 側が中央（敵拠点）方向 ＝ 正面。** プレイヤーはそちらへ向かう。
 * 文字の格子では**下の行が正面**にあたる。
 *
 *   -Z（上の行）  背面。安全な側。**階段はここ**
 *   +Z（下の行）  正面。中央方向。攻め手が来る
 *
 * ## 2階へ上がる手段は3つ
 *
 *   1. 1階からの階段（2本）        正規の経路
 *   2. **外付けの階段**            建物の横に露出して付く。守りを迂回できる
 *   3. 下から横へブロックで侵入     **囲わないから成立する**
 *
 * 3つ目があるので、守り手は「入口を守る」だけでは足りず、面で守る必要が出る。
 *
 * ## 書き方: 層を文字で書く
 *
 * 座標計算だと**書いている本人が形を見られない。**
 * できあがってから初めて分かるので、足しては引きを繰り返して
 * 散らかるか空っぽになるかに振れる。
 *
 * **文字の格子なら、形がソースにそのまま見える。**
 */
import { Voxels } from "../voxel.mjs";
import { island } from "../island.mjs";
import { plan, planRange, speckle } from "../layers.mjs";

export const SIZE = 41;

const DEEP = 22;          // 浮島の下へ伸びる深さ
const G = DEEP;           // 1階の床（＝浮島の地面）
const H1 = 8;             // 1階の階高。**低いと平屋に見える**
const F2 = G + H1;        // 2階の床
const TOP = F2 + 10;      // 2階が屋上。その上には何も架けない

export const DEFAULTS = { seed: 3 };

export function levels() {
  return { "1階": G + 1, "2階（屋上）": F2 + 1 };
}

/** 記号 → ブロック。**空白は「触らない」** */
const K = {
  ".": "air",
  "#": "stone_bricks",
  "c": "cobblestone",
  "a": "andesite",
  "w": "spruce_planks",
  "o": "oak_planks",
  "d": "dark_oak_planks",
  "L": "oak_log",
  "f": "oak_fence",
  "S": "emerald_block",    // ショップの目印
  "C": "gold_block",       // チェストの目印
  "E": "diamond_block",    // エンダーチェストの目印
  "R": "light_blue_concrete",  // リスポーン地点の目印。**コアと別のブロックにする**
  "I": "iron_block",       // ジェネレータ（鉄）
  "G": "gold_block",       // ジェネレータ（金）
};

const B = 23;                             // 建物の一辺
const OFF = Math.floor((SIZE - B) / 2);   // 建物の左上

/** 1階の壁。4方向の中央に入口 */
const F1_WALL = [
  "#cc#a#############a#cc#",
  "c.....................c",
  "c.....................c",
  "#.....................#",
  "a.....................a",
  "#.....................#",
  "#.....................#",
  "#.....................#",
  "#.....................#",
  "#.....................#",
  "a.....................a",
  "#.....................#",
  "a.....................a",
  "#.....................#",
  "#.....................#",
  "#.....................#",
  "#.....................#",
  "#.....................#",
  "a.....................a",
  "#.....................#",
  "c.....................c",
  "c.....................c",
  "#cc#a#############a#cc#",
];

/** 1階の床。設備の置き場所 */
const F1_FLOOR = [
  "ooooooooooooooooooooooo",
  "oSSSooooooooooooooEEEoo",
  "oSSSooooooooooooooEEEoo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooCCooooooIooooooooCCoo",
  "ooCCoooooooooooooooCCoo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooRRRoooooooooo",
  "ooooooooooRRRoooooooooo",
  "oooooIooooRRRooooGooooo",
  "ooooooooooRRRoooooooooo",
  "ooooooooooRRRoooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooCCoooooooooooooooCCoo",
  "ooCCooooooGooooooooCCoo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "oSSSooooooooooooooEEEoo",
  "oSSSooooooooooooooEEEoo",
  "ooooooooooooooooooooooo",
];

/** 2階の床。中央を広く空ける */
const F2_FLOOR = [
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooIoooooooooIoooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooGoooooooooGoooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
  "ooooooooooooooooooooooo",
];

/** 2階は**手すりだけ**。壁で囲わない */
const F2_RAIL = [
  "LffffffffLfffLffffffffL",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "L.....................L",
  ".......................",
  "L.....................L",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "f.....................f",
  "LffffffffLfffLffffffffL",
];

/** 使わなくなった（2階が屋上なので屋根は架けない） */
const ROOF_TOP_UNUSED = [
  "ddddddddddddddddddddddd",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "d#####################d",
  "ddddddddddddddddddddddd",
];

export function buildBase(opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  const S = SIZE;
  const v = new Voxels(S, TOP, S);
  const m = Math.floor(S / 2);
  const half = Math.floor(B / 2);

  // ---------------------------------------------------------- 浮島
  island(v, m, m, Math.floor(S / 2) - 1, G, { depth: DEEP - 4, seed: p.seed, top: "stone_bricks" });

  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      if (v.get(x, G, z) === "air") continue;
      const edge = v.get(x + 1, G, z) === "air" || v.get(x - 1, G, z) === "air"
                || v.get(x, G, z + 1) === "air" || v.get(x, G, z - 1) === "air";
      if (!edge) continue;
      if ((x * 7 + z * 13) % 3 === 0) v.set(x, G, z, "moss_block");
      if ((x * 5 + z * 11) % 4 === 0) v.set(x, G - 1, z, "vine");
    }
  }

  // ---------------------------------------------------------- 1階
  plan(v, K, G, F1_FLOOR, OFF, OFF);
  planRange(v, K, G + 1, G + H1 - 1, F1_WALL, OFF, OFF);

  // ---------------------------------------------------------- 入口
  // **壁は残し、扉の高さだけ切る。**
  // 上まで抜くと、その上の2階の床が支えを失って宙に浮く
  const DOOR_H = 4;
  const half0 = Math.floor(B / 2);
  // 正面（+Z・中央方向）は広く、背面は狭く
  for (let k = -4; k <= 4; k++) {
    v.box(OFF + half0 + k, G + 1, OFF + B - 1, OFF + half0 + k, G + DOOR_H, OFF + B - 1, "air");
  }
  for (let k = -1; k <= 1; k++) {
    v.box(OFF + half0 + k, G + 1, OFF, OFF + half0 + k, G + DOOR_H, OFF, "air");
  }
  // 左右も入口。回り込めるように
  for (let k = -2; k <= 2; k++) {
    v.box(OFF, G + 1, OFF + half0 + k, OFF, G + DOOR_H, OFF + half0 + k, "air");
    v.box(OFF + B - 1, G + 1, OFF + half0 + k, OFF + B - 1, G + DOOR_H, OFF + half0 + k, "air");
  }

  // 入口の上にまぐさを渡す。**開口の上が薄いと崩れて見える**
  for (const [px, pz] of [[OFF + half0, OFF + B - 1], [OFF + half0, OFF],
                          [OFF, OFF + half0], [OFF + B - 1, OFF + half0]]) {
    for (let k = -5; k <= 5; k++) {
      const qx = pz === OFF || pz === OFF + B - 1 ? px + k : px;
      const qz = pz === OFF || pz === OFF + B - 1 ? pz : pz + k;
      v.set(qx, G + DOOR_H + 1, qz, "dark_oak_planks");
    }
  }

  // 窓。閉塞感を減らす
  for (let i = 3; i < B - 3; i += 4) {
    for (const [x, z] of [[OFF, OFF + i], [OFF + B - 1, OFF + i], [OFF + i, OFF], [OFF + i, OFF + B - 1]]) {
      v.set(x, G + 3, z, "air");
      v.set(x, G + 4, z, "air");
    }
  }

  // 梁と柱。
  // **柱は少なく。** 多いと中が通れず、戦闘の邪魔になる。
  // 梁は壁から壁へ架け、柱は4本だけ立てて中央部を受ける
  for (let i = 5; i < B - 1; i += 5) {
    v.box(OFF + i, G + H1 - 1, OFF, OFF + i, G + H1 - 1, OFF + B - 1, "dark_oak_planks");
  }
  for (const [dx, dz] of [[6, 6], [6, B - 7], [B - 7, 6], [B - 7, B - 7]]) {
    v.box(OFF + dx, G + 1, OFF + dz, OFF + dx, G + H1 - 2, OFF + dz, "oak_log");
  }

  // ---------------------------------------------------------- 1階 → 2階（階段2本）
  // **背面（-Z 側）の壁沿いに寄せる。**
  // 中央に置くと通路を塞ぐ。壁に貼り付けて、中を通れるようにする
  // **階段ブロックを使う。** 実ブロックの段だと壁に見える
  for (let i = 0; i < H1; i++) {
    for (let k = 0; k < 2; k++) {
      v.set(OFF + 1 + k, G + 1 + i, OFF + 1 + i, "oak_stairs");
      v.set(OFF + B - 2 - k, G + 1 + i, OFF + 1 + i, "oak_stairs");
    }
  }

  // ---------------------------------------------------------- 2階（バルコニー）
  plan(v, K, F2, F2_FLOOR, OFF, OFF);
  plan(v, K, F2 + 1, F2_RAIL, OFF, OFF);

  // 階段の抜け穴
  v.box(OFF, F2, OFF + 1, OFF + 2, F2, OFF + H1, "air");
  v.box(OFF + B - 3, F2, OFF + 1, OFF + B - 1, F2, OFF + H1, "air");

  // 柱。**四隅と辺の中央だけ。** 戦闘空間を細切れにしない
  for (const [dx, dz] of [[0, 0], [0, B - 1], [B - 1, 0], [B - 1, B - 1],
                          [0, half], [B - 1, half], [half, 0], [half, B - 1]]) {
    v.box(OFF + dx, F2, OFF + dz, OFF + dx, F2 + 4, OFF + dz, "oak_log");
    v.set(OFF + dx, F2 + 2, OFF + dz, "vine");
  }

  // ---------------------------------------------------------- 外付けの階段
  // **建物の横に露出して付く。** 守りを迂回できる経路
  //
  //   - **階段ブロックを使う**（実ブロックの段だと壁に見える）
  //   - **幅を広くとる**。細いと通れないし貧相に見える
  //   - **柱で支えない。** 見た目の軽さを優先する。
  //     物理的なおかしさは許容する（要件 / 2026-08-22）
  //   - **始点と終点をそろえる。** 片方だけ中央から始めると終点がずれる
  const STW = 3;                       // 階段の幅
  const sz0 = OFF + 2;                 // 背面寄りの始点。左右で同じ
  for (let i = 0; i < H1; i++) {
    for (let k = 0; k < STW; k++) {
      // 西側：背面から正面へ向かって上る
      v.set(OFF - 2, G + 1 + i, sz0 + i, "cobblestone_stairs");
      v.set(OFF - 2 - k, G + 1 + i, sz0 + i, "cobblestone_stairs");
      // 東側：同じ向き・同じ高さで上る
      v.set(OFF + B + 1, G + 1 + i, sz0 + i, "cobblestone_stairs");
      v.set(OFF + B + 1 + k, G + 1 + i, sz0 + i, "cobblestone_stairs");
    }
  }
  // 2階へ渡る踊り場。**左右とも同じ位置**に着く
  for (let k = 0; k < STW; k++) {
    v.set(OFF - 1 - k, F2, sz0 + H1 - 1, "oak_planks");
    v.set(OFF + B + k, F2, sz0 + H1 - 1, "oak_planks");
    v.set(OFF - 1 - k, F2, sz0 + H1, "oak_planks");
    v.set(OFF + B + k, F2, sz0 + H1, "oak_planks");
  }
  // 手すり
  for (let i = 0; i < H1; i++) {
    v.set(OFF - 2 - STW, G + 2 + i, sz0 + i, "oak_fence");
    v.set(OFF + B + 1 + STW, G + 2 + i, sz0 + i, "oak_fence");
  }

  // ---------------------------------------------------------- コア（2階の中央）
  // **2階は屋上。** 屋根を架けず、空へ開く。コアはここに据える
  v.box(m - 4, F2, m - 4, m + 4, F2, m + 4, "polished_andesite");
  v.frame(m - 4, F2 + 1, m - 4, m + 4, F2 + 1, m + 4, "mossy_stone_bricks");
  // 四方から上がれるよう、壇の縁を開ける
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    v.box(m + dx * 4 - Math.abs(dz), F2 + 1, m + dz * 4 - Math.abs(dx),
          m + dx * 4 + Math.abs(dz), F2 + 1, m + dz * 4 + Math.abs(dx), "air");
  }
  // **コア本体は1ブロック。**
  // 上下を板ガラスで挟み、宙に浮いて見せる（要件 / 2026-08-22）
  v.set(m, F2 + 1, m, "glass_pane");
  v.set(m, F2 + 2, m, "white_concrete");   // ← **これがコア。ワールドで唯一の白コンクリート**
  v.set(m, F2 + 3, m, "glass_pane");
  // 四隅の柱と明かり。コアの位置を遠くから示す
  for (const [px, pz] of [[m - 4, m - 4], [m - 4, m + 4], [m + 4, m - 4], [m + 4, m + 4]]) {
    v.box(px, F2 + 1, pz, px, F2 + 5, pz, "dark_oak_planks");
    v.set(px, F2 + 6, pz, "lantern");
  }

  // ---------------------------------------------------------- まばらに散らす
  // **一色でベタ塗りすると、大きさだけが目立って安っぽくなる**
  speckle(v, G, TOP - 1, "stone_bricks", "cobblestone", 0.12, 1);
  speckle(v, G, TOP - 1, "stone_bricks", "andesite", 0.08, 2);
  speckle(v, G, TOP - 1, "stone_bricks", "mossy_stone_bricks", 0.06, 3);
  speckle(v, G, F2, "spruce_planks", "dark_oak_planks", 0.10, 4);
  speckle(v, F2, TOP - 1, "oak_planks", "spruce_planks", 0.08, 5);
  speckle(v, F2, TOP - 1, "dark_oak_planks", "spruce_planks", 0.10, 6);

  return v;
}
