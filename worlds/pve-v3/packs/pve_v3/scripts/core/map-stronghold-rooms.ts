/**
 * 10. 石の要塞——**見どころの 3 部屋。** 図書室・牢・中央の広間。
 *
 * 間取りは `map-stronghold-plan.ts`。**廊下と小部屋は `map-stronghold-halls.ts`。**
 *
 * > ### **x ＝ 0 には何も立てない**
 * >
 * > 検査 0-3 の線が **x ＝ 0・y ＝ 2〜6** を通る（`14-map-build.md` 0-9）。
 * > 中央の広間の噴水は**床より下に掘る**ので、線に当たらない。
 */

import { fill, set, type BuildOp } from "./build.js";
import { GROUND, noise } from "./map-frame.js";
import { SEED, ceilAt, floorAt, isOpen, stoneAt } from "./map-stronghold-plan.js";

// ================================================================ 図書室

/** 図書室の範囲。**バニラの要塞と同じく 2 層**——下が書架、上が回廊 */
const LIB = { x1: -25, x2: -8, z1: -25, z2: -9, ceil: 13, deck: 6 } as const;

/** 回廊の幅。**壁から 3 マス** */
const DECK_W = 2;

/** 階段の位置。**ここだけ回廊を欠かす**——塞ぐと頭がつかえて上がれない */
const STAIR_X = [-10, -9, -8];
const STAIR_Z0 = -25;
const STAIR_Z1 = -19;

/** 壁からの距離。**0 が壁際** */
function edgeDist(x: number, z: number): number {
  return Math.min(x - LIB.x1, LIB.x2 - x, z - LIB.z1, LIB.z2 - z);
}

/** 部屋の中か */
function inLib(x: number, z: number): boolean {
  return edgeDist(x, z) >= 0;
}

/** 階段の吹き抜けか。**回廊で蓋をすると、頭がつかえて上がれない** */
function onStair(x: number, z: number): boolean {
  return x >= STAIR_X[0] && z >= STAIR_Z0 && z <= STAIR_Z1;
}

/** そこが 2 階の回廊か */
function onDeck(x: number, z: number): boolean {
  if (!inLib(x, z) || onStair(x, z)) return false;
  return edgeDist(x, z) <= DECK_W;
}

/**
 * 図書室。**下は書架の列、上は木の回廊。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function libraryOps(ops: BuildOp[]): void {
  deckFloor(ops);
  deckStair(ops);
  shelfRows(ops);
  wallShelves(ops);
  chandeliers(ops);
  upperWall(ops);
}

/**
 * 回廊より上の壁。**そのままだと 6 マス分の一枚壁が残る**（0-4）。
 *
 * **付け柱を回して、間に明かりを埋める。**
 */
function upperWall(ops: BuildOp[]): void {
  for (let x = LIB.x1; x <= LIB.x2; x++) {
    for (let z = LIB.z1; z <= LIB.z2; z++) {
      if (edgeDist(x, z) !== 0 || onStair(x, z)) continue;
      if ((x + z + 90) % 4 === 0) {
        ops.push(fill(x, LIB.deck + 1, z, x, LIB.ceil - 1, z, "chiseled_stone_bricks"));
        continue;
      }
      if ((x + z + 90) % 4 === 2) ops.push(set(x, LIB.deck + 3, z, "glowstone"));
    }
  }
}

/** 2 階の床と手すり。**支えの柱を下ろす**——宙に浮いた板にしない */
function deckFloor(ops: BuildOp[]): void {
  for (let x = LIB.x1; x <= LIB.x2; x++) {
    for (let z = LIB.z1; z <= LIB.z2; z++) {
      if (!onDeck(x, z)) continue;
      ops.push(set(x, LIB.deck, z, noise(SEED + 71, x, 2, z) < 0.14 ? "cobblestone" : "oak_planks"));
      // ---- 内側の縁だけ手すり。**壁に接する 3 方は要らない**
      const open = (px: number, pz: number): boolean => inLib(px, pz) && !onDeck(px, pz);
      const inner = open(x + 1, z) || open(x - 1, z) || open(x, z + 1) || open(x, z - 1);
      // **階段の降り口だけは手すりを立てない**——立てると上がれなくなる
      if (!inner || (z === STAIR_Z1 + 1 && x >= STAIR_X[0])) continue;
      ops.push(set(x, LIB.deck + 1, z, "oak_fence"));
      // ---- 4 マスに 1 本、下まで支柱を下ろす
      if ((x + z + 64) % 4 !== 0) continue;
      ops.push(fill(x, GROUND + 1, z, x, LIB.deck - 1, z, "oak_fence"));
    }
  }
}

