/**
 * 機能の宣言。
 *
 * 仕様は `docs/imp.md` 10-3。
 *
 * ## なぜ「宣言」なのか
 *
 * `main.ts` に `register〇〇()` を並べる形は、**呼び忘れても何も言わない。**
 * 実際、前のワールドで**呼び忘れが 2 回**起きた。
 *
 * **機能は自分が何を要るかを書くだけ。** 配線は `main.ts` が回す。
 */

import type { CustomCommandRegistry } from "@minecraft/server";

/** 毎周期やること */
export interface TickJob {
  /** 何 tick ごとか。**1 なら毎 tick** */
  readonly every: number;
  readonly run: (tick: number) => void;
}

/** コマンド 1 つ。**`system.beforeEvents.startup` の中で登録される** */
export type CommandDef = (registry: CustomCommandRegistry) => void;

/** 機能 1 つ */
export interface Feature {
  /** 表示用。**重複させない** */
  readonly name: string;
  /** 毎周期の処理 */
  readonly tick?: TickJob;
  /** コマンド */
  readonly commands?: readonly CommandDef[];
  /**
   * イベント購読。
   *
   * **`world.*.subscribe` をここで行う。**
   * トップレベルから 1 度だけ呼ばれる（`docs/imp.md` 5-2）。
   */
  readonly subscribe?: () => void;
}
