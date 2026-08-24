/**
 * Core Wars — ゲーム本体。
 *
 * **このファイルを読めば、このアドオンが何をするか一覧できる**状態を保つ
 *（`docs/imp.md` 2章）。機能そのものは `features/` にある。
 *
 * ## なぜトップレベルで起動するのか
 *
 * `world.afterEvents.worldLoad` は**ワールドを読み込んだときにしか発火しない。**
 * `/reload` では来ないので、そこに起動を置くと**保護が動かない。**
 * 実際にそれで**マップの柵が燃えて消えた。**
 *
 * イベントの購読と `system.runInterval` は early execution でも許されている
 *（`docs/imp.md` 5.1）。トップレベルに出せば `/reload` で購読し直される。
 *
 * **コマンドの登録だけは `system.beforeEvents.startup` が要る。**
 * こちらはワールドロード時にしか走らないので、`/reload all` が必要。
 */

import { system, world } from "@minecraft/server";

import { registerProtection } from "./features/protection/index.js";
import { startFireGuard } from "./features/protection/fireguard.js";
import { registerRepairCommands } from "./features/protection/repair.js";
import { registerCombat } from "./features/combat/index.js";
import { registerDeathGuard, startDeath } from "./features/death/index.js";
import { registerCleanup } from "./features/cleanup/index.js";
import { markFreshStart, registerAutoPause, registerMatchCommands, registerMatchJoin } from "./features/match/index.js";
import { registerCore } from "./features/core/index.js";
import { startBorder } from "./features/border/index.js";
import { registerBuildRules } from "./features/build/index.js";
import { registerTntFuse, startTntGuard } from "./features/special/tnt.js";
import { registerGrappleUse, startGrapple } from "./features/grapple/index.js";
import { registerShopCommand } from "./features/shop/index.js";
import { registerPriceCommand } from "./features/shop/price.js";
import { forgetPrices } from "./lib/shop-prices.js";
import { registerShopKeeperGuard, registerShopKeeperInteract, startShopKeepers } from "./features/shop/keeper.js";
import { syncTickingAreas } from "./features/ticking/index.js";
import { isRunning } from "./lib/match-state.js";
import { registerGeneratorCommands, rescanUntilFound, startGenerators } from "./features/generator/index.js";

// ---------------------------------------------------------------------------
// 1. 登録。**ワールドロード時にしか走らない**（/reload all が要る）
// ---------------------------------------------------------------------------
system.beforeEvents.startup.subscribe((init) => {
  // **ここはワールドロード時にしか走らない**（/reload では通らない）。
  // だから「本当にワールドが起動した」ことの確実な合図になる。
  // 試合中のまま起動したなら、それはおかしいので一時停止する
  markFreshStart();

  const registry = init.customCommandRegistry;

  // 試合の進行（/game:start /game:stop /game:abort /game:clean /game:status）
  registerMatchCommands(registry);

  // マップの記憶と修復（/game:remember /game:repair）
  registerRepairCommands(registry);

  // ジェネレータの再走査（/game:regen）
  registerGeneratorCommands(registry);

  // ショップ（/game:shop）
  registerShopCommand(registry);

  // ショップの値段を変える（/game:price）
  registerPriceCommand(registry);
});

// ---------------------------------------------------------------------------
// 2. 購読。**トップレベル。** /reload でも効かせるため
// ---------------------------------------------------------------------------

// マップのブロックを守る（docs/spec/10-block-protection.md）
registerProtection();

// 焼けたマップを、火が収まってから記憶で戻す
startFireGuard();

// 味方への攻撃を止める／復帰直後の無敵（docs/spec/11-match.md 5章）
registerCombat();

// **倒れても死なせない。** 5 秒観戦してから自陣へ戻す（docs/spec/14-death.md）
registerDeathGuard();
startDeath();

// 試合中に置かれたブロックを覚える（後片付け用）
registerCleanup();

// 途中参加・復帰を受け付ける
registerMatchJoin();

// コアの破壊を数える（docs/01-rules.md）
registerCore();

// 戦闘範囲の外へ出さない（docs/spec/11-match.md 6-F）
startBorder();

// ブロックを置けない場所（docs/spec/11-match.md 6-G）
registerBuildRules();

// **TNT は置いた瞬間に着火する**（docs/03-content.md 1-4）
registerTntFuse();

// **拠点に転がり込んだ TNT は消す。** 置けない場所を爆破で抜けさせない
startTntGuard();

// **ワイヤー射出装置**（docs/spec/13-grapple.md）
startGrapple();
registerGrappleUse();

// 運営主が抜けた／ワールドが落ちたら一時停止（docs/spec/11-match.md 6-D）
registerAutoPause();

// ジェネレータから資源を湧かせる
startGenerators();

// **試合中だけ、拠点にショップの店員を立たせる**（docs/spec/12-shop.md 6章）
startShopKeepers();

// 店員に触ったらショップを開く
registerShopKeeperInteract();

// **店員は殴っても死なない**（docs/spec/12-shop.md 6章）
registerShopKeeperGuard();

// **値段の覚え直し。** 動的プロパティはワールドに残るが、
// メモリに覚えた分は /reload で古いままになりうる（docs/spec/12-shop.md 4章）
forgetPrices();

// **状態と実体を合わせる**（docs/spec/11-match.md 6-C）。
// ティッキングエリアはワールドに残るが、試合中かどうかはスクリプトが持っている。
// 試合中なら張り直し、そうでなければ外す
// **`isRunning()` は動的プロパティを読む。**
// トップレベル（early execution）では読めないので、次の tick へ逃がす。
// 実際に `World::getDynamicProperty cannot be used in early execution` で落ちた
system.run(() => {
  syncTickingAreas(isRunning());
});

// **ジェネレータの位置はメモリにしか無い。** /reload で消える。
// だから**読み込みのたびに探し直す**（docs/spec/11-match.md 6-B / R-3）。
//
// **やり直す形で呼ぶ。**
// 1 回だけだと、チャンクがまだ読み込まれていないときに 0 個で固定され、
// **そのあと一生湧かない。** 実際にそうなった
rescanUntilFound(undefined);

// ---------------------------------------------------------------------------
// 3. 読み込み完了の通知
// ---------------------------------------------------------------------------
world.afterEvents.worldLoad.subscribe(() => {
  world.sendMessage("§aCore Wars§r 読み込み完了 / §f/game:status§r で状態確認");
});
