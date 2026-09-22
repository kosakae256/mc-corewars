/**
 * 配線だけ（`docs/imp.md` 10-3）。**ここを読めば、このパックが何でできているか分かる。**
 *
 * 仕様は `worlds/ai-build-quiz/docs/spec/`。
 *
 * このファイルは**ワールドが読み込まれる前**に走る（early execution）。トップレベルで world の中身を触らない。
 */

import { system, world } from "@minecraft/server";

import { FEATURES } from "./features.js";
import { startLoop } from "./loop.js";
import { resetPhase } from "./state/phase.js";

// ---- イベント（1 イベント 1 購読）
for (const f of FEATURES) f.subscribe?.();

// ---- コマンド（**startup の中でしか登録できない**。引数を変えたらワールドに入り直す）
system.beforeEvents.startup.subscribe((init) => {
  for (const f of FEATURES) {
    for (const def of f.commands ?? []) {
      try {
        def(init.customCommandRegistry);
      } catch (err) {
        console.warn(`[command] ${f.name} の登録に失敗: ${String(err)}`);
      }
    }
  }
});

// ---- 起動・/reload 直後は idle（scoreboard にも書く。bridge が古い値を見ないように）
world.afterEvents.worldLoad.subscribe(() => {
  resetPhase(system.currentTick);
});

// ---- 輪は 1 本
startLoop(FEATURES);
