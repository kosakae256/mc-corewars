/**
 * 15. 地下墓所——**奥の玄室と、ゲートの枠。**
 *
 * 間取りは `map-crypt-plan.ts`、材は `map-crypt-mat.ts`、造作は `map-crypt-fit.ts`。
 *
 * ```
 *   z ＝ +17  戸口 3 つ（中央 ／ 西 ／ 東）  楣をくぐる
 *   z ＝ +20  玄室。列柱 12 本と、壁龕の棺
 *   z ＝ +35  墓標の対（高さ 8）
 *   z ＝ +39  ゲートの箱  **空けておく。ポータルは置かない**
 * ```
 *
 * > ### **中央の筋を空けたまま奥まで通す**
 * >
 * > 0-3 の線は、玄室では **y ＝ 6〜7** を通る（`map-crypt-plan.ts`）。
 * > **|x| ≤ 3 には柱も棺も吊り灯りも置かない。**
 * > 結果として**まっすぐな参道**になり、どこへ行けばよいかも分かる。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND } from "./map-frame.js";
import { GATE_Z } from "./map-frame.js";
import { SPACES, ceilAt, isOpen } from "./map-crypt-plan.js";
import { INLAY, pillarAt, stoneAt } from "./map-crypt-mat.js";
import { cobweb, coffin, hang, niche, pick } from "./map-crypt-fit.js";

/** 玄室の範囲 */
const HALL = { x1: -19, x2: 19, z1: 20, z2: 38, ceil: 10 } as const;

/** 玄室ぜんぶ。**副作用: `ops` に手順を足す。** */
export function chamberOps(ops: BuildOp[]): void {
  lintels(ops);
  cove(ops);
  colonnade(ops);
  wallTombs(ops);
  aisle(ops);
  markers(ops);
  chamberLights(ops);
}

/**
 * 戸口の楣。**開口の頭を彫り石にして、脇に立て枠を付ける。**
 *
 * **塞がない**——跨ぐ石を置いても、**下は空いたまま**にする
 * （`14-map-build.md` 0 章「要石を落とす」）。
 */
function lintels(ops: BuildOp[]): void {
  for (const s of SPACES) {
    if (!s.name.endsWith("戸口")) continue;
    for (let x = s.x1; x <= s.x2; x++) {
      for (let z = s.z1; z <= s.z2; z++) {
        ops.push(set(x, s.ceil, z, "chiseled_deepslate"));
        ops.push(set(x, s.ceil - 1, z, stoneAt(x, s.ceil - 1, z)));
      }
    }
    // ---- 脇の立て枠。**開口の外側の柱を彫り石にする**
    for (const [x, z] of jambs(s.x1, s.x2, s.z1, s.z2)) {
      if (isOpen(x, z)) continue;
      ops.push(fill(x, GROUND + 1, z, x, s.ceil - 1, z, "chiseled_deepslate"));
    }
  }
}

/** 開口の左右にある柱の座標 */
function jambs(x1: number, x2: number, z1: number, z2: number): [number, number][] {
  const out: [number, number][] = [];
  if (x2 - x1 >= z2 - z1) {
    for (let z = z1; z <= z2; z++) {
      out.push([x1 - 1, z]);
      out.push([x2 + 1, z]);
    }
    return out;
  }
  for (let x = x1; x <= x2; x++) {
    out.push([x, z1 - 1]);
    out.push([x, z2 + 1]);
  }
  return out;
}

/**
 * 天井の縁を 1 段下げる。
 *
 * **平らな一枚天井は、平らな一枚壁と同じで手抜きに見える**（`14-map-build.md` 0-4）。
 * **縁を落とすと、真ん中が持ち上がって見える。**
 */
function cove(ops: BuildOp[]): void {
  for (let x = HALL.x1; x <= HALL.x2; x++) {
    for (let z = HALL.z1; z <= HALL.z2; z++) {
      const rim = x <= HALL.x1 + 1 || x >= HALL.x2 - 1 || z <= HALL.z1 + 1 || z >= HALL.z2 - 1;
      if (!rim || !isOpen(x, z)) continue;
      ops.push(set(x, HALL.ceil - 1, z, stoneAt(x, HALL.ceil - 1, z)));
    }
  }
}

