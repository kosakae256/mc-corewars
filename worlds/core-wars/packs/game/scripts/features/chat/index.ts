/**
 * チームチャット。
 *
 * 仕様は `docs/spec/11-match.md` 3章。
 *
 * ## なぜ要るのか
 *
 * **全体チャットしかないと、作戦が相手に読まれる。**
 * 「右から行く」と書けば、そのまま右を固められる。
 *
 * ## 誰でも使える
 *
 * `/game:` で始まるものは運営専用だが、**これは遊ぶ人の道具。**
 * 権限だけ `Any` にしてある。
 *
 * ## 名前が `game:team` である理由
 *
 * **`/team` では登録できない**（2026-08-25 修正）。
 *
 * カスタムコマンドは**名前空間が必須**で、
 * さらに**1 つのアドオンの中では名前空間を揃える**必要がある
 *（`CustomCommandErrorReason.NamespaceMismatch`）。
 *
 * 素の `team` で登録していたので、**登録に失敗して存在しなかった。**
 * 「teamコマンドが存在しません」の正体はこれ。
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Player,
} from "@minecraft/server";

import { teamName, teamOf } from "../../lib/match-state.js";

export function registerTeamChat(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:team",
      description: "味方だけに話す",
      // **誰でも使える。** 遊ぶ人の道具なので運営専用にしない
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "message", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, message: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e as Player;
      system.run(() => {
        const team = teamOf(player);
        if (team === undefined) {
          player.sendMessage("§7チームに入っていないので、味方が居ません");
          return;
        }
        const line = `§8[${teamName(team)}§8] §f${player.name}§7: ${message}`;
        let n = 0;
        for (const p of world.getAllPlayers()) {
          if (teamOf(p) !== team) continue;
          p.sendMessage(line);
          n++;
        }
        // **届いた人数を出す。** 誰にも届いていないことに気づけるように
        if (n <= 1) player.sendMessage("§7（いま味方は居ません）");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
