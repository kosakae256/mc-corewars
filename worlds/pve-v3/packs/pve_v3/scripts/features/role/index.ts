/**
 * 職業（ロール）の選択。**ロビーに立てた村人から選ぶ。**
 *
 * 仕様は `worlds/pve-v3/docs/01-roles.md`。
 *
 * ```
 * /pve:jobmaster    いま立っている所に、職業の村人を呼ぶ
 * /pve:role         いまの職業を出す
 * ```
 *
 * > ### 呼ぶ場所は自由
 * >
 * > **ロビーは手で建てたもの**なので、こちらは場所を知らない。
 * > **立ってほしい所で打つ**——そこに立つ。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { ROLES } from "../../core/roles.js";
import { vendorLabel } from "../../core/shop.js";
import { KEYS } from "../../state/keys.js";
import { setLabel } from "../../state/label.js";
import { roleOf } from "../../state/role.js";
import { onVendor, subscribeVendors, VENDOR } from "../../services/vendor.js";
import { openRoleBoard } from "./ui.js";

function subscribe(): void {
  subscribeVendors();
  onVendor((player, kind) => {
    if (kind !== "role") return false;
    openRoleBoard(player);
    return true;
  });
}

/** 職業の村人を呼ぶ */
function summonCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:jobmaster",
      description: "いま立っている所に、職業の村人を呼ぶ",
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
          const npc = world.getDimension("overworld").spawnEntity(VENDOR, at);
          npc.setDynamicProperty(KEYS.sells, "role");
          setLabel(npc, vendorLabel("role"));
          player.sendMessage(`§7職業の村人を呼んだ §8${Math.round(at.x)}, ${Math.round(at.y)}, ${Math.round(at.z)}`);
        } catch (err) {
          player.sendMessage(`§c呼べなかった §8${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/** いまの職業を出す */
function roleCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:role",
      description: "いまの職業を出す",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        const def = ROLES[roleOf(player)];
        player.sendMessage(`§7職業 §f${def.name}§7 ／ 通常攻撃 §f×${def.normal}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const role: Feature = {
  name: "role",
  commands: [summonCommand, roleCommand],
  subscribe,
};