/** 回廊へ上がる段。**1 マスずつ**——2 マス飛ばすと登れない（0-8） */
function deckStair(ops: BuildOp[]): void {
  for (let z = STAIR_Z0 + 1; z <= STAIR_Z1; z++) {
    const h = z - STAIR_Z0;
    for (const x of STAIR_X) {
      ops.push(fill(x, GROUND + 1, z, x, h, z, "stone_bricks"));
      ops.push(set(x, h, z, floorAt(x, z)));
    }
  }
}

/** 書架の列。**通り抜けの隙間を空ける**——壁になってしまうと戦えない */
function shelfRows(ops: BuildOp[]): void {
  for (const z of [-22, -19, -16, -13]) {
    for (let x = -21; x <= -12; x++) {
      if ((x + 21 + (z % 3)) % 5 === 4) continue;
      const top = noise(SEED + 83, x, 4, z) < 0.2 ? 2 : 3;
      ops.push(fill(x, GROUND + 1, z, x, top, z, "bookshelf"));
      if (noise(SEED + 89, x, 5, z) < 0.1) ops.push(set(x, top, z, "web"));
      // ---- 書架の上に灯り。**1 階が暗いままだと、列が読めない**
      else if (noise(SEED + 91, x, 6, z) < 0.14) ops.push(set(x, top + 1, z, "lantern"));
    }
  }
}

/** 壁際の書架。**戸口の前だけ空ける**——塞ぐと部屋が孤立する */
function wallShelves(ops: BuildOp[]): void {
  for (let x = LIB.x1; x <= LIB.x2; x++) {
    for (let z = LIB.z1; z <= LIB.z2; z++) {
      if (edgeDist(x, z) !== 0) continue;
      if (onStair(x, z)) continue;
      // **外へ抜けている所は戸口**——書架で塞ぐと部屋が孤立する
      if (nearDoor(x, z)) continue;
      const top = noise(SEED + 97, x, 6, z) < 0.25 ? 1 : 2;
      ops.push(fill(x, GROUND + 1, z, x, top, z, "bookshelf"));
    }
  }
}

/** 部屋の外へ抜けている所か。**戸口の前** */
function nearDoor(x: number, z: number): boolean {
  const out = (px: number, pz: number): boolean =>
    isOpen(px, pz) && (px < LIB.x1 || px > LIB.x2 || pz < LIB.z1 || pz > LIB.z2);
  return out(x - 1, z) || out(x + 1, z) || out(x, z - 1) || out(x, z + 1);
}

/** 天井から吊る灯り。**鎖で下ろす**——回廊の上も明るくする */
function chandeliers(ops: BuildOp[]): void {
  for (const x of [-20, -13]) {
    for (const z of [-21, -13]) {
      ops.push(fill(x, LIB.ceil - 2, z, x, LIB.ceil - 1, z, "iron_chain"));
      ops.push(set(x, LIB.ceil - 3, z, "glowstone"));
    }
  }
}

// ================================================================ 牢

/** 房の並ぶ枠。**この外側は見回りの通路** */
const CELLS = { x1: 12, x2: 21, z1: -21, z2: -13 } as const;

/** 仕切りの線 */
const CELL_X = [12, 15, 18, 21];
const CELL_Z = [-21, -17, -13];

/**
 * 牢。**外周が見回りの通路、内側に 6 房。**
 *
 * **副作用: `ops` に手順を足す。**
 */
