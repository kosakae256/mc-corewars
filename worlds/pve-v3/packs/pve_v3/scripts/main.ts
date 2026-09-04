/**
 * 配線だけ。
 *
 * 仕様は `docs/imp.md` 10-3。
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
//
// > ### `/reload` では引数を定義し直せない
// >
// > **`RegistryReadOnly`** — *Command parameters cannot be redefined during reload.
// > Only the script closure itself can be changed.*
// >
// > **引数を足した／消した／型を変えたら、ワールドに入り直す**（`/reload all`）。
// > `/reload` だけだと**古い登録が残り**、叩いた時に
// > **`script closure has been invalidated`** になる。
// >
// > **失敗を握りつぶさない**——原因が分からないまま古い挙動が続くのがいちばん困る。
system.beforeEvents.startup.subscribe((init) => {
  for (const f of FEATURES) {
    for (const def of f.commands ?? []) {
      try {
        def(init.customCommandRegistry);
      } catch (err) {
        console.warn(`[command] ${f.name} の登録に失敗: ${String(err)}（引数を変えたならワールドに入り直す）`);
      }
    }
  }
});

// ---- 輪は 1 本（`docs/imp.md` 10-1）
startLoop(FEATURES);
