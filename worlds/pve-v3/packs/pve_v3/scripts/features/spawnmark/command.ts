/**
 * 湧き点のコマンド。**GUI でしかできないことを作らない**（`19-map-store.md` 7 章）。
 *
 * ```
 * /pve:marks              いまの様子（どのマップ・何点）
 * /pve:marks <名前>        そのマップの点を触るようにする
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

import type { CommandDef } from "../../types.js";
import { count, pruneMarks, showMarks } from "../../services/spawnmark.js";
import { list, originXOf } from "../../services/mapstore.js";
import { isAdmin } from "../../services/presence.js";
import { editing, setEditing } from "../../state/spawnmark.js";

function marksCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:marks",
      description: "湧き点を触るマップを選ぶ（省くと今の様子／clean で掃除）",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "マップ", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, name?: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      // **運営だけ**（`21-spawn-mark.md` 1 章）
      if (!isAdmin(player)) {
        return { status: CustomCommandStatus.Failure, message: "運営だけが使える" };
      }
      system.run(() => {
        if (name === undefined) {
          const map = editing();
          player.sendMessage(
            map === undefined ? "§7まだ選んでいない §8/pve:marks <名前>" : `§7いま §f${map}§7 ／ §f${count(map)}§7 点`
          );
          // **どこにあるかも出す**（`19-map-store.md` 0-1。マップは 1000 マスずつ離れている）
          for (const m of list()) {
            const where = m.meta.slot === undefined ? "§c未配置" : `§8x ${m.meta.slot * 1000}`;
            player.sendMessage(`§8  ${m.name}  ${count(m.name)} 点  ${where}`);
          }
          if (map !== undefined) {
            const shown = showMarks(player, map);
            player.sendMessage(
              shown > 0
                ? `§7近くの §f${shown}§7 点を出した`
                : `§7ここには点が無い §8${map} は x ${originXOf(map)} にある`
            );
          }
          return;
        }
        // **掃除**——地形を直したあとに、埋まった点を落とす
        if (name.trim().toLowerCase() === "clean") {
          const map = editing();
          if (map === undefined) {
            player.sendMessage("§c先に /pve:marks <名前> で選ぶ");
            return;
          }
          const r = pruneMarks(map);
          player.sendMessage(
            r.dropped === 0
              ? `§7${map} は全部まだ立てる §8（${r.left} 点）`
              : `§7${map} の埋まっていた §f${r.dropped}§7 点を捨てた §8（残り ${r.left}）`
          );
          return;
        }
        const key = name.trim().toLowerCase();
        setEditing(key);
        player.sendMessage(`§7これから §f${key}§7 の点を触る §8（いま ${count(key)} 点）`);
        showMarks(player, key);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const commands: readonly CommandDef[] = [marksCommand];
