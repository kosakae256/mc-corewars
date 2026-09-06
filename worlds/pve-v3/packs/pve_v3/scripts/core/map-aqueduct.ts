/**
 * 7. 地下水路——天井のある水路（**屋内**）。水路と歩廊
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 7 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 *  z ＝ −40  湧く所（岸）        ┐
 *  z ＝ −28  水路の始まり        │ くびれ → 広間 → くびれ の順で抜ける
 *  z ＝   0  十字に交わる広間     │ 横水路・大落水・側廊の柱
 *  z ＝ +33  水路の終わり        │
 *  z ＝ +39  ゲートの箱          ┘ **岩に穿った窪み。裏へは回れない**
 * ```
 *
 * > ### **岩の塊を置いてから、中を彫る**
 * >
 * > 屋内を「床と壁と天井を積む」で作ると、**天井の上が空になり、
 * > 外周の壁だけが飛び出して、0-8 の塗り広げから切り離される。**
 * >
 * > **半径 48・天面 22 の岩で埋めてから彫れば**、
 * > 上から見た高さはどこも 22 で平ら——**登れない面が生まれない。**
 * > **半径 48 は ±50 の内側**なので、放射に歩けば必ず奈落に出る（0-4）。
 */

import { fill, set, type BuildOp } from "./build.js";
import { arcadeCut, capitals, gateFrame, kerbOps, spanOps, wallDecor } from "./map-aqueduct-hall.js";
import {
  BED_Y,
  DECK,
  MASS_BOT,
  MASS_R,
  MASS_TOP,
  SEED,
  SPRING,
  Z0,
  Z1,
  bedAt,
  ceilAt,
  cellAt,
  deckAt,
  floorAt,
  halfAt,
  isAisleCol,
  isArcade,
  stoneAt,
  vaultAt,
} from "./map-aqueduct-plan.js";
import { headSteps, plazaFloor, rubble } from "./map-aqueduct-floor.js";
import { bridgeOps, canalWater, drainOps, grateOps, outfallOps } from "./map-aqueduct-water.js";
import { clearBox, gateBack, noise, openGate, spawnPad, speckle } from "./map-frame.js";

/** 岩の天面に混ぜる材。**上から見たとき、のっぺりした円盤にしない** */
const CAP_MATS = ["stone", "andesite", "deepslate", "cobblestone", "cobblestone", "dirt"];

/** 岩の塊を置く。**まだ何も彫っていない** */
function bedrock(ops: BuildOp[]): void {
  for (let x = -MASS_R; x <= MASS_R; x++) {
    const h = Math.floor(Math.sqrt(MASS_R * MASS_R - x * x));
    ops.push(fill(x, MASS_BOT, -h, x, MASS_TOP, h, "stone"));
    for (let z = -h; z <= h; z++) {
      // **4 割だけ差し替える**——全マス置くと手順が倍になる
      if (noise(SEED + 61, x, 1, z) > 0.4) continue;
      ops.push(set(x, MASS_TOP, z, speckle(SEED + 7, x, z, CAP_MATS)));
    }
  }
}

/**
 * 部屋を彫る。**1 マスずつ、床・空・天井を決める。**
 *
 * **アーケードと側廊の柱は彫らない**——彫り残しがそのまま柱になる。
 * だから**浮いたブロックが 1 つもない**（`14-map-build.md` 0-5）。
 */
function hollow(ops: BuildOp[]): void {
  for (let z = Z0; z <= Z1; z++) {
    const w = halfAt(z);
    if (w < 1) continue;
    for (let x = -w; x <= w; x++) {
      const c = ceilAt(x, w, z);
      ops.push(set(x, c, z, vaultAt(x, c, z)));
      if (isArcade(x, w) || isAisleCol(x, w, z)) {
        for (let y = BED_Y; y < c; y++) ops.push(set(x, y, z, stoneAt(x, y, z)));
        capitals(ops, x, z, c - 1);
        continue;
      }
      const cell = cellAt(x, z, w);
      const f = floorAt(cell);
      ops.push(fill(x, f + 1, z, x, c - 1, z, "air"));
      ops.push(set(x, f, z, cell === "deck" ? deckAt(x, z) : bedAt(x, z)));
    }
    wallFace(ops, z, w);
  }
}

/** 壁の面を石積みにする。**掘りっぱなしの生石を見せない** */
function wallFace(ops: BuildOp[], z: number, w: number): void {
  for (const sx of [-1, 1]) {
    for (let d = 1; d <= 2; d++) {
      const x = sx * (w + d);
      for (let y = BED_Y; y <= SPRING + 2; y++) ops.push(set(x, y, z, stoneAt(x, y, z)));
    }
  }
}

/**
 * 湧く所を置き直す。
 *
 * > ### `spawnPad` は z ＝ −45 まで抜く
 * >
 * > **部屋の奥は z ＝ −44 まで**なので、そのままだと
 * > **岩の殻に低い隙間が開いて、奥壁が抜けたように見える。** 塞ぎ直す。
 */
function spawnQuay(ops: BuildOp[]): void {
  spawnPad(ops, "stone_bricks");
  ops.push(fill(-6, DECK + 1, -46, 6, 5, -45, "stone_bricks"));
  for (let x = -5; x <= 5; x++) {
    for (let z = -45; z <= -35; z++) ops.push(set(x, DECK, z, deckAt(x, z)));
  }
}

/** 組み立ての手順 */
export function aqueductOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  clearBox(ops);
  bedrock(ops);
  hollow(ops);
  arcadeCut(ops);
  plazaFloor(ops);
  canalWater(ops);
  headSteps(ops);
  // **壁を彫るのは、落とし口より先**——後だと樋の水源を空気で消してしまう
  wallDecor(ops);
  outfallOps(ops);
  drainOps(ops);
  bridgeOps(ops);
  kerbOps(ops);
  spanOps(ops);
  rubble(ops);
  grateOps(ops);
  gateFrame(ops);
  spawnQuay(ops);
  gateBack(ops, "stone_bricks");
  openGate(ops);
  return ops;
}
