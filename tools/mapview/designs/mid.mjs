/**
 * 中央島（mid）の設計。
 *
 * 要件: docs/game/02-map.md
 *
 * ## 位置づけ
 *
 * **ダイヤとエメラルドが湧く、最大の奪い合いの舞台。**
 * 拠点に籠もれば鉄と金は溜まるが、強くなりたければここへ出るしかない。
 *
 * ## 拠点との違い
 *
 * | | 拠点 | **中央** |
 * | 大きさ | 41 | **63**（約1.5倍） |
 * | 性格 | 守る場所 | **奪い合う場所** |
 * | 形 | 一棟の館 | **城。** 塔と壁で構成する |
 * | 向き | 正面がある | **無い。** 両チームから等距離。四方対称 |
 *
 * **四方対称であることが重要。** どちらのチームから来ても条件が同じでなければ、
 * 中央の奪い合いが公平にならない。
 *
 * ## 大きさの制約
 *
 * 構造物ブロックの上限は **64 x 384 x 64**。
 * **拠点の倍（82）はこれを超えるので、4つに分割して書き出す。**
 *
 *   北西(41) 北東(41)
 *   南西(41) 南東(41)
 *
 * 読み込みは4回になるが、**設計は1つのまま**なので、
 * 見た目を確認する画像も1枚で済む。分割は書き出しのときだけの話。
 *
 * ## 構成
 *
 *   中央の天守   高い。遠くから見える。資源はここの周り
 *   四隅の隅櫓   登れる。射線を取る場所
 *   城壁         天守と隅櫓を繋ぐ。上は歩ける
 *   中庭         城壁の内側。戦闘空間
 *   外周         城壁の外。島の縁までの余地
 */
import { Voxels } from "../voxel.mjs";
import { island } from "../island.mjs";
import { speckle } from "../layers.mjs";

export const SIZE = 82;   // 拠点(41)の倍。**4分割して構造物にする**

const DEEP = 34;          // 浮島の深さ。大きい島なので厚くする
const G = DEEP;           // 地面
const WALL_H = 9;         // 城壁の高さ
const WALK = G + WALL_H;  // 城壁の上の通路
const TOWER_H = 15;       // 隅櫓の高さ
// **天守は2階建てに抑える。** 高すぎると周りが引き立たない
const KEEP_H = 17;        // 天守の高さ（1階6 + 2階6 + 屋上）
const TOP = G + KEEP_H + 8;

export const DEFAULTS = { seed: 17 };

export function levels() {
  return { 地面: G + 1, 城壁の上: WALK + 1, 隅櫓: G + TOWER_H + 1, 天守: G + KEEP_H + 1 };
}

