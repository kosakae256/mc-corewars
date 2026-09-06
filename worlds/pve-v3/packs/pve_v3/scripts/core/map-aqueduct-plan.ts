/**
 * 7. 地下水路——**寸法・断面・材の引き方。**
 *
 * 何を作るかは `worlds/pve-v3/docs/02-map.md` 5 章の 7 番。
 * 決まりは `spec/14-map-build.md` 0 章。**骨組みは `core/map-frame.ts`。**
 *
 * ```
 *        岩の塊（半径 48・天面 y ＝ 22）を置いてから、中を彫る
 *          ┌──────────────── 丸天井（頂 16）──────────────┐
 *          │        ┌ アーケード（x ＝ ±13）┐              │
 *   側廊 ──┤ 歩廊  ‖   水路 |x| ≤ 4   ‖  歩廊 ├── 側廊 ──┤
 *          └────────┴─ 水面 y ＝ −1 ─┴─────────────────┘
 * ```
 *
 * > ### **外壁ではなく「岩の塊」で閉じる**
 * >
 * > **半径 48 の円で終わらせる**と、放射に歩いたとき必ず**奈落**に出る
 * > （`14-map-build.md` 0-4）。**天面が平ら**なので、
 * > **0-8 の塗り広げも塊の上を素通りする**——屋内なのに登れない面が出ない。
 */

import { noise } from "./map-frame.js";

/** 種。**変えれば苔の散り方が変わる** */
export const SEED = 2685;

/** 岩の塊。**±50 の内側で、放射がどの向きでも奈落に出る大きさ** */
export const MASS_R = 48;
export const MASS_TOP = 22;
export const MASS_BOT = -10;

/** 部屋を収める円。**塊との差 3 マスが岩の殻** */
export const ROOM_R = 45;

/** 部屋の手前端と奥端。**z ＝ 39 のゲートの面は岩のまま**（裏へ回らせない） */
export const Z0 = -44;
export const Z1 = 38;

/** 歩廊の天面。**人は y ＝ 1 に立つ** */
export const DECK = 0;

/** 水路。**底 −4・水面 −1**——歩廊との差は 1 マスなので、落ちても上がれる */
export const BED_Y = -4;
export const WATER_Y = -1;

/** 樋（壁沿いの溝）。**深さ 1** */
export const GUT_Y = -2;

/** 水路の半幅と、縁石の位置 */
export const CANAL_H = 4;
export const KERB_X = 5;

/** 主水路が通る範囲。**湧く所（−40）は岸のまま** */
export const CANAL_Z0 = -28;
export const CANAL_Z1 = 33;

/** 十字に交わる横水路の半幅 */
export const CROSS_H = 3;

/** 迫りの起点。**丸天井はここから立ち上がる** */
export const SPRING = 9;

/** アーケードの壁の位置と、側廊の柱の位置 */
export const NAVE = 13;
export const AISLE_COL = 21;

/**
 * 平面。**z ごとの半幅**（内挿する）。
 *
 * **一本調子の筒にしない**——くびれと広間を交互に置く。
 */
const PLAN: readonly (readonly [number, number])[] = [
  [-44, 9],
  [-40, 16],
  [-36, 12],
  [-31, 10],
  [-26, 12],
  [-19, 19],
  [-10, 26],
  [0, 28],
  [10, 26],
  [17, 18],
  [23, 10],
  [28, 15],
  [33, 13],
  [38, 9],
];

/** その z での部屋の半幅。**円の外へは出さない** */
export function halfAt(z: number): number {
  if (z < Z0 || z > Z1) return 0;
  let w = 0;
  for (let i = 0; i + 1 < PLAN.length; i++) {
    const a = PLAN[i] as readonly [number, number];
    const b = PLAN[i + 1] as readonly [number, number];
    if (z < a[0] || z > b[0]) continue;
    const t = (z - a[0]) / (b[0] - a[0]);
    w = Math.round(a[1] + (b[1] - a[1]) * t);
    break;
  }
  const lim = Math.floor(Math.sqrt(Math.max(0, ROOM_R * ROOM_R - z * z)));
  return Math.max(0, Math.min(w, lim));
}

/**
 * 横断アーチ（リブ）と柱が立つ z。
 *
 * **等間隔に置かない**（`14-map-build.md` 0-6）——8〜10 マスで振る。
 */
export const BAYS: readonly number[] = ((): number[] => {
  const out: number[] = [];
  let z = -42;
  for (let i = 0; z <= Z1 - 1; i++) {
    out.push(z);
    z += 8 + Math.floor(noise(SEED + 5, i, 7) * 3);
  }
  return out;
})();

