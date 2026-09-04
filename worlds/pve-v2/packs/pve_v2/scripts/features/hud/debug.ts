/**
 * デバッグ表示の切り替え。
 *
 * 仕様は `docs/spec/12-hud.md` 6 章。
 *
 * | モード | 何が出るか | どこまで効くか |
 * | --- | --- | --- |
 * | **plate** | 名札に **HP の数値** | **ワールド全体**（名札は全員に同じものが見える） |
 * | **hp** | **独自 HP とバニラ体力の両方** | **その人だけ** |
 *
 * **plate が既定オンなのは、いま作っている最中だから**
 *（将来は「ネームプレート表示」のエンチャントとして遊びの側へ）。
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import { KEYS } from "../../state/keys.js";

/** 名札に HP の数値を出すか（**ワールド全体・既定オン**） */
export function plateNumbers(): boolean {
  try {
    return world.getDynamicProperty(KEYS.dbgPlate) !== false;
  } catch {
    return true;
  }
}

/** 体力の実態を出すか（**その人だけ・既定オフ**） */
export function hpDebugOn(player: Player): boolean {
  try {
    return player.getDynamicProperty(KEYS.dbgHp) === true;
  } catch {
    return false;
  }
}

function toggle(player: Player, what: string): string {
  if (what === "plate") {
    const next = !plateNumbers();
    world.setDynamicProperty(KEYS.dbgPlate, next);
    return `名札の HP 数値: ${next ? "§a入" : "§7切"}`;
  }
  if (what === "hp") {
    const next = !hpDebugOn(player);
    player.setDynamicProperty(KEYS.dbgHp, next);
    return `体力の実態: ${next ? "§a入" : "§7切"}`;
  }
  return `§7名札の HP 数値: ${plateNumbers() ? "入" : "切"} / 体力の実態: ${hpDebugOn(player) ? "入" : "切"}`;
}

/** `/pve:debug [plate|hp]` */
export function debugCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:debug",
      description: "デバッグ表示を切り替える",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "何を", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, what?: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      const word = (what ?? "").toLowerCase();
      system.run(() => {
        player.sendMessage(`§7${toggle(player, word)}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
