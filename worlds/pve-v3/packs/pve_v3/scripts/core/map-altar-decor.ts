/**
 * 戦場 08「黒曜石の祭壇」の**飾り**。
 *
 * **手数は全部ここ——祭壇まわりへ回してある**（2026-09-06 作り直し）。
 * 迫り出し天井・聖所の中・列柱・燭台・門の面。
 *
 * **地形の高さは `map-altar-form.ts` の `topAt` からしか取らない**——
 * 数を写すと、地形を直したときに飾りだけ浮く（0-5）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise } from "./map-frame.js";
import { AISLE_HALF, CROWN_Y, SEED, topAt } from "./map-altar-form.js";

/** 聖所の壁が囲む範囲（天面 13 × 13 の内側） */
const CELLA_Z = 6;

/** 天井がせり出し始める x と、届く z。**天井は壁より短く**——前後に向拝が出る */
const VAULT_X = 5;
const VAULT_Z = 4;

/**
 * 聖所の**迫り出し天井**（コーベル）。**ここが盤面のいちばん高い所。**
 *
 * > ### 中央を高くしつつ、視線は通す（0-3）
 * >
 * > 聖路の上へ **1 マスずつせり出す 2 枚重ねの板**を架ける。
 * > **下は開いたまま**——湧く所からゲートへ引いた線は、この板のはるか下を通る。
 * > **上は 1 マスずつの階段**なので、**端から歩いて頂まで登れる**（0-8）。
 *
 * > ### 裾を天面と同じ高さから始める
 * >
 * > いきなり 1 マス持ち上げると、**天面から屋根へ 2 マスの崖**ができて登れない。
 * > **`VAULT_X` の列は天面と同じ高さ**にして、そこから積む。
 */
function vault(ops: BuildOp[]): void {
  for (let z = -VAULT_Z; z <= VAULT_Z; z++) {
    for (let x = -VAULT_X; x <= VAULT_X; x++) {
      const y = CROWN_Y + (VAULT_X - Math.abs(x));
      // **3 マスおきに肋（あばら）を通す**——黒一色だと、せり上がりが読めない
      const rib = z % 3 === 0;
      ops.push(fill(x, y - 1, z, x, y, z, rib ? "polished_basalt" : "polished_blackstone_bricks"));
      ops.push(
        set(x, y, z, rib ? "polished_basalt" : noise(SEED + 41, x, z) > 0.62 ? "gilded_blackstone" : "obsidian")
      );
    }
  }
  // ---- 裾の灯り。**黒い屋根は、輪郭を光らせないと沈む**
  for (let z = -VAULT_Z; z <= VAULT_Z; z += 2) {
    for (const x of [-VAULT_X, VAULT_X]) ops.push(set(x, CROWN_Y, z, "glowstone"));
  }
  // ---- 棟の飾り。**1 マス上がるだけ**なので、頂まで歩ける
  for (let z = -VAULT_Z; z <= VAULT_Z; z += 2) {
    ops.push(set(0, CROWN_Y + VAULT_X + 1, z, z === 0 ? "glowstone" : "gilded_blackstone"));
  }
  // ---- 天面の四隅の火皿。**向拝の前後に、聖所の輪郭を出す**
  for (const dx of [-6, 6]) {
    for (const dz of [-6, 6]) {
      const t = topAt(dx, dz);
      if (t === undefined) continue;
      ops.push(fill(dx, t + 1, dz, dx, t + 3, dz, "chiseled_polished_blackstone"));
      ops.push(set(dx, t + 4, dz, "glowstone"));
    }
  }
}

/**
 * 聖所の中——**祭壇の石・供物台・壁の彫り込み。**
 *
 * 床は聖路そのもの。**積んでよいのは y ＝ 3 まで**——
 * **これより高くすると、湧く所からゲートが見えなくなる**（0-3）。
 */
