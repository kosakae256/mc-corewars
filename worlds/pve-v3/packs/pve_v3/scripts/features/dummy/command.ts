/**
 * カカシを置く／消す（`23-enemy-unit.md` 1-1）。
 *
 * ```
 * /pve:dummy         足元に 1 体
 * /pve:dummy true    全部消す
 * ```
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import { clearDummies, putDummy } from "../../services/dummy.js";

function dummyCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:dummy",
      description: "訓練用のカカシを置く（true で全部消す）",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "消す", type: CustomCommandParamType.Boolean }],
    },
    (origin: CustomCommandOrigin, clear?: boolean): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        if (clear === true) {
          player.sendMessage(`§7カカシを ${clearDummies()} 体消した`);
          return;
        }
        const at = player.location;
        const born = putDummy({ x: at.x, y: at.y, z: at.z });
        player.sendMessage(born === undefined ? "§c置けなかった" : "§7カカシを置いた §8/pve:dummy true で全部消える");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const commands = [dummyCommand];