/** 列柱 12 本。**内側は細く、外側は太く**——奥行きが出る */
function colonnade(ops: BuildOp[]): void {
  for (const x of [-13, -7, 7, 13]) {
    for (const z of [23, 28, 33]) {
      if (!isOpen(x, z)) continue;
      const top = ceilAt(x, z) - 1;
      ops.push(fill(x, GROUND + 1, z, x, top, z, "polished_deepslate"));
      for (let y = GROUND + 1; y <= top; y++) {
        const b = pillarAt(x, y, z);
        if (b !== "polished_deepslate") ops.push(set(x, y, z, b));
      }
      ops.push(set(x, GROUND + 1, z, "chiseled_deepslate"));
      ops.push(set(x, top, z, "chiseled_deepslate"));
      ops.push(set(x, top - 3, z, "chiseled_deepslate"));
      if (Math.abs(x) === 13) ops.push(set(x, GROUND + 4, z, "glowstone"));
      // ---- 柱の頭から天井へ差す迫り持ち
      for (const dx of [-1, 1]) {
        if (isOpen(x + dx, z)) ops.push(set(x + dx, ceilAt(x + dx, z) - 1, z, "chiseled_deepslate"));
      }
    }
  }
}

/** 側壁の棺。**壁龕を 2 段に彫り、床にも石棺を並べる** */
function wallTombs(ops: BuildOp[]): void {
  for (const [wx, d] of [
    [HALL.x1 - 1, -1],
    [HALL.x2 + 1, 1],
  ]) {
    for (let z = HALL.z1 + 2; z <= HALL.z2 - 2; z += 2) {
      if (isOpen(wx, z) || isOpen(wx + d, z)) continue;
      niche(ops, wx, GROUND + 1, z, 2, 233);
      niche(ops, wx, GROUND + 4, z, 1, 239);
    }
  }
  for (const x of [-16, 16, -10, 10]) {
    for (const z of [21, 26, 31]) {
      if (!isOpen(x, z)) continue;
      if (pick(241, x, 0, z) > 0.72) continue;
      coffin(ops, x, GROUND + 1, z, "z", 3, 251);
    }
  }
}

/** 参道の敷石。**中央を通す帯**——ここには何も立てない（0-3） */
function aisle(ops: BuildOp[]): void {
  for (let z = HALL.z1; z <= HALL.z2; z++) {
    for (let x = -3; x <= 3; x++) {
      if (!isOpen(x, z)) continue;
      ops.push(set(x, GROUND, z, Math.abs(x) === 3 ? INLAY : "polished_deepslate"));
    }
  }
  // ---- 玄室の真ん中の輪。**足元にも見どころを作る**
  for (let x = -10; x <= 10; x++) {
    for (let z = 19; z <= 39; z++) {
      const r = Math.hypot(x, z - 29);
      if (r < 8.4 || r > 9.6 || !isOpen(x, z)) continue;
      // **白で描く**——深層岩どうしの濃淡は、この暗さでは見えない
      ops.push(set(x, GROUND, z, INLAY));
    }
  }
}

/**
 * ゲートの手前に立つ墓標の対。**高さ 8。**
 *
 * **中央（|x| ≤ 3）は空けたまま**——ゲートまで歩いて行けること。
 */