function chamber(ops: BuildOp[]): void {
  // ---- 沈めた溝。**祭壇の石を、床の色で縁取る**
  ops.push(fill(-2, GROUND + 2, -3, 2, GROUND + 2, 3, "black_concrete"));
  // ---- 祭壇の石。**1 マスだけ上げる。登れる**（0-8）
  ops.push(fill(-1, GROUND + 3, -1, 1, GROUND + 3, 1, "chiseled_polished_blackstone"));
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) ops.push(set(dx, GROUND + 3, dz, "gilded_blackstone"));
  ops.push(set(0, GROUND + 3, 0, "glowstone"));
  // ---- 奥の供物台
  ops.push(fill(-1, GROUND + 3, 5, 1, GROUND + 3, 5, "gilded_blackstone"));
  // ---- 四隅の燭台。**1 マスずつ離す**ので、上が登れなくても回り込める（0-8 の例外）
  for (const dx of [-2, 2]) {
    for (const dz of [-4, 4]) {
      ops.push(fill(dx, GROUND + 3, dz, dx, GROUND + 5, dz, "obsidian"));
      ops.push(set(dx, GROUND + 6, dz, "glowstone"));
    }
  }
  // ---- 両側の壁。**切石に金の帯を 1 本**
  for (let z = -CELLA_Z; z <= CELLA_Z; z++) {
    for (const x of [-3, 3]) {
      const t = topAt(x, z);
      if (t === undefined) continue;
      ops.push(fill(x, GROUND + 3, z, x, Math.min(GROUND + 9, t), z, "polished_blackstone_bricks"));
      ops.push(set(x, GROUND + 6, z, "gilded_blackstone"));
      if (Math.abs(z) % 3 === 1) ops.push(set(x, GROUND + 8, z, "glowstone"));
    }
  }
}

/**
 * 柱の足元（マスの並び）。**1 本 3 マスまで**——
 * **4 マス以上まとまると、登れない面として検査に落ちる**（0-8）。
 */
function pierTiles(): (readonly [number, number])[][] {
  const out: (readonly [number, number])[][] = [];
  for (const s of [-10, 10]) {
    // ---- ±x の側。**z 方向に 3 マス**
    for (const c of [-6, 0, 6])
      out.push([
        [s, c - 1],
        [s, c],
        [s, c + 1],
      ]);
    // ---- ±z の側。**聖路の上には置かない**（視線を塞ぐ。0-3）
    for (const c of [-6, 6])
      out.push([
        [c - 1, s],
        [c, s],
        [c + 1, s],
      ]);
    // ---- 四隅は 1 マスの柱
    for (const t of [-10, 10]) out.push([[s, t]]);
  }
  return out;
}

/**
 * 祭壇を囲む**列柱。**
 *
 * 二のテラス（c ＝ 8）に沿って立てる。**足元の高さは 1 本ずつ違う**ので、
 * **いちばん高いマスに天端を揃えて**から、各マスを地面まで下ろす。
 */
function colonnade(ops: BuildOp[]): void {
  for (const tiles of pierTiles()) {
    let base = -99;
    for (const [x, z] of tiles) base = Math.max(base, topAt(x, z) ?? -99);
    if (base < GROUND) continue;
    const h = base + 7 + Math.floor(noise(SEED + 71, tiles[0]?.[0] ?? 0, tiles[0]?.[1] ?? 0) * 3);
    for (const [x, z] of tiles) {
      const t = topAt(x, z) ?? base;
      ops.push(fill(x, t + 1, z, x, h - 3, z, "obsidian"));
      ops.push(set(x, h - 2, z, "gilded_blackstone"));
      ops.push(set(x, h - 1, z, "glowstone"));
      ops.push(set(x, h, z, "chiseled_polished_blackstone"));
    }
  }
}

/** 燭台の置き所。**一のテラスの上と、広場の参道沿い** */
const LAMPS: readonly (readonly [number, number])[] = [
  [17, 6],
  [17, -6],
  [-17, 6],
  [-17, -6],
  [6, 17],
  [-6, 17],
  [6, -17],
  [-6, -17],
  [4, -34],
  [-4, -34],
  [4, -26],
  [-4, -26],
  [4, 26],
  [-4, 26],
  [4, 34],
  [-4, 34],
];

