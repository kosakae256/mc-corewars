/**
 * 戦場 04「廃村」（`ruinvill`）。**純粋。**
 *
 * 企画は `worlds/pve-v3/docs/02-map.md` 5 章の 4 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ## コンセプト
 *
 * > ### **石垣に囲まれた村が、そのまま宙に浮いている。**
 * >
 * > 屋根の落ちた家が肩を寄せ合い、**その隙間が細い路地**になっている。
 * > 崩れた壁は瓦礫の坂になっていて、**そこから屋根の上へも回れる**——
 * > **平面の迷路であり、上下の迷路でもある。**
 * >
 * > 手前は畑の跡と朽ちた門。まっすぐ伸びる目抜き通りの果てに、
 * > **屋根の落ちた教会**があり、その内陣にゲートが立つ。
 * >
 * > **落ちる所は村の中に無い。** ただし**石垣の外は奈落**——
 * > 崩れた狭間から覗くと、雲の下まで抜けている。
 *
 * ## 中身の分かれ方
 *
 * | | |
 * | --- | --- |
 * | `map-ruinvill-const.ts` | 島の形・石垣・道・材 |
 * | `map-ruinvill-house.ts` | 崩れた家 1 軒の組み方 |
 * | `map-ruinvill-town.ts` | 町割り（36 軒・教会・広場・外れ） |
 * | `map-ruinvill-prop.ts` | 井戸・炉・荷車・柵・畑・枯木・墓 |
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, GROUND, noise, openGate, spawnPad } from "./map-frame.js";
import { townOps } from "./map-ruinvill-town.js";
import { scatter } from "./map-ruinvill-prop.js";
import {
  bastion,
  deepMat,
  depthAt,
  groundMat,
  inset,
  breachPoints,
  isLand,
  isPaved,
  SEED,
  streetX,
  subMat,
  wallHeight,
  wallWidth,
} from "./map-ruinvill-const.js";

/** 島の底の下限。**ここより下へは掘らない**（`14-map-build.md` 0-1） */
const FLOOR = -46;

/**
 * 島を積む。
 *
 * 下から **底の石 → 上澄み → 地面**。**柱ごとに 1 マスずつ材を引く**（0-7）ので、
 * 裏から見ると、地層が斑になって見える。
 */
function island(ops: BuildOp[]): void {
  for (let x = -48; x <= 48; x++) {
    for (let z = -48; z <= 48; z++) {
      if (!isLand(x, z)) continue;
      const bottom = Math.max(FLOOR, GROUND - depthAt(x, z));
      const sub = Math.max(bottom, GROUND - 3);
      if (sub - 1 >= bottom) ops.push(fill(x, bottom, z, x, sub - 1, z, deepMat(x, z)));
      ops.push(fill(x, sub, z, x, GROUND - 1, z, subMat(x, z)));
      ops.push(set(x, GROUND, z, groundMat(x, z)));
    }
  }
}

/**
 * 島の裏から垂れるもの。**下から支えが続いていること**（0-5）。
 *
 * **細い根**を数本。太い柱を並べると、下から見たときに作り物に見える。
 */
function roots(ops: BuildOp[]): void {
  for (let x = -34; x <= 34; x += 1) {
    for (let z = -34; z <= 34; z += 1) {
      if (noise(SEED + 71, x, z) > 0.012 || !isLand(x, z)) continue;
      const bottom = Math.max(FLOOR, GROUND - depthAt(x, z));
      const len = 3 + Math.round(noise(SEED + 73, x, z) * 9);
      ops.push(fill(x, Math.max(FLOOR, bottom - len), z, x, bottom - 1, z, "dripstone_block"));
    }
  }
}

/**
 * 村を囲む石垣。
 *
 * > ### **外へは出られない**（0-4）
 * >
 * > **石垣の外側の面が、そのまま島の縁。** その先は奈落。
 * >
 * > ### **平らな一枚壁にしない**（0-4）
 * >
 * > **稜堡で内側へ太らせ**、**外の一列は狭間**（1 マスおきに ＋1）、
 * > **内側の面には控え柱**を落とす。**崩れて 1 マスまで下がる所**もあり、
 * > そこが塁上への上がり口になる。
 */