function markers(ops: BuildOp[]): void {
  for (const x of [-6, 6]) {
    ops.push(fill(x, GROUND + 1, 35, x + Math.sign(x), GROUND + 8, 37, "polished_basalt"));
    for (let y = GROUND + 1; y <= GROUND + 8; y++) {
      for (const dx of [0, Math.sign(x)]) {
        for (const z of [35, 36, 37]) {
          const b = pillarAt(x + dx, y, z);
          if (b !== "polished_basalt") ops.push(set(x + dx, y, z, b));
        }
      }
    }
    ops.push(fill(x, GROUND + 8, 35, x + Math.sign(x), GROUND + 8, 37, "chiseled_deepslate"));
    ops.push(set(x, GROUND + 4, 34, "soul_lantern"));
    ops.push(set(x, GROUND + 1, 34, "chiseled_deepslate"));
    // ---- 墓標に埋める火。**ゲートの手前を、いちばん明るくする**
    ops.push(set(x + Math.sign(x), GROUND + 5, 36, "glowstone"));
    ops.push(set(x, GROUND + 8, 36, "lantern"));
  }
}

/** 玄室の灯り。**中央の筋には吊らない**（0-3 の線が通る） */
function chamberLights(ops: BuildOp[]): void {
  for (const x of [-10, 10]) {
    for (const z of [22, 27, 32]) {
      if (!isOpen(x, z)) continue;
      hang(ops, x, z, ceilAt(x, z), 2, pick(257, x, 0, z) < 0.5 ? "lantern" : "soul_lantern");
    }
  }
  // ---- 壁の燭。**壁に接した所だけ**（浮かせない・0-5）。壁龕は y ＝ 1・2・4 なので 3 は残る
  for (const x of [HALL.x1, HALL.x2]) {
    for (const z of [24, 30, 36]) {
      if (!isOpen(x, z) || isOpen(x + Math.sign(x), z)) continue;
      ops.push(set(x, GROUND + 3, z, "torch"));
    }
  }
  // ---- 天井に埋める明かり。**広間が 19 × 39 もあるので、吊り灯りだけでは奥が沈む**
  for (const x of [-12, -5, 5, 12]) {
    for (const z of [24, 30, 35]) {
      if (!isOpen(x, z)) continue;
      ops.push(set(x, ceilAt(x, z), z, "glowstone"));
    }
  }
  for (const [x, z] of [
    [-18, 21],
    [18, 37],
    [-15, 34],
  ]) {
    if (!isOpen(x, z)) continue;
    cobweb(ops, x, ceilAt(x, z) - 1, z);
  }
}

/**
 * ゲートの枠。
 *
 * > ### **箱の中には何も置かない**
 * >
 * > **(1,1,39)〜(−1,5,39) は空ける**（`14-map-build.md` 0-2-1）——
 * > **ポータルは、敵を倒し切ったときに進行の側が置く。**
 * > **飾りは箱の外側**（|x| ≥ 2、または z ＝ 38）に付ける。
 *
 * **副作用: `ops` に手順を足す。**
 */
export function gateFrame(ops: BuildOp[]): void {
  for (const x of [-2, 2]) {
    ops.push(fill(x, GROUND + 1, GATE_Z, x, GROUND + 6, GATE_Z, "chiseled_deepslate"));
    ops.push(fill(x, GROUND + 1, GATE_Z - 1, x, GROUND + 6, GATE_Z - 1, "polished_deepslate"));
    ops.push(set(x, GROUND + 5, GATE_Z - 1, "soul_lantern"));
  }
  for (let x = -2; x <= 2; x++) {
    ops.push(set(x, GROUND + 6, GATE_Z, "chiseled_deepslate"));
    ops.push(set(x, GROUND + 7, GATE_Z, "cracked_deepslate_bricks"));
    ops.push(set(x, GROUND + 7, GATE_Z - 1, "chiseled_deepslate"));
  }
  // ---- 敷居。**箱の外（z ＝ 38）に一段の帯を敷く**
  for (let x = -3; x <= 3; x++) ops.push(set(x, GROUND, GATE_Z - 1, INLAY));
  // ---- ゲートの脇の火。**行き先がいちばん明るくないと、どこへ向かうのか分からない**
  for (const x of [-3, 3]) {
    ops.push(set(x, GROUND + 3, GATE_Z - 1, "lantern"));
    ops.push(set(x, GROUND + 6, GATE_Z - 1, "glowstone"));
  }
}