export function buildMid(opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  const S = SIZE;
  const v = new Voxels(S, TOP, S);
  const m = Math.floor(S / 2);

  const F = 28;    // 城壁の半径。**島からはみ出さない値**
  const TW = 7;    // 隅櫓の半径
  const KW = 13;   // 天守の半径

  // ---------------------------------------------------------- 浮島
  // **角を膨らませた島にする。**
  // 真円だと、正方形に並べた城壁と隅櫓の四隅が島からはみ出す
  island(v, m, m, Math.floor(S / 2) - 1, G,
    { depth: DEEP - 5, seed: p.seed, top: "stone_bricks", square: 0.9 });

  // 縁の緑
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

  // 島の外周に木。中庭には置かない（戦闘の邪魔になる）
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const r = Math.floor(S / 2) - 4;
    const tx = Math.round(m + Math.cos(ang) * r);
    const tz = Math.round(m + Math.sin(ang) * r);
    if (v.get(tx, G, tz) === "air") continue;
    v.box(tx, G + 1, tz, tx, G + 4, tz, "spruce_log");
    v.box(tx - 1, G + 4, tz - 1, tx + 1, G + 5, tz + 1, "spruce_leaves");
    v.set(tx, G + 6, tz, "spruce_leaves");
  }

  const a0 = m - F, b0 = m + F;

  // ---------------------------------------------------------- 城壁
  // **壁を厚くする（3マス）。** 上の通路をそのまま受けられる。
  // 薄い壁に幅3の通路を載せると、両側が宙に浮く
  for (let d = 0; d <= 2; d++) {
    v.frame(a0 + d, G + 1, a0 + d, b0 - d, WALK - 1, b0 - d, "stone_bricks");
  }

  // 城壁の上の通路。
  // **壁の真上と、内側だけに敷く。**
  // 外へ張り出すと支えが要り、宙に浮いて見える
  for (let d = 0; d <= 2; d++) {
    v.frame(a0 + d, WALK, a0 + d, b0 - d, WALK, b0 - d, "oak_planks");
  }
  // 通路の縁に木の見切りを入れて、石一色にしない
  v.frame(a0 + 2, WALK, a0 + 2, b0 - 2, WALK, b0 - 2, "dark_oak_planks");
  v.battlement(a0, a0, b0, b0, WALK + 1, "stone_bricks", 2);

  // ---------------------------------------------------------- 門（四方）
  // **四方対称。** どちらのチームからも同じ条件で入れる
  const DOOR_H = 5;
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const px = m + dx * F, pz = m + dz * F;
    for (let k = -3; k <= 3; k++) {
      for (let d = 0; d <= 2; d++) {          // **厚い壁を貫通させる**
        const qx = dx ? px - dx * d : px + k;
        const qz = dz ? pz - dz * d : pz + k;
        v.box(qx, G + 1, qz, qx, G + DOOR_H, qz, "air");
      }
    }
    // まぐさ
    for (let k = -4; k <= 4; k++) {
      const qx = dx ? px : px + k;
      const qz = dz ? pz : pz + k;
      v.set(qx, G + DOOR_H + 1, qz, "dark_oak_planks");
    }
  }

  // ---------------------------------------------------------- 隅櫓（四隅）
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const cx = m + sx * F, cz = m + sz * F;
    const top = G + TOWER_H;

    v.box(cx - TW, G + 1, cz - TW, cx + TW, top - 1, cz + TW, "stone_bricks");
    v.box(cx - TW + 1, G + 1, cz - TW + 1, cx + TW - 1, top - 1, cz + TW - 1, "air");
    // 木の層を挟む
    v.frame(cx - TW, G + 6, cz - TW, cx + TW, G + 8, cz + TW, "spruce_planks");

    // **柱は立てない。**
    // 床を支えるために格子状に柱を通していたが、7x7=49本になり
    // 部屋が林になって戦闘の邪魔になった。
    // Minecraft ではブロックは落ちないので、支えが無くても成立する。
    // 見た目の「支え」は壁と胸壁が担う
    // 床と胸壁
    v.box(cx - TW + 1, top, cz - TW + 1, cx + TW - 1, top, cz + TW - 1, "oak_planks");
    v.battlement(cx - TW, cz - TW, cx + TW, cz + TW, top + 1, "stone_bricks", 2);

    // 城壁の上と同じ高さに扉。**壁から櫓へ入れる**
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const px = cx + dx * TW, pz = cz + dz * TW;
      v.box(px - Math.abs(dz), WALK, pz - Math.abs(dx),
            px + Math.abs(dz), WALK + 2, pz + Math.abs(dx), "air");
    }
    // 中庭側の入口
    v.box(cx - sx * TW, G + 1, cz - sz * TW, cx - sx * TW, G + 3, cz - sz * TW, "air");

    // 中の階段（地面 → 櫓の上）。階段ブロックで
    for (let i = 0; i < TOWER_H - 1; i++) {
      const t = i % (TW * 2 - 2);
      v.set(cx - TW + 1 + t, G + 1 + i, cz - TW + 1, "cobblestone_stairs");
      v.set(cx - TW + 1 + t, G + i, cz - TW + 1, "cobblestone");
    }

    // 窓
    for (let y = G + 3; y < top - 2; y += 4) {
      v.set(cx - TW, y, cz, "air");
      v.set(cx + TW, y, cz, "air");
      v.set(cx, y, cz - TW, "air");
      v.set(cx, y, cz + TW, "air");
    }
    v.set(cx, top + 3, cz, "lantern");
  }

  // ---------------------------------------------------------- 天守（中央）
  const kTop = G + KEEP_H;
  v.box(m - KW, G + 1, m - KW, m + KW, kTop - 1, m + KW, "stone_bricks");
  v.box(m - KW + 1, G + 1, m - KW + 1, m + KW - 1, kTop - 1, m + KW - 1, "air");

  // **2階建て。** 層ごとに木の帯と軒を入れる。石一色だと城に見えない
  const KF2 = G + 7;                       // 天守の2階の床
  for (const y of [G + 5, KF2 + 5]) {
    v.frame(m - KW, y, m - KW, m + KW, y + 2, m + KW, "spruce_planks");
    // **軒は1マスだけ出す。** 深いと支えが要る
    v.roof(m, m, KW, y + 3, 1, "dark_oak_planks", null);
  }
  // 2階の床。**柱は立てない**（上記と同じ理由）
  v.box(m - KW + 1, KF2, m - KW + 1, m + KW - 1, KF2, m + KW - 1, "oak_planks");

  // 四方の入口
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const px = m + dx * KW, pz = m + dz * KW;
    for (let k = -1; k <= 1; k++) {
      const qx = dx ? px : px + k;
      const qz = dz ? pz : pz + k;
      v.box(qx, G + 1, qz, qx, G + 4, qz, "air");
    }
  }

  // 中の階段。**上まで登れること**
  for (let i = 0; i < KEEP_H - 2; i++) {
    const t = i % (KW * 2 - 2);
    v.set(m - KW + 1 + t, G + 1 + i, m - KW + 1, "oak_stairs");
    v.set(m - KW + 1 + t, G + i, m - KW + 1, "oak_planks");
  }

  // 天守の上。**柱は立てない**（上記と同じ理由。120本あった）
  // 屋上の外周は壁の真上。中は柱で受ける
  v.box(m - KW, kTop, m - KW, m + KW, kTop, m + KW, "polished_andesite");
  v.box(m - KW + 1, kTop, m - KW + 1, m - KW + 5, kTop, m - KW + 1, "air");  // 階段の出口
  v.battlement(m - KW, m - KW, m + KW, m + KW, kTop + 1, "mossy_stone_bricks", 2);
  v.roof(m, m, KW, kTop - 1, 1, "dark_oak_planks", null);

  // 望楼
  for (const [px, pz] of [[m - KW, m - KW], [m - KW, m + KW], [m + KW, m - KW], [m + KW, m + KW]]) {
    v.box(px, kTop + 1, pz, px, kTop + 6, pz, "dark_oak_planks");   // 明かりの下まで通す
    v.set(px, kTop + 7, pz, "lantern");
  }

  // ---------------------------------------------------------- 天守 → 隅櫓の渡り廊下
  // **中央から四隅へ、直接渡れる道。**
  // これが無いと、天守に登った者が一度地面へ降りねばならず、
  // 中央を取った意味が薄れる
  const BR = KF2;                          // 渡り廊下の高さ ＝ 天守の2階
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const cx = m + sx * F, cz = m + sz * F;

    // 天守の角から隅櫓の角へ、斜めに渡す
    const fromX = m + sx * KW, fromZ = m + sz * KW;
    const steps = Math.max(Math.abs(cx - fromX), Math.abs(cz - fromZ));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(fromX + (cx - fromX) * t);
      const z = Math.round(fromZ + (cz - fromZ) * t);
      // 幅3の橋。**細いと戦えない**
      for (let k = -1; k <= 1; k++) {
        v.set(x + k, BR, z, "oak_planks");
        v.set(x, BR, z + k, "oak_planks");
      }
      // 手すり
      if (i % 3 === 0) {
        v.set(x + 2, BR + 1, z, "oak_fence");
        v.set(x - 2, BR + 1, z, "oak_fence");
      }
      // 途中を柱で受ける。**間隔を詰める。** 空くと橋が宙に浮いて見える
      if (i % 2 === 0 && i > 0 && i < steps) {
        v.box(x, G + 1, z, x, BR - 1, z, "oak_log");
        v.box(x + 1, BR - 1, z, x + 1, BR - 1, z, "dark_oak_planks");   // 腕木
        v.box(x - 1, BR - 1, z, x - 1, BR - 1, z, "dark_oak_planks");
      }
    }
    // 天守側と隅櫓側の出入口を開ける
    v.box(fromX, BR + 1, fromZ, fromX, BR + 2, fromZ, "air");
    v.box(cx - sx * TW, BR + 1, cz - sz * TW, cx - sx * TW, BR + 2, cz - sz * TW, "air");
  }

  // ---------------------------------------------------------- 資源（目安）
  // **ダイヤとエメラルド。** 天守の周り＝いちばん危険な場所に置く
  for (const [dx, dz, id] of [[-20, 0, "diamond_block"], [20, 0, "diamond_block"],
                              [0, -20, "diamond_block"], [0, 20, "diamond_block"],
                              [-20, -20, "emerald_block"], [20, 20, "emerald_block"],
                              [-20, 20, "emerald_block"], [20, -20, "emerald_block"]]) {
    v.set(m + dx, G + 1, m + dz, id);
  }

  // ---------------------------------------------------------- まばらに散らす
  speckle(v, G, TOP - 1, "stone_bricks", "cobblestone", 0.12, 1);
  speckle(v, G, TOP - 1, "stone_bricks", "andesite", 0.08, 2);
  speckle(v, G, TOP - 1, "stone_bricks", "mossy_stone_bricks", 0.07, 3);
  speckle(v, G, TOP - 1, "spruce_planks", "dark_oak_planks", 0.10, 4);
  speckle(v, G, TOP - 1, "oak_planks", "spruce_planks", 0.08, 5);

  return v;
}
