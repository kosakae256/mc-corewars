/**
 * ダメージの数字が出るか確かめる（確認用）。
 *
 * ```
 * /pve:dmgtest
 * ```
 *
 * **黙って消えるのがいちばん困る**ので、
 * ここでは `try/catch` の中身をそのままメッセージに出す。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import { DMG, LIFE } from "../../services/number.js";
import { bigHurt } from "../../services/feedback.js";

export function dmgTestCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:dmgtest",
      description: "ダメージの数字を 1 つ出してみる（確認用）",
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
          const at = player.location;
          const spawned = player.dimension.spawnEntity(DMG, { x: at.x, y: at.y + 1.5, z: at.z });
          spawned.nameTag = "§e9999!";
          spawned.applyImpulse({ x: 0, y: 0.24, z: 0 });
          system.runTimeout(() => {
            try {
              spawned.remove();
            } catch {
              /* もう居ない */
            }
          }, LIFE);
          player.sendMessage(`§a出した §8${spawned.id}`);
        } catch (err) {
          player.sendMessage(`§c出せなかった §8${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * **画面の揺れ**を出してみる（確認用・`22-feedback.md` 2 章）。
 *
 * ```
 * /pve:hurttest
 * ```
 *
 * **出なければ、端末の映像設定「カメラの揺れ」を疑う。**
 * **content log に `[feedback] …` が出ている**（コマンドが弾かれた）。
 */
export function hurtTestCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:hurttest",
      description: "画面の揺れを出してみる（確認用）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        bigHurt(player, system.currentTick);
        player.sendMessage("§7揺れを出した §8（バニラの被弾の揺れ＋camerashake）");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
