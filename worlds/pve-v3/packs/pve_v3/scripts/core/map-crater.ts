/**
 * 12. 隕石孔——**中央が深い漏斗。縁の外は落ちる。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 12 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **何かが落ちてきて、島に穴を開けた。**
 * >
 * > 中央は **15 マス落ち込んだ漏斗。** 内壁には**地層の縞が輪になって露出**し、
 * > 底には**焦げた岩と、溶けて固まった玻璃**、そして**隕鉄の塊**が残っている。
 * > 縁は**外へめくれ上がり**、そこから**放射状の条線**が裾を走って薄れていく。
 * >
 * > **中央が低いので、縁に立つと戦場が丸ごと見下ろせる。**
 * > **縁から先は無い。** 落ちれば奈落。
 *
 * ## 組む順
 *
 * ```
 * clearBox   まず全部消す
 * terrain    地形（漏斗・裾・二次の小孔）と、天面の材
 * shards     砕けた破片／ironMass 隕鉄／boulders 岩塊／outcrops 露頭
 *            **隕鉄は破片より後**——先に置くと、破片に上塗りされて消える
 * landing    湧く所を均す（地形と造作に消させない）
 * smooth     隣より 2 マス以上低い所を埋める（0-8）
 * openGate   ゲートの箱を空ける
 * ```
 *
 * **`smooth` はいちばん最後。** 造作を載せたあとでないと、足し算の段差が残る。
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, GROUND, HALF, openGate, spawnPad, SPAWN_Z } from "./map-frame.js";
import { baseOf, groundAt, isLand, isleRim } from "./map-crater-form.js";
import { apronMat, bandFloor, bandIndex, bandMat, surfaceAt } from "./map-crater-mat.js";
import { boulders, ironMass, outcrops, shards } from "./map-crater-decor.js";

/**
 * **縞を見せる柱か。**
 *
 * > ### 島の中まで縞に割ると、手順が 1 万件増える
 * >
 * > 柱の中身は**外から見えるのは縁の崖だけ。**
 * > **縁から 5 マスの輪と、ゲートの裏の断面**だけ、帯ごとに塗り分ける。
 */
function isCliff(x: number, z: number, d: number): boolean {
  return isleRim(x, z) - d < 5 || z > 34;
}

/**
 * 柱の中身を積む。
 *
 * **崖の柱は、絶対の高さで帯に割る**——地層は水平なので、
 * **漏斗の内壁でも島の外側の崖でも、同じ高さに同じ縞が出る。**
 */
function body(ops: BuildOp[], x: number, z: number, top: number, bottom: number, cliff: boolean): void {
  if (top - 1 < bottom) return;
  if (!cliff) {
    // ---- 見えない中身。**天面の下 3 マスだけ帯を合わせ、あとはまとめて塗る**
    //
    // **まとめる側は「底の帯」で塗る**——ここは**下から見たときの島の腹**になる。
    // 一律の深層岩にすると、**腹が一面の灰色**になって垂れ下がりが読めない。
    const sub = Math.max(bottom, top - 3);
    ops.push(fill(x, sub, z, x, top - 1, z, bandMat(bandIndex(top - 2, x, z), x, z)));
    if (sub - 1 >= bottom) ops.push(fill(x, bottom, z, x, sub - 1, z, bandMat(bandIndex(bottom, x, z), x, z)));
    return;
  }
  let y1 = top - 1;
  while (y1 >= bottom) {
    const i = bandIndex(y1, x, z);
    const lo = i >= 5 ? bottom : Math.max(bottom, bandFloor(i, x, z));
    ops.push(fill(x, lo, z, x, y1, z, bandMat(i, x, z)));
    y1 = lo - 1;
  }
}

/** 地形を積む。**天面の高さを覚えておく**（あとで `smooth` が読む） */
function terrain(ops: BuildOp[], tops: Map<string, number>): void {
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      if (!isLand(x, z)) continue;
      const top = groundAt(x, z);
      const bottom = Math.min(baseOf(x, z), top - 1);
      body(ops, x, z, top, bottom, isCliff(x, z, Math.hypot(x, z)));
      ops.push(set(x, top, z, surfaceAt(x, z, top)));
      tops.set(`${x},${z}`, top);
    }
  }
}

/**
 * 湧く所を均す。
 *
 * **地形を積んだあとに置き直す**（0-2）——生成に消させない。
 * `spawnPad` は角ばった板なので、**天面だけ裾の材に引き直して**升目を消す。
 */
function landing(ops: BuildOp[], tops: Map<string, number>): void {
  spawnPad(ops, "andesite", 4);
  for (let x = -4; x <= 4; x++) {
    for (let z = SPAWN_Z - 4; z <= SPAWN_Z + 4; z++) {
      ops.push(set(x, GROUND, z, apronMat(x, z)));
      tops.set(`${x},${z}`, GROUND);
    }
  }
}

/**
 * **登れる高さに均す**（0-8）。
 *
 * > ### 地形と造作を別々に積むと、足し算で段差が出る
 * >
 * > 地形の傾きが 1 マス以内でも、**その上に高さ 1 の岩を置けば、隣との差は 2 になる。**
 * > **最後に高さの表を見て、隣より 2 マス以上低い所を埋める。**
 * > **埋めるだけ**なので、削って形が崩れることはない。
 *
 * 埋める材は**その高さの帯**から引く——**縞が途切れない。**
 */
function smooth(ops: BuildOp[], tops: Map<string, number>): void {
  const before = new Map(tops);
  // **落ち着くまで繰り返す。** 1 回では、埋めた所の隣がまた低くなる
  for (let pass = 0; pass < 24; pass++) {
    let moved = 0;
    for (const [k, y] of tops) {
      const [sx, sz] = k.split(",");
      const x = Number(sx);
      const z = Number(sz);
      let need = -999;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = tops.get(`${x + (dx ?? 0)},${z + (dz ?? 0)}`);
        if (n !== undefined) need = Math.max(need, n - 1);
      }
      if (y < need) {
        tops.set(k, need);
        moved++;
      }
    }
    if (moved === 0) break;
  }
  for (const [k, y] of tops) {
    const was = before.get(k) ?? y;
    if (y <= was) continue;
    const [sx, sz] = k.split(",");
    const x = Number(sx);
    const z = Number(sz);
    ops.push(fill(x, was + 1, z, x, y, z, bandMat(bandIndex(y, x, z), x, z)));
  }
}

/** 組む手順 */
export function craterOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  const tops = new Map<string, number>();
  clearBox(ops);
  terrain(ops, tops);
  shards(ops, tops);
  ironMass(ops, tops);
  boulders(ops, tops);
  outcrops(ops, tops);
  landing(ops, tops);
  smooth(ops, tops);
  // **マップにポータルは立てない**（`20-portal.md` 0-2）。箱を空けるだけ
  openGate(ops);
  return ops;
}
