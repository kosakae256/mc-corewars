/**
 * 15. 地下墓所——低い天井、柱と棺（**屋内**）
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 15 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 * **間取りは `map-crypt-plan.ts`、材は `map-crypt-mat.ts`。**
 *
 * ```
 * bedrock()    半径 47 ほどの岩の塊を置く（天面は y ＝ 17 で平ら）
 * hollow()     間取りのぶんだけ、中を彫る
 * faceWalls()  彫り口の面を深層岩に張り替える
 *   …部屋ごとの意匠…
 * ```
 *
 * > ### **積まずに彫る**
 * >
 * > **積むと外壁だけが天井より高くなり、0-8 の塗り広げから切り離される。**
 * > **塊を置いてから彫れば、上から見た高さはどこも平ら**——
 * > 彫り残しがそのまま壁になるので、**浮いたブロックも出ない**（0-5）。
 *
 * > ### **平面だけの戦い**（企画）
 * >
 * > **上に逃げられない。** 天井は通路 5〜6、広間 8〜12 マス。
 * > **弓は使えるが、高い足場は無い**——柱の陰に回り込むしかない。
 */

import { fill, set, type BuildOp } from "./build.js";
import { clearBox, gateBack, noise, openGate, spawnPad, speckle } from "./map-frame.js";
import { MASS_BOT, MASS_TOP, SEED, inMass, roomRuns, runsOf, wallColumns } from "./map-crypt-plan.js";
import { CAP_MATS, ceilAt, floorAt, stoneAt } from "./map-crypt-mat.js";
import { forestOps, naveOps } from "./map-crypt-hall.js";
import { rotundaOps } from "./map-crypt-rot.js";
import { collapseOps, galleryOps, ossuaryOps } from "./map-crypt-tomb.js";
import { chamberOps, gateFrame } from "./map-crypt-deep.js";

/** 探す端。**塊は ±50 の内側に収まる**（0-1） */
const SCAN = 50;

/**
 * 岩の塊を置く。**まだ何も彫っていない。**
 *
 * **天面は y ＝ 17 で平ら**——ここが凸凹だと 0-8 に落ちる。
 * **縁だけを揺らして**、上から見た輪郭が真円にならないようにする。
 */
function bedrock(ops: BuildOp[]): void {
  for (let x = -SCAN; x <= SCAN; x++) {
    let head: number | undefined;
    for (let z = -SCAN; z <= SCAN + 1; z++) {
      const inside = z <= SCAN && inMass(x, z);
      if (inside && head === undefined) head = z;
      if (!inside && head !== undefined) {
        ops.push(fill(x, MASS_BOT, head, x, MASS_TOP, z - 1, "deepslate"));
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
 * **同じ天井・同じ床が続く z は 1 手にまとめる**（`runsOf`）——
 * 柱ごとに置くと、主室だけで 1 万手を超える。
 */
function hollow(ops: BuildOp[]): void {
  for (const r of roomRuns()) {
    ops.push(fill(r.x, r.floor + 1, r.z1, r.x, r.ceil - 1, r.z2, "air"));
    ops.push(fill(r.x, r.floor, r.z1, r.x, r.floor, r.z2, "deepslate_tiles"));
    ops.push(fill(r.x, r.ceil, r.z1, r.x, r.ceil, r.z2, "deepslate_bricks"));
    for (let z = r.z1; z <= r.z2; z++) {
      const f = floorAt(r.x, z);
      if (f !== "deepslate_tiles") ops.push(set(r.x, r.floor, z, f));
      const c = ceilAt(r.x, z);
      if (c !== "deepslate_bricks") ops.push(set(r.x, r.ceil, z, c));
    }
  }
}

/**
 * 彫り口の面を深層岩に張り替える。
 *
 * **掘りっぱなしの生石を見せない**——墓所は人の作ったものなので、
 * 面は積んだ石でなければならない。**1 マスごとに苔とひびを引く**（0-7）。
 */
function faceWalls(ops: BuildOp[]): void {
  for (const r of runsOf(wallColumns())) {
    ops.push(fill(r.x, r.floor, r.z1, r.x, r.ceil, r.z2, "deepslate_bricks"));
    for (let z = r.z1; z <= r.z2; z++) {
      for (let y = r.floor; y <= r.ceil; y++) {
        const b = stoneAt(r.x, y, z);
        if (b !== "deepslate_bricks") ops.push(set(r.x, y, z, b));
      }
    }
  }
}

/**
 * 湧く所を置き直す。
 *
 * **`spawnPad` は無地の 11 × 11 を敷く**ので、そのままだと入口の床だけ
 * 塗り絵に見える。**引き直して馴染ませる。**
 */
function spawnStair(ops: BuildOp[]): void {
  spawnPad(ops, "deepslate_tiles");
  for (let x = -5; x <= 5; x++) {
    for (let z = -45; z <= -35; z++) ops.push(set(x, 0, z, floorAt(x, z)));
  }
}

/** 組み立ての手順 */
export function cryptOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  bedrock(ops);
  hollow(ops);
  faceWalls(ops);
  // **意匠は面を張ったあと**——先に置くと、張り替えに消される
  naveOps(ops);
  forestOps(ops);
  rotundaOps(ops);
  galleryOps(ops);
  ossuaryOps(ops);
  collapseOps(ops);
  chamberOps(ops);
  spawnStair(ops);
  // **裏を塞いでから枠を飾る**——逆にすると `gateBack` が敷居を塗り潰す
  gateBack(ops, "deepslate_bricks");
  gateFrame(ops);
  openGate(ops);
  return ops;
}
