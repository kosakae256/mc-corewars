/**
 * 動作確認だけの機能。
 *
 * **遊びの中身ではない。** パックがちゃんと読み込まれたかを見るためのもの。
 *
 * ```
 * /pve:ping
 * ```
 *
 * **中身ができたら消してよい。**
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  ItemStack,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import type { Feature } from "../../types.js";

/** 読み込まれたことを 1 度だけ知らせる */
function subscribe(): void {
  world.afterEvents.worldLoad.subscribe(() => {
    console.warn("[pve_v2] 読み込んだ");
  });
}

function pingCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:ping",
      description: "パックが動いているか確かめる",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        player.sendMessage("§apve_v2 §7が動いている");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * 弓を配る。**試用**（`docs/spec/10-bow.md`）。
 *
 * **拾い方はまだ無い**（企画では「ロールごとに固定で持つ」）。
 */
function bowCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:bow",
      description: "弓を配る（試用）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        try {
          player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack("pve_v2:bow", 1));
          player.sendMessage("§7弓を配った");
        } catch (err) {
          player.sendMessage(`§c配れなかった §8${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const ping: Feature = {
  name: "ping",
  subscribe,
  commands: [pingCommand, bowCommand],
};
