/**
 * 10. 石の要塞——石レンガの迷宮（**屋内**）。奥にポータル部屋
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 10 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 * **間取りと材は `map-stronghold-plan.ts`。**
 *
 * ```
 * bedrock()    半径 48 ほどの岩の塊を置く（天面は平ら）
 * hollow()     間取りのぶんだけ、中を彫る
 * faceWalls()  彫り口の面を石レンガに張り替える
 *   …部屋ごとの意匠…
 * ```
 *
 * > ### **積まずに彫る**
 * >
 * > **積むと外壁だけが天井より高くなり、0-8 の塗り広げから切り離される。**
 * > **塊を置いてから彫れば、上から見た高さはどこも平ら**——
 * > 彫り残しがそのまま壁と柱になるので、**浮いたブロックも出ない**（0-5）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, GROUND, gateBack, noise, openGate, spawnPad, speckle } from "./map-frame.js";
import {
  CAP_MATS,
  MASS_BOT,
  MASS_TOP,
  SEED,
  ceilBlockAt,
  floorAt,
  inMass,
  roomRuns,
  runsOf,
  stoneAt,
  wallColumns,
} from "./map-stronghold-plan.js";
import { libraryOps, prisonOps } from "./map-stronghold-rooms.js";
import { crossingOps } from "./map-stronghold-cross.js";
import { corridorOps, coveOps, entranceOps } from "./map-stronghold-halls.js";
import { cisternOps, mossOps, quarryOps, ruinOps, tombOps, wellOps } from "./map-stronghold-side.js";
import { gateFrame, portalRoomOps } from "./map-stronghold-portal.js";

/** 探す端。**塊は ±50 の内側に収まる**（0-1） */
const SCAN = 50;

/**
 * 岩の塊を置く。**まだ何も彫っていない。**
 *
 * **天面は y ＝ 22 で平ら**——ここが凸凹だと 0-8 に落ちる。
 * **縁だけを揺らして**、上から見た輪郭が真円にならないようにする。
 */
function bedrock(ops: BuildOp[]): void {
  for (let x = -SCAN; x <= SCAN; x++) {
    let head: number | undefined;
    for (let z = -SCAN; z <= SCAN + 1; z++) {
      const inside = z <= SCAN && inMass(x, z);
      if (inside && head === undefined) head = z;
      if (!inside && head !== undefined) {
        ops.push(fill(x, MASS_BOT, head, x, MASS_TOP, z - 1, "stone"));
        head = undefined;
      }
    }
    // ---- 天面のまだら。**3 割だけ差し替える**（全マス置くと手順が倍になる）
    for (let z = -SCAN; z <= SCAN; z++) {
      if (!inMass(x, z)) continue;
      if (noise(SEED + 61, x, 1, z) > 0.3) continue;
      ops.push(set(x, MASS_TOP, z, speckle(SEED + 7, x, z, CAP_MATS)));
    }
  }
}

/**
 * 間取りのぶんだけ中を彫る。**床・空・天井を一度に決める。**
 *
 * **同じ天井が続く z は 1 手にまとめる**（`runsOf`）——
 * 柱ごとに置くと、部屋だけで 1 万手を超える。
 */
function hollow(ops: BuildOp[]): void {
  for (const r of roomRuns()) {
    ops.push(fill(r.x, GROUND + 1, r.z1, r.x, r.ceil - 1, r.z2, "air"));
    ops.push(fill(r.x, GROUND, r.z1, r.x, GROUND, r.z2, "stone_bricks"));
    ops.push(fill(r.x, r.ceil, r.z1, r.x, r.ceil, r.z2, "stone_bricks"));
    for (let z = r.z1; z <= r.z2; z++) {
      const f = floorAt(r.x, z);
      if (f !== "stone_bricks") ops.push(set(r.x, GROUND, z, f));
      const c = ceilBlockAt(r.x, z);
      if (c !== "stone_bricks") ops.push(set(r.x, r.ceil, z, c));
    }
  }
}

/**
 * 彫り口の面を石レンガに張り替える。
 *
 * **掘りっぱなしの生石を見せない**——要塞は人の作ったものなので、
 * 面は積んだ石でなければならない。**1 マスごとに苔とひびを引く**（0-7）。
 */
function faceWalls(ops: BuildOp[]): void {
  for (const r of runsOf(wallColumns())) {
    ops.push(fill(r.x, GROUND, r.z1, r.x, r.ceil, r.z2, "stone_bricks"));
    for (let z = r.z1; z <= r.z2; z++) {
      for (let y = GROUND; y <= r.ceil; y++) {
        const b = stoneAt(r.x, y, z);
        if (b !== "stone_bricks") ops.push(set(r.x, y, z, b));
      }
    }
  }
}

/**
 * 湧く所を置き直す。
 *
 * **`spawnPad` は無地の 11 × 11 を敷く**ので、そのままだと玄関の床だけ
 * 塗り絵に見える。**引き直して馴染ませる。**
 */
function spawnHall(ops: BuildOp[]): void {
  spawnPad(ops, "stone_bricks");
  for (let x = -5; x <= 5; x++) {
    for (let z = -45; z <= -35; z++) ops.push(set(x, GROUND, z, floorAt(x, z)));
  }
}

/** 組み立ての手順 */
export function strongholdOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  bedrock(ops);
  hollow(ops);
  faceWalls(ops);
  // **意匠は面を張ったあと**——先に置くと、張り替えに消される
  coveOps(ops);
  corridorOps(ops);
  entranceOps(ops);
  libraryOps(ops);
  prisonOps(ops);
  crossingOps(ops);
  wellOps(ops);
  tombOps(ops);
  mossOps(ops);
  ruinOps(ops);
  cisternOps(ops);
  quarryOps(ops);
  portalRoomOps(ops);
  spawnHall(ops);
  // **裏を塞いでから枠を飾る**——逆にすると `gateBack` が敷居を塗り潰す
  gateBack(ops, "stone_bricks");
  gateFrame(ops);
  openGate(ops);
  return ops;
}
