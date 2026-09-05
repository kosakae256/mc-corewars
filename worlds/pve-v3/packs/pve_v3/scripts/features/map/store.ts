/**
 * マップ倉庫のコマンド。
 *
 * ```
 * /pve:mapsave <名前>            いまの ±50 を 4 枚に分けて保存
 * /pve:maps                      一覧
 * /pve:mapload <名前> ok         倉庫から置く
 * /pve:mapdel  <名前> ok         消す
 * /pve:mapon   <名前> <on|off>   出るかどうか
 * /pve:build   <on|off>          建築モード
 * ```
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md`。
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
import { list, place, remove, save, setOn } from "../../services/mapstore.js";
import { phase, toPhase } from "../../services/match.js";

/** プレイヤーから来たか */
function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

const FAIL = { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" } as const;

function saveCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:mapsave",
      description: "いまの戦場を倉庫へ保存する（±50 を 4 枚に分ける）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "名前", type: CustomCommandParamType.String }],
      optionalParameters: [{ name: "表示名", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, name: string, label?: string): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) return FAIL;
      system.run(() => {
        const r = save(name.trim().toLowerCase(), label);
        player.sendMessage(r.ok ? `§7${r.message}` : `§c${r.message}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function listCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:maps",
      description: "倉庫のマップ一覧",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) return FAIL;
      system.run(() => {
        const all = list();
        if (all.length === 0) {
          player.sendMessage("§7倉庫は空。§8/pve:mapsave <名前> で保存する");
          return;
        }
        player.sendMessage("§7──── §f倉庫のマップ §7────");
        for (const m of all) {
          const mark = !m.ready ? "§c欠けている" : m.meta.on ? "§a出る" : "§8出さない";
          player.sendMessage(`§f${m.name} §7${m.meta.label}  ${mark}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/** 置く・消す。**どちらもそこにあるものを壊すので `ok` が要る** */
function dangerCommand(
  registry: CustomCommandRegistry,
  cmd: string,
  desc: string,
  warn: string,
  run: (name: string) => { ok: boolean; message: string }
): void {
  registry.registerCommand(
    {
      name: cmd,
      description: desc,
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [
        { name: "名前", type: CustomCommandParamType.String },
        { name: "確認", type: CustomCommandParamType.String },
      ],
    },
    (origin: CustomCommandOrigin, name: string, confirm: string): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) return FAIL;
      if (confirm.trim().toLowerCase() !== "ok") {
        return { status: CustomCommandStatus.Failure, message: `${warn} よければ ${cmd} ${name} ok` };
      }
      system.run(() => {
        const r = run(name.trim().toLowerCase());
        player.sendMessage(r.ok ? `§7${r.message}` : `§c${r.message}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function onCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:mapon",
      description: "そのマップを試合に出すかどうか",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [
        { name: "名前", type: CustomCommandParamType.String },
        { name: "出すか", type: CustomCommandParamType.String },
      ],
    },
    (origin: CustomCommandOrigin, name: string, on: string): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) return FAIL;
      const want = on.trim().toLowerCase();
      if (want !== "on" && want !== "off") {
        return { status: CustomCommandStatus.Failure, message: "on か off" };
      }
      system.run(() => {
        const r = setOn(name.trim().toLowerCase(), want === "on");
        player.sendMessage(r.ok ? `§7${r.message}` : `§c${r.message}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function buildCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:build",
      description: "建築モードの出入り（ゲーム非開始のときだけ）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "入るか", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, on: string): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) return FAIL;
      const want = on.trim().toLowerCase();
      if (want !== "on" && want !== "off") {
        return { status: CustomCommandStatus.Failure, message: "on か off" };
      }
      system.run(() => {
        const to = want === "on" ? "build" : "idle";
        if (phase() === to) {
          player.sendMessage(`§7すでに${want === "on" ? "建築モード" : "非開始"}`);
          return;
        }
        const ok = toPhase(to, system.currentTick);
        player.sendMessage(
          ok
            ? want === "on"
              ? "§7建築モードに入った。§8敵は湧かない／ウェーブは進まない"
              : "§7建築モードを出た"
            : "§c試合中は建築モードに入れない"
        );
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const storeCommands: readonly CommandDef[] = [
  saveCommand,
  listCommand,
  onCommand,
  buildCommand,
  (r) => dangerCommand(r, "pve:mapload", "倉庫から戦場に置く", "そこにあるものは全部消える。", place),
  (r) => dangerCommand(r, "pve:mapdel", "倉庫から消す", "構造物 4 枚と覚え書きが消える。", remove),
];
