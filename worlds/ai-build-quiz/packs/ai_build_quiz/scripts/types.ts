/**
 * 機能の宣言（`docs/imp.md` 10-3）。pve-v3 と同じ形。
 *
 * `main.ts` に `register〇〇()` を並べる形は、**呼び忘れても何も言わない。**
 * 機能は自分が何を要るかを書くだけ。配線は `main.ts` が回す。
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

export interface Feature {
  /** 表示用。**重複させない** */
  readonly name: string;
  readonly tick?: TickJob;
  readonly commands?: readonly CommandDef[];
  /** イベント購読。トップレベルから 1 度だけ呼ばれる */
  readonly subscribe?: () => void;
}