export function prisonOps(ops: BuildOp[]): void {
  // **房の高さは部屋より低い**——見張りの通路から房の屋根越しに見渡せる
  const top = 5;
  for (const x of CELL_X) ops.push(fill(x, GROUND + 1, CELLS.z1, x, top, CELLS.z2, "stone_bricks"));
  for (const z of CELL_Z) ops.push(fill(CELLS.x1, GROUND + 1, z, CELLS.x2, top, z, "stone_bricks"));
  // ---- 房の天端。**彫り石の笠石を回す**——切りっぱなしの壁にしない
  for (const x of CELL_X) ops.push(fill(x, top, CELLS.z1, x, top, CELLS.z2, "chiseled_stone_bricks"));
  for (const z of CELL_Z) ops.push(fill(CELLS.x1, top, z, CELLS.x2, top, z, "chiseled_stone_bricks"));
  cellFronts(ops, top);
  cellStuff(ops);
  cellSides(ops);
  roofStair(ops);
  prisonLights(ops);
}

/**
 * 房の側面。**格子の小窓を開ける。**
 *
 * **側面は 9 マスの一枚壁**になっていて、見回りの通路から見ると
 * **ただの箱**にしか見えなかった（0-4）。
 */
function cellSides(ops: BuildOp[]): void {
  for (const x of [CELLS.x1, CELLS.x2]) {
    for (const z of [-19, -15]) {
      ops.push(fill(x, GROUND + 2, z, x, GROUND + 3, z, "iron_bars"));
      ops.push(set(x, GROUND + 4, z, "chiseled_stone_bricks"));
    }
  }
}

/**
 * 房の屋根へ上がる段。
 *
 * **屋根は高さ 5。上がれないまま残すと、そこに湧いた敵を誰も倒せない**
 * （`14-map-build.md` 0-8）。**1 マスずつ上げて、登れるようにする。**
 */
function roofStair(ops: BuildOp[]): void {
  for (let i = 0; i < 4; i++) {
    const x = 25 - i;
    ops.push(fill(x, GROUND + 1, -17, x, GROUND + 1 + i, -17, "stone_bricks"));
    ops.push(set(x, GROUND + 1 + i, -17, floorAt(x, -17)));
  }
}

/** 見張りの通路の灯り。**房の中は暗いまま**にして、明暗を付ける */
function prisonLights(ops: BuildOp[]): void {
  for (const z of [-24, -20, -16, -12, -10]) {
    for (const x of [10, 23]) {
      ops.push(set(x, GROUND + 1, z, "cobblestone_wall"));
      ops.push(set(x, GROUND + 2, z, "lantern"));
    }
  }
  for (const x of [12, 17, 21]) {
    ops.push(set(x, GROUND + 1, -23, "torch"));
    ops.push(set(x, GROUND + 1, -11, "torch"));
  }
  for (let z = -23; z <= -11; z += 6) ops.push(set(16, ceilAt(16, z), z, "glowstone"));
}

/** 房の格子。**1 房だけ壊れている**——同じ形を並べない（0-6） */
function cellFronts(ops: BuildOp[], top: number): void {
  for (let i = 0; i < 3; i++) {
    const x1 = CELL_X[i] + 1;
    const x2 = CELL_X[i + 1] - 1;
    for (const z of [CELLS.z1, CELLS.z2]) {
      if (i === 1 && z === CELLS.z1) {
        // ---- 破れた房。**格子が無く、瓦礫が散っている**
        ops.push(fill(x1, GROUND + 1, z, x2, top, z, "air"));
        ops.push(set(x1, GROUND, z, "cobblestone"));
        ops.push(set(x2, GROUND, z, "cobblestone"));
        continue;
      }
      ops.push(fill(x1, GROUND + 1, z, x2, top - 1, z, "iron_bars"));
    }
  }
}

/** 房の中身。**骨と蜘蛛の巣と、青い灯り** */
function cellStuff(ops: BuildOp[]): void {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      const x = CELL_X[i] + 1 + (j % 2);
      const z = CELL_Z[j] + 2;
      if (noise(SEED + 101, i, j) < 0.5) ops.push(set(x, GROUND + 1, z, "skeleton_skull"));
      ops.push(set(CELL_X[i] + 2, GROUND + 4, CELL_Z[j] + 1, "web"));
      if (i === 2) ops.push(set(CELL_X[i] + 1, GROUND + 1, CELL_Z[j] + 3, "soul_lantern"));
    }
  }
}