/** そこがリブの通る線か */
export function isRib(z: number): boolean {
  return BAYS.includes(z);
}

/** 側廊に柱が立つか。**広い所だけ**——狭い通路に柱を並べても邪魔なだけ */
export function hasAisleCol(w: number): boolean {
  return w >= 25;
}

/**
 * 天井のブロックの段。**この 1 つ下までが空。**
 *
 * **余弦で引く**——半円だと縁が立ちすぎて、迫りの手前で段差が飛ぶ。
 */
export function ceilAt(x: number, w: number, z: number): number {
  const a = Math.abs(x);
  let c: number;
  if (w >= 17) {
    if (a <= NAVE) {
      c = SPRING + Math.round(7 * Math.cos((Math.PI / 2) * (a / NAVE)));
    } else {
      // **リブの線だけ、側廊の柱まで降ろす**——柱と柱の間は広く架ける
      const split = hasAisleCol(w) && isRib(z);
      const lo = split && a > AISLE_COL ? AISLE_COL : NAVE;
      const hi = split && a <= AISLE_COL ? AISLE_COL : w;
      const s = (a - lo) / Math.max(1, hi - lo);
      c = SPRING + Math.round(3 * Math.sin(Math.PI * s));
    }
  } else {
    c = SPRING + Math.round(7 * Math.cos((Math.PI / 2) * (a / Math.max(1, w))));
  }
  // **リブは 1 段下げる**——連なりが見えないと、ただの筒になる
  return isRib(z) ? c - 1 : c;
}

/** そこがアーケードの壁か。**広い所にだけ立つ** */
export function isArcade(x: number, w: number): boolean {
  return w >= 17 && Math.abs(x) === NAVE;
}

/** そこが側廊の柱か */
export function isAisleCol(x: number, w: number, z: number): boolean {
  return hasAisleCol(w) && isRib(z) && Math.abs(x) === AISLE_COL;
}

/** 床の役割 */
export type Cell = "canal" | "gutter" | "deck";

/** その 1 マスが水路か、樋か、歩廊か */
export function cellAt(x: number, z: number, w: number): Cell {
  const a = Math.abs(x);
  if (a <= CANAL_H && z >= CANAL_Z0 && z <= CANAL_Z1) return "canal";
  if (Math.abs(z) <= CROSS_H && w >= 20) return "canal";
  if (a === w && w >= 19 && Math.abs(z) > CROSS_H + 1) return "gutter";
  return "deck";
}

/** その 1 マスの床のブロックの段 */
export function floorAt(cell: Cell): number {
  if (cell === "canal") return BED_Y;
  if (cell === "gutter") return GUT_Y;
  return DECK;
}

/**
 * 壁と丸天井の石。**1 マスごとに引く**（`14-map-build.md` 0-7）。
 *
 * **苔は低い所へ寄せる**——一様に撒くと塗り絵に見える。
 */
export function stoneAt(x: number, y: number, z: number): string {
  const wet = y <= 2 ? 1 : y <= 5 ? 0.5 : 0;
  const r = noise(SEED + 17, x, y, z);
  if (r < 0.09 + 0.28 * wet) return "mossy_stone_bricks";
  if (r < 0.16 + 0.36 * wet) return "mossy_cobblestone";
  if (r < 0.28) return "cracked_stone_bricks";
  if (r < 0.35) return "cobblestone";
  if (r < 0.41) return "andesite";
  return "stone_bricks";
}

/** 丸天井。**リブの線だけ、はっきり違う材にする** */
export function vaultAt(x: number, y: number, z: number): string {
  if (!isRib(z)) return stoneAt(x, y, z);
  return noise(SEED + 23, x, y, z) < 0.3 ? "mossy_stone_bricks" : "chiseled_stone_bricks";
}

/** 歩廊の床。**水際ほど苔が濃い** */
export function deckAt(x: number, z: number): string {
  const near = Math.abs(x) <= KERB_X + 2 ? 1 : 0;
  const r = noise(SEED + 31, x, 3, z);
  if (r < 0.07 + 0.16 * near) return "mossy_cobblestone";
  if (r < 0.14) return "cobblestone";
  if (r < 0.2) return "cobblestone";
  if (r < 0.28) return "andesite";
  if (r < 0.35) return "cracked_stone_bricks";
  return "stone_bricks";
}

/** 水路の底。**砂利と粘土と苔** */
export function bedAt(x: number, z: number): string {
  const r = noise(SEED + 43, x, 9, z);
  if (r < 0.3) return "cobblestone";
  if (r < 0.5) return "mossy_cobblestone";
  if (r < 0.62) return "clay";
  if (r < 0.78) return "cobblestone";
  return "stone";
}
