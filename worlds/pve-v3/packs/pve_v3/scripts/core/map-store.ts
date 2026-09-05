/**
 * マップ倉庫の**決まりごと**。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md`。
 *
 * ```
 * 1 マップ ＝ 16 枚の構造物（pve3:<名前>_0〜_15） ＋ 1 つの覚え書き
 * ```
 */

import { spansOf } from "./grid.js";
import { FIELD, type Place } from "./places.js";

/** 保存する高さ。**構造物は 1 辺 64 マスまで**なので、ちょうど 64 に取る */
export const LOW_Y = -34;
export const HIGH_Y = 29;

/** 構造物の名前の頭 */
export const PREFIX = "pve3";

/** 区画 1 枚 */
export interface Piece {
  readonly from: Place;
  readonly to: Place;
}

/**
 * **1 辺をいくつに割るか。** 4 なら 4 × 4 ＝ 16 枚。
 *
 * > ### 1 辺 64 マスの制限だけなら 2 で足りる
 * >
 * > **置いている間サーバーが止まり、暗転が切れて一瞬明るく見えた**ので細かくした
 * > （`14-map-build.md` 2-2）。**足りなければ、ここを上げる。**
 */
export const GRID = 4;

/** **割り方を覚えていないマップ**は、2 × 2 で焼いてある */
export const OLD_GRID = 2;

/**
 * 区画。**xz ＝ 0, 0 を中心にした ±50 を grid × grid に割る。**
 *
 * > ### 保存も設置も同じ座標
 * >
 * > **別の場所で作らない。** 置き直したときにずれる。
 */
export function piecesOf(grid: number): readonly Piece[] {
  const out: Piece[] = [];
  const cuts = spansOf(FIELD.half, grid);
  for (const [z1, z2] of cuts) {
    for (const [x1, x2] of cuts) {
      out.push({ from: { x: x1, y: LOW_Y, z: z1 }, to: { x: x2, y: HIGH_Y, z: z2 } });
    }
  }
  return out;
}

/** いまの割り方の区画 */
export const PIECES: readonly Piece[] = piecesOf(GRID);

/** その区画の識別子 */
export function idOf(name: string, index: number): string {
  return `${PREFIX}:${name}_${index}`;
}

/** そのマップの識別子を全部。**割り方の枚数だけ** */
export function idsOf(name: string, grid: number = GRID): readonly string[] {
  return Array.from({ length: grid * grid }, (_, i) => idOf(name, i));
}

/**
 * 名前として使ってよいか。
 *
 * **識別子の一部になる**ので、後から変えない前提で狭く取る。
 */
export function nameOk(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,23}$/.test(name);
}

/** 覚え書き 1 件 */
export interface MapMeta {
  /** 画面に出す名前。**変えてよい** */
  readonly label: string;
  /** **false なら試合に出ない。** 作りかけを置いておける */
  readonly on: boolean;
  /**
   * **焼いたときの割り方。** 1 辺をいくつに割ったか。
   *
   * **無ければ 2**——4 × 4 にする前のマップも、そのまま置けるようにする。
   */
  readonly grid: number;
}

/** 覚え書き全部 */
export type MapBook = Readonly<Record<string, MapMeta>>;

/** 読めない文字列でも落ちないように読む */
export function parseBook(raw: string | undefined): MapBook {
  if (raw === undefined || raw === "") return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return {};
    const out: Record<string, MapMeta> = {};
    for (const [k, m] of Object.entries(v as Record<string, unknown>)) {
      if (!nameOk(k) || typeof m !== "object" || m === null) continue;
      const rec = m as Record<string, unknown>;
      const grid = rec["grid"];
      out[k] = {
        label: typeof rec["label"] === "string" ? rec["label"] : k,
        on: rec["on"] !== false,
        // **書いていないものは、割り方を変える前に焼いたもの**
        grid: typeof grid === "number" && grid >= 1 && grid <= 8 ? Math.floor(grid) : OLD_GRID,
      };
    }
    return out;
  } catch {
    return {};
  }
}
