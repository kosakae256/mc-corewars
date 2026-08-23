import { system, world } from "@minecraft/server";

/**
 * Script API v2 の起動フローについて
 *
 * v2 ではこのファイルは「ワールドがロードされる前」に実行される（early execution）。
 * そのため、このトップレベルで world の状態（プレイヤー・エンティティ・ブロック）を
 * 触るとエラーになる。
 *
 * トップレベルで許されるのは主に以下:
 *   - world/system の beforeEvents / afterEvents への subscribe・unsubscribe
 *   - system.run / runInterval / runTimeout / runJob / waitTicks
 *   - Custom Component の登録（system.beforeEvents.startup の中で行う）
 *
 * world を触る初期化は world.afterEvents.worldLoad の中に書く。
 */

// ---------------------------------------------------------------------------
// 1. startup — ワールドロード前。Custom Component の登録はここで行う。
// ---------------------------------------------------------------------------
system.beforeEvents.startup.subscribe((init) => {
  // 例: ブロック用 Custom Component の登録
  // init.blockComponentRegistry.registerCustomComponent("hello:example", {
  //   onStepOn: (e, params) => { /* ... */ },
  // });
  //
  // 例: アイテム用 Custom Component の登録
  // init.itemComponentRegistry.registerCustomComponent("hello:example", {
  //   onUse: (e, params) => { /* ... */ },
  // });
  void init;
});

// ---------------------------------------------------------------------------
// 2. worldLoad — ワールドのロード完了後。ここから world を安全に触れる。
// ---------------------------------------------------------------------------
world.afterEvents.worldLoad.subscribe(() => {
  // 動作確認は済んでいるので、定期メッセージは出さない。
  // 読み込まれたことだけをサーバーログに残す。
  console.log("[hello] worldLoad");
});
