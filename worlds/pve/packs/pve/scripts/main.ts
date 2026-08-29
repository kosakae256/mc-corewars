/**
 * 配線だけ。
 *
 * 仕様は `docs/imp.md` 10-3、`docs/spec/11-structure.md`。
 *
 * **ここを読めば、このパックが何でできているか分かる**——
 * それ以上のことは書かない。
 *
 * ## Script API v2 の起動
 *
 * このファイルは**ワールドが読み込まれる前**に走る（early execution）。
 * トップレベルで world の中身を触らない（`docs/imp.md` 5-1）。
 */

import { system } from "@minecraft/server";

import { FEATURES } from "./features.js";
import { startLoop } from "./loop.js";
import { subscribeHurt } from "./events/hurt.js";

// ---- イベント（1 イベント 1 購読。`docs/imp.md` 10-2）
subscribeHurt();
for (const f of FEATURES) f.subscribe?.();

// ---- コマンド（**startup の中でしか登録できない**）
system.beforeEvents.startup.subscribe((init) => {
  for (const f of FEATURES) {
    for (const def of f.commands ?? []) def(init.customCommandRegistry);
  }
});

// ---- 輪は 1 本（`docs/imp.md` 10-1）
startLoop(FEATURES);
