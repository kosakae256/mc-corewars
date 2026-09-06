/**
 * 大ジャンプの強さを当てる。
 *
 * ```
 * /pve:jump        いまの強さ
 * /pve:jump 16     強さを変える（すぐ効く）
 * ```
 *
 * **何段でどれだけ跳ぶかが読めない**ので、遊びながら当てる（`02-map.md` 5-0-4）。
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

import type { CommandDef } from "../../types.js";
import { jumpAmp, setJumpAmp } from "../../state/match.js";
import { isAdmin } from "../../services/presence.js";

function jumpCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:jump",
      description: "大ジャンプの強さを見る／変える（0〜255）",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "強さ", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, amp?: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      if (!isAdmin(player)) {
        return { status: CustomCommandStatus.Failure, message: "運営だけが使える" };
      }
      system.run(() => {
        if (amp === undefined) {
          player.sendMessage(`§7大ジャンプの強さ §f${jumpAmp()}§8（/pve:jump <数> で変える）`);
          return;
        }
        setJumpAmp(amp);
        // **その場で掛け直す**——次の周期を待たずに試せる
        try {
          player.removeEffect("jump_boost");
        } catch {
          /* 掛かっていない */
        }
        player.sendMessage(`§7大ジャンプの強さを §f${jumpAmp()}§7 にした §8（跳んで確かめる）`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const commands: readonly CommandDef[] = [jumpCommand];
