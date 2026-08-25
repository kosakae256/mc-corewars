/**
 * kit — ワールド制作の道具。
 *
 * **完成品には同梱しない前提**（`CLAUDE.md`）。
 * 建築補助・デバッグ・運営コマンドと、マップの構造物を入れる。
 *
 * ## Script API v2 の起動フロー
 *
 * このファイルは「ワールドがロードされる前」に実行される（early execution）。
 * トップレベルで world の状態に触るとエラーになる。
 *
 * - カスタムコマンドの**登録** → `system.beforeEvents.startup`
 * - world を触る**初期化** → `world.afterEvents.worldLoad`
 */

import { system, world } from "@minecraft/server";

import { registerScanCommand, startScanLoop } from "./features/mapblocks/scan.js";
import { registerConvertCommand, startConvertLoop } from "./features/mapblocks/convert.js";
import { registerMarkCommand, startMarkLoop } from "./features/mapblocks/mark.js";

// ---------------------------------------------------------------------------
// 1. startup — ワールドロード前。コマンド・コンポーネントの登録はここ。
// ---------------------------------------------------------------------------
system.beforeEvents.startup.subscribe((init) => {
  // 歩いた先のブロックの種類を集める（/kit:scan）
  registerScanCommand(init.customCommandRegistry);

  // バニラ → 独自ブロックの置き換え（/kit:convert）
  registerConvertCommand(init.customCommandRegistry);

  // 未置換を赤く光らせる（/kit:mark）
  registerMarkCommand(init.customCommandRegistry);
});

// ---------------------------------------------------------------------------
// 2. worldLoad — ロード完了後。ここから world を安全に触れる。
// ---------------------------------------------------------------------------
world.afterEvents.worldLoad.subscribe(() => {
  startScanLoop();
  startConvertLoop();
  startMarkLoop();
  // ---- **読み込みの報せは出さない**（2026-08-25 変更）
  //
  // `kit` は制作の道具なので、**遊ぶ人には何の意味も無い。**
  // 全体に流れると、大事な報せが押し流されるだけ。
  //
  // 入っているかは `/kit:scan on` が通るかどうかで分かる
  //（docs/spec/15-presentation.md 5-A）
});
