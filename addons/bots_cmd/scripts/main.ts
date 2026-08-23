import { system } from "@minecraft/server";

import { registerBotsCommands } from "./features/bots/index.js";
import { startSupplyLoop } from "./features/supply/index.js";

/**
 * bots_cmd — ボット管理ツールを操作するスラッシュコマンド。
 *
 * `/bots:summon` などを登録し、実行内容は
 * `tools/bots` の制御サーバー（HTTP）に委譲する。
 * チャットを経由しないので、コマンドを打っても発言が流れない。
 *
 * 仕様: docs/spec/02-llm-chat.md 5-6
 *
 * 前提:
 *   - **BDS でのみ動く**（@minecraft/server-net はクライアントで動かない）
 *   - ワールドで「Beta APIs」を有効にすること
 *   - BDS の config/<スクリプトモジュールUUID>/permissions.json で
 *     @minecraft/server-net を許可すること
 *
 * ここは配線だけ。ロジックは features 以下に置く（docs/imp.md 2章）。
 */
system.beforeEvents.startup.subscribe((init) => {
  registerBotsCommands(init);
});

// ボットへのブロック補給を開始する。
// system.runInterval はトップレベル（early execution）でも呼べる。
// 冪等な処理にしてあるので、/reload で二重登録されても壊れない。
startSupplyLoop();
