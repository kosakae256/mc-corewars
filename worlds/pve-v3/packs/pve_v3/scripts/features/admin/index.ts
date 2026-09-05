/**
 * 運営のコンパス。**GUI で触るための入口。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 7 章。
 *
 * ```
 * /pve:admin        コンパスを出す（OP だけ）
 * 右クリック         メニューを開く
 * ```
 *
 * > ### 打つコマンドと、できることを揃える
 * >
 * > **GUI でしかできないことを作らない。**
 * > 直すたびに名前を打つのが重いだけで、**できることは同じ。**
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

import type { CommandDef, Feature } from "../../types.js";
import { openAdmin } from "./ui.js";

/** コンパスの実体 */
export const ADMIN_ITEM = "pve_v3:admin";

function giveCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:admin",
      description: "運営のコンパスを出す",
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
          const inv = player.getComponent("minecraft:inventory")?.container;
          inv?.addItem(new ItemStack(ADMIN_ITEM, 1));
          player.sendMessage("§7運営のコンパスを渡した。§8右クリックで開く");
        } catch (err) {
          player.sendMessage(`§c渡せなかった §8${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function subscribe(): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== ADMIN_ITEM) return;
    // **フォームは次の tick で開く**（イベントの中では開けない）
    system.run(() => {
      void openAdmin(ev.source);
    });
  });
}

export const commands: readonly CommandDef[] = [giveCommand];

export const admin: Feature = {
  name: "admin",
  commands,
  subscribe,
};
