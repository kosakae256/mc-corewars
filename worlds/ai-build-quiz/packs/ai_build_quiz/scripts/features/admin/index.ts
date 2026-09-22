/**
 * アドミンの開始・停止。`docs/spec/11-flow.md` 1 章。
 *
 * ```
 * /quiz:start   ゲームを始める（得点を消し、お題待ちにする）。bridge が scoreboard を見て動き出す
 * /quiz:stop    止める（置きかけは片づける）。idle へ
 * /quiz:ring    観覧の輪（y=0・半径 58〜62 のガラス）を置く。ワールドにつき 1 回でよい（16-world-rules 1 章）
 * ```
 *
 * 始め・止めの中身は `services/game.ts`（answer も呼ぶ）。運営のコンパスの配布はここ、メニューの中身は `menu.ts`（17-modes 4 章）。
 *
 * コマンドのコールバックは restricted execution なので、仕事は `system.run` で次の tick に逃がす（imp.md 5-1）。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  ItemLockMode,
  ItemStack,
  system,
  world,
  type Player,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import type { CommandDef, Feature } from "../../types.js";
import { kindLabel, MSG } from "../../lib/format.js";
import { bridgeConnected } from "../../state/bridge.js";
import { loadMode } from "../../state/mode.js";
import { showTotal } from "../../state/score.js";
import { placeRing } from "../../services/blocks.js";
import { startGame, stopGame } from "../../services/game.js";
import { isOp } from "../../services/players.js";
import { tellOps } from "../../services/tell.js";
import { mainMenu } from "./menu.js";

function ringCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "quiz:ring",
      description: "観覧の輪（y=0・半径 58〜62 のガラス）を置く。1 回でよい",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (): CustomCommandResult => {
      system.run(() => {
        try {
          placeRing();
        } catch (err) {
          tellOps(`観覧の輪を置けない: ${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success, message: "観覧の輪を置きます" };
    }
  );
}

function startCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    { name: "quiz:start", description: "AI 建築当てゲームを始める", permissionLevel: CommandPermissionLevel.Admin },
    (): CustomCommandResult => {
      // bridge が繋がっていなければ始めない（11-flow 2 章）。結果メッセージは発行者にだけ見える
      if (!bridgeConnected(system.currentTick))
        return { status: CustomCommandStatus.Failure, message: MSG.bridgeNotConnected };
      system.run(startGame);
      return { status: CustomCommandStatus.Success, message: "開始します" };
    }
  );
}

function stopCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    { name: "quiz:stop", description: "AI 建築当てゲームを止める", permissionLevel: CommandPermissionLevel.Admin },
    (): CustomCommandResult => {
      system.run(stopGame);
      return { status: CustomCommandStatus.Success, message: "止めます" };
    }
  );
}

export const commands: readonly CommandDef[] = [startCommand, stopCommand, ringCommand];

// ---------------------------------------------------------------- 運営のコンパス（17-modes 4 章）

const COMPASS = "minecraft:compass";
const COMPASS_NAME = "§6運営メニュー §7(右クリック)";

function giveCompass(player: Player): void {
  if (!isOp(player)) return;
  const c = player.getComponent("inventory")?.container;
  if (!c) return;
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === COMPASS) return;
  const item = new ItemStack(COMPASS, 1);
  item.nameTag = COMPASS_NAME;
  item.lockMode = ItemLockMode.inventory;
  item.keepOnDeath = true;
  item.setLore(["§7モード・カテゴリ・開始/停止"]);
  c.addItem(item);
}

function subscribe(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => system.run(() => giveCompass(ev.player)));
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== COMPASS || !isOp(ev.source)) return;
    void mainMenu(ev.source).catch((err) => tellOps(`メニューを開けない: ${String(err)}`));
  });
  system.run(() => {
    loadMode();
    showTotal();
    for (const p of world.getAllPlayers()) giveCompass(p);
  });
}

/** 5 秒ごと: 運営が持っていなければ渡す */
function tick(): void {
  for (const p of world.getAllPlayers()) giveCompass(p);
}

export const admin: Feature = { name: "admin", subscribe, commands, tick: { every: 100, run: tick } };
