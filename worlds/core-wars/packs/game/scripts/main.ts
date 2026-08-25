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
import { registerLobby } from "./features/lobby/index.js";
import { startHud } from "./features/hud/index.js";
import { startBoard } from "./features/board/index.js";
import { registerTntFuse, startTntFuse, startTntGuard } from "./features/special/tnt.js";
import { registerNoBottle } from "./features/special/nobottle.js";
import { registerEnderGuard } from "./features/special/enderchest.js";
import { registerFireCharge, startFireCharge } from "./features/special/firecharge.js";
import { registerFireproof, startFireproof } from "./features/special/fireproof.js";
import { registerGrappleUse, registerReachCommand, startGrapple } from "./features/grapple/index.js";
import { registerShopCommand } from "./features/shop/index.js";
import { registerPriceCommand } from "./features/shop/price.js";
import { forgetPrices } from "./lib/shop-prices.js";
import { registerTeamChat } from "./features/chat/index.js";
import { registerSpotCommands } from "./features/spotting/command.js";
import { startCosmetic } from "./features/cosmetic/index.js";
import { registerJoinCard } from "./features/lobby/join.js";
import { registerLobbySigns, registerSignCommand } from "./features/lobby/signs.js";
import {
  registerDroneCommand,
  registerDroneGuards,
  registerUnstuckCommand,
  startDrone,
} from "./features/drone/index.js";
import { registerGuideCommand } from "./features/lobby/guide.js";
import { startSpotting } from "./features/spotting/index.js";
import { startHunger } from "./features/hunger/index.js";
import { startAbsorb } from "./lib/absorb.js";
import { registerPillarThrow, startPillar } from "./features/pillar/index.js";
import { registerAdminKit, startAdminKit } from "./features/admin/index.js";
import { joinNow } from "./features/match/index.js";
import { showSettings } from "./features/admin/menu.js";
import { startAutoStart } from "./features/admin/autostart.js";
import { startPhases } from "./features/phase/index.js";
import { startSpectate } from "./features/spectate/index.js";
import { isOp } from "./lib/op.js";
import { registerShopKeeperGuard, registerShopKeeperInteract, startShopKeepers } from "./features/shop/keeper.js";

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

  // **看板の反応を止める／戻す**（/game:signs）。自分だけ・運営のみ
  registerSignCommand(registry);

  // **ドローンを出す／戻す**（/game:drone）。試作（docs/spec/23-drone.md）
  registerDroneCommand(registry);

  // **遊び方の説明板を建てる**（/game:guide）。運営のみ
  registerGuideCommand(registry);

  // **視点が戻らなくなったときの逃げ道**（/game:unstuck）。**誰でも使える**
  registerUnstuckCommand(registry);
  // **射程の実測**（docs/spec/13-grapple.md 2 章）
  registerReachCommand(registry);

  // 味方だけに話す（/game:team）。**誰でも使える**
  registerTeamChat(registry);
  // **発光の確認用**（docs/spec/15-presentation.md 7-3）
  registerSpotCommands(registry);
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
// **導火線は着地から 6 秒**（docs/03-content.md 1-4）
startTntFuse();
// **飲んだ後の空き瓶を残さない**（docs/03-content.md 1-3）
registerNoBottle();
// **敵陣ではエンダーチェストを開けない**（docs/spec/12-shop.md 5-B）
registerEnderGuard();

// **拠点に転がり込んだ TNT は消す。** 置けない場所を爆破で抜けさせない
startTntGuard();

// **ドローン**（docs/spec/23-drone.md）。**試作**
startDrone();
registerDroneGuards();

// **ファイヤーチャージは投げ物**（docs/03-content.md 1-4）
registerFireCharge();
startFireCharge();

// **火では何も損なわれない**（docs/spec/14-death.md 6-B）
registerFireproof();
startFireproof();

// **ワイヤー射出装置**（docs/spec/13-grapple.md）
startGrapple();
registerGrappleUse();

// **ワイヤー射出装置 v2 は動かさない**（docs/spec/21-grapple-v2.md）。
// **没にした**（2026-08-25）。記録として残してあるだけで、配りも動かしもしない

// 運営主が抜けた／ワールドが落ちたら一時停止（docs/spec/11-match.md 6-D）
registerAutoPause();

// **試合をしていない間の居場所**（docs/spec/15-presentation.md 1章）
registerLobby();

// **コアの残りを常に見せる**（docs/spec/15-presentation.md 5章）
startHud();

// **前回の各部門 1 位をロビーに掲げる**（docs/spec/15-presentation.md 4-6）
startBoard();

// **名前を消し、帽子でチームを示す**（docs/spec/15-presentation.md 7章）
startCosmetic();

// **敵に見られていると光る**（docs/spec/15-presentation.md 7-3）
startSpotting();
// **満腹度を減らさない**（docs/01-rules.md 3-B）
startHunger();
// **金のリンゴで増えている分を数える**（docs/spec/15-presentation.md 7-3-A）
startAbsorb();
// **自動で試合を始める**（docs/spec/19-admin-menu.md 5 章）
startAutoStart();
// **フェーズを進める**（docs/spec/11-match.md 6-Z）
startPhases();
// **観戦**（docs/spec/20-spectate.md）
startSpectate();

// **参加 / 非参加の札**（docs/spec/16-participation.md 2章）
registerJoinCard();

// **ロビーの看板**（docs/spec/16-participation.md 4章）
registerLobbySigns(joinNow);

// **支柱弾**（docs/spec/18-pillar.md）
startPillar();
registerPillarThrow();

// **運営の手元の道具**（ロビーでだけ持たせる）
startAdminKit();
// **設定を開くだけ**（docs/spec/19-admin-menu.md）
registerAdminKit(showSettings);

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
// **遊ぶ人と運営で中身を分ける**（docs/spec/15-presentation.md 5-A）。
//
// 動いていることは全員に伝える。黙って切り替わると、
// **直っているのかどうかが分からない。**
// ただし状態の確認方法まで流す必要は無い
world.afterEvents.worldLoad.subscribe(() => {
  for (const player of world.getAllPlayers()) {
    try {
      player.sendMessage(
        isOp(player) ? "§aCore Wars§r 読み込み完了 / §f/game:status§r で状態確認" : "§aCore Wars§r 読み込みました"
      );
    } catch {
      /* 消えている */
    }
  }
});