function rampart(ops: BuildOp[]): void {
  const breaches = breachPoints();
  for (let x = -48; x <= 48; x++) {
    for (let z = -48; z <= 48; z++) {
      if (!isLand(x, z)) continue;
      const d = inset(x, z);
      const w = wallWidth(x, z);
      if (d >= w) continue;
      let top = wallHeight(x, z);
      // **狭間**——外の一列だけ、2 マスおきに立ち上げる。
      //
      // **切れ目より先に足す。** 後から足すと、
      // **切れ目の坂の途中で 2 マスの段差**になり、そこが登れない面になる（0-8）。
      if (d < 1 && (((x + z) % 4) + 4) % 4 < 2 && top >= 2) top += 1;
      // **崩れ落ちた切れ目**——中心で 0、そこから升目 1 マスにつき 1 段ずつ戻る
      for (const b of breaches) top = Math.min(top, Math.max(Math.abs(x - b.x), Math.abs(z - b.z)));
      // **内側の一列は 1 段落とす**——塁上に歩ける幅を作る
      if (d >= w - 1 && top >= 2) top -= 1;
      if (top < 1) continue;
      const r = noise(SEED + 77, x, z);
      const face =
        d < 1
          ? r > 0.6
            ? "mossy_cobblestone"
            : r > 0.3
              ? "cobblestone"
              : "cracked_stone_bricks"
          : r > 0.72
            ? "mossy_stone_bricks"
            : r > 0.5
              ? "stone_bricks"
              : r > 0.26
                ? "cobblestone"
                : "andesite";
      ops.push(fill(x, GROUND + 1, z, x, GROUND + top, z, face));
      // **控え柱**——稜堡の裾に、太い付け柱を落とす
      if (bastion(x, z) > 0.72 && d >= w - 1 && (x * 3 + z) % 7 === 0) {
        ops.push(fill(x, GROUND + 1, z, x, GROUND + Math.max(1, top - 1), z, "chiseled_stone_bricks"));
      }
    }
  }
}

/** 目抜き通りの敷石。**両側に側溝を彫る**——通りが 1 本に見えるように */
function street(ops: BuildOp[]): void {
  for (let z = -46; z <= 38; z++) {
    const c = streetX(z);
    for (let dx = -4; dx <= 4; dx++) {
      const x = c + dx;
      if (!isLand(x, z)) continue;
      if (Math.abs(dx) === 4) {
        ops.push(set(x, GROUND, z, noise(SEED + 79, x, z) > 0.5 ? "cobblestone" : "coarse_dirt"));
        continue;
      }
      const r = noise(SEED + 81, x, z);
      ops.push(
        set(
          x,
          GROUND,
          z,
          r > 0.74
            ? "mossy_cobblestone"
            : r > 0.5
              ? "cobblestone"
              : r > 0.28
                ? "andesite"
                : r > 0.1
                  ? "stone"
                  : "cobblestone"
        )
      );
    }
  }
}

/**
 * 目抜き通りの上を空ける。**いちばん最後に通す。**
 *
 * > ### 湧いた所からゲートまで、線が通っていること（0-3）
 * >
 * > **建物は見えなくてよい**が、**一本道は塞がない。**
 * > **y ＝ 8 より上には渡してよい**ので、門の梁はそこに架けてある。
 */
function lane(ops: BuildOp[]): void {
  for (let z = -47; z <= 38; z++) {
    const c = streetX(z);
    ops.push(fill(c - 3, GROUND + 1, z, c + 3, GROUND + 12, z, "air"));
  }
  // ---- 湧く所の前。**村の門は崩れ落ちて、石垣がそこだけ無い**
  //
  // > ### 途中の高さで切らない
  // >
  // > 石垣を上から下まで抜く。**中途半端に抜くと、上に残った石が宙に浮く**（0-5）。
  ops.push(fill(-6, GROUND + 1, -47, 6, GROUND + 12, -36, "air"));
}

/** 湧く所。**焚き火と、荷を下ろした跡** */
function camp(ops: BuildOp[]): void {
  spawnPad(ops, "cobblestone", 5);
  for (let x = -6; x <= 6; x++) {
    for (let z = -46; z <= -34; z++) {
      if (!isLand(x, z) || isPaved(x, z)) continue;
      const r = noise(SEED + 83, x, z);
      if (r > 0.4) continue;
      ops.push(set(x, GROUND, z, r > 0.24 ? "cobblestone" : r > 0.1 ? "cobblestone" : "coarse_dirt"));
    }
  }
  ops.push(set(0, GROUND + 1, -43, "campfire"));
  for (const dx of [-5, 5]) {
    ops.push(fill(dx, GROUND + 1, -40, dx, GROUND + 3, -40, "cobblestone"));
    ops.push(set(dx, GROUND + 4, -40, "lantern"));
  }
}

/** 組む手順 */
export function ruinvillOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  island(ops);
  roots(ops);
  rampart(ops);
  street(ops);
  townOps(ops);
  scatter(ops, SEED + 87);
  // **通りを空けてから、湧く所を置き直す**——
  // 焚き火や灯を先に置くと、空けるときに一緒に消える
  lane(ops);
  camp(ops);
  openGate(ops);
  return ops;
}