/** 燭台。**1 マスなので、上が登れなくても歩いて回り込める**（0-8 の例外） */
function lamps(ops: BuildOp[]): void {
  for (const [x, z] of LAMPS) {
    const t = topAt(x, z);
    if (t === undefined) continue;
    ops.push(fill(x, t + 1, z, x, t + 2, z, "polished_blackstone"));
    ops.push(set(x, t + 3, z, "glowstone"));
  }
}

/**
 * 広場の参道の**低い欄干。**
 *
 * > ### 拓けたまま、中央へ向かう線を強くする
 * >
 * > **高い物を置くと広場が塞がる。** **1 マスだけ**にして、
 * > **またげる高さ**で参道の縁をなぞる。
 *
 * **湧く所の足場（z ＝ −45〜−35）には掛からない**——`spawnPad` に空けられて浮く。
 */
function rails(ops: BuildOp[]): void {
  const put = (x: number, z: number): void => {
    const t = topAt(x, z);
    if (t === undefined) return;
    ops.push(set(x, t + 1, z, Math.abs(x + z) % 5 === 0 ? "gilded_blackstone" : "polished_blackstone_bricks"));
  };
  for (let d = 26; d <= 33; d++) {
    for (const s of [-1, 1]) {
      put(4 * s, d);
      put(4 * s, -d);
      put(d, 4 * s);
      put(-d, 4 * s);
    }
  }
  for (let d = 34; d <= 42; d++) {
    for (const s of [-1, 1]) {
      put(4 * s, d);
      put(d, 4 * s);
      put(-d, 4 * s);
    }
  }
}

/** 地形に載る飾りを、まとめて積む */
export function altarDecorOps(ops: BuildOp[]): void {
  vault(ops);
  chamber(ops);
  colonnade(ops);
  rails(ops);
  lamps(ops);
}

/**
 * ゲートの面と、湧く所の前庭。
 *
 * > ### ゲートの箱（1,1,39 〜 −1,5,39）には何も置かない
 * >
 * > **マップにポータルを立ててはいけない**（`20-portal.md` 0-2）——
 * > **倒し切ったときに進行の側が置く。** 飾りは**箱の外側**だけ。
 */
export function altarGateOps(ops: BuildOp[]): void {
  const z = 39;
  for (const x of [-3, -2, 2, 3]) {
    ops.push(fill(x, GROUND + 1, z, x, GROUND + 6, z, "polished_blackstone_bricks"));
    ops.push(set(x, GROUND + 7, z, "chiseled_polished_blackstone"));
  }
  ops.push(fill(-1, GROUND + 6, z, 1, GROUND + 6, z, "gilded_blackstone"));
  ops.push(fill(-3, GROUND + 8, z, 3, GROUND + 8, z, "polished_blackstone"));
  for (const x of [-3, 3]) ops.push(set(x, GROUND + 9, z, "glowstone"));
  // ---- 門の手前の敷石。**高さは変えない**（段を作ると門の前が登れなくなる）
  for (let d = 0; d < 3; d++) {
    ops.push(
      fill(-6 + d, GROUND, z - 3 + d, 6 - d, GROUND, z - 3 + d, d === 1 ? "gilded_blackstone" : "polished_blackstone")
    );
  }
  // ---- 湧く所の左右。**足場（x ＝ ±5 まで）の外に立てる**——空けられて浮かないように
  for (const x of [-7, 7]) {
    const t = topAt(x, -40) ?? GROUND;
    ops.push(fill(x, t + 1, -40, x, t + 3, -40, "obsidian"));
    ops.push(set(x, t + 4, -40, "glowstone"));
  }
  ops.push(fill(-AISLE_HALF, GROUND, -34, AISLE_HALF, GROUND, -31, "gilded_blackstone"));
}
