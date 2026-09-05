/**
 * 試合を動かすコマンド。**運営の道具。**
 *
 * ```
 * /pve:start    ゲーム非開始 → 開始準備
 * /pve:stop     いまの状態   → ゲーム終了（リザルト 15 秒）
 * /pve:pause    休憩所・戦場 → 一時停止
 * /pve:resume   一時停止     → 止めた所へ
 * /pve:join     途中から入る
 * /pve:leave    抜ける
 * /pve:state    いまの状態を出す
 * /pve:portal   ゲートを塗る（1〜6 か rest）
 * /pve:kill     いま場に居る敵を消す
 * /pve:skip     ウェーブを終わらせる
 * ```
 *
 * **画面（3 択・ポータル・秒読み）ができるまでの代用。**
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
import { LEGIONS } from "../../core/enemy.js";
import { legion, setLegion } from "../../state/match.js";
import { PLAYER_LABEL, RESULT_TICKS, REST_TICKS, WORLD_LABEL, type WorldPhase } from "../../core/state.js";
import { REST, toTarget } from "../../core/portal.js";
import { enemyCount } from "../../services/field.js";
import { endWave, killEnemies } from "../../services/force.js";
import { openGate } from "../../services/gate.js";
import { end, phase, phaseAge, resume, toPhase, wave } from "../../services/match.js";
import { alive, join, leave, members, phaseOf } from "../../services/presence.js";

/** その人からのコマンドか確かめて、本体を `system.run` で回す */
function fromPlayer(origin: CustomCommandOrigin, run: (player: Player) => void): CustomCommandResult {
  const e = origin.sourceEntity;
  if (!(e instanceof Player)) {
    return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
  }
  const player = e;
  system.run(() => run(player));
  return { status: CustomCommandStatus.Success };
}

/** 引数の無いコマンドを 1 つ登録する */
function simple(
  registry: CustomCommandRegistry,
  name: string,
  description: string,
  run: (player: Player, now: number) => void
): void {
  registry.registerCommand(
    { name, description, permissionLevel: CommandPermissionLevel.Any },
    (origin: CustomCommandOrigin): CustomCommandResult =>
      fromPlayer(origin, (player) => run(player, system.currentTick))
  );
}

/** 砂時計の残り（tick）。**時間で動かない状態では undefined** */
function leftOf(p: WorldPhase, age: number): number | undefined {
  if (p === "rest") return Math.max(0, REST_TICKS - age);
  if (p === "result") return Math.max(0, RESULT_TICKS - age);
  return undefined;
}

/**
 * 次の相手を選ぶ。
 *
 * **本当は休憩所で 3 択から多数決**（`13-flow.md` 2-3）。
 * **それができるまでの手動の口。**
 */
function legionCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:legion",
      description: "次の相手（敵グループ）を選ぶ",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "id", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, id?: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        if (id === undefined) {
          player.sendMessage("§7──── §f敵グループ §7────");
          for (const l of Object.values(LEGIONS)) {
            player.sendMessage(`§f${l.id} §7${l.name}  ★${l.star}  基礎 ${l.base} 体`);
          }
          player.sendMessage(`§8いま §f${legion() ?? "zombie"}`);
          return;
        }
        const key = id.trim().toLowerCase();
        const def = LEGIONS[key];
        if (def === undefined) {
          player.sendMessage(`§cそんな相手は居ない §8${Object.keys(LEGIONS).join(" / ")}`);
          return;
        }
        setLegion(key);
        player.sendMessage(`§7次の相手を §f${def.name}§7 にした`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/** `/pve:portal <1〜6 か rest>` — **いまのゲートを、その行き先の色に塗る**（見て確かめる用） */
function portalCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:portal",
      description: "戦場のゲートを塗る（1〜6 か rest）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "行き先", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, text: string): CustomCommandResult =>
      fromPlayer(origin, (player) => {
        const want = toTarget(text);
        if (want === undefined) {
          player.sendMessage("§c1〜6 か rest §8例: /pve:portal 4 ／ /pve:portal rest");
          return;
        }
        const n = openGate(want);
        const label = want === REST ? "休憩所（水色）" : `★${String(want)}`;
        player.sendMessage(n > 0 ? `§7ゲートを §f${label}§7 の色で置いた（${n} マス）` : "§7もう同じ色で立っている");
      })
  );
}

export const commands: readonly CommandDef[] = [
  legionCommand,
  portalCommand,
  (registry) =>
    simple(registry, "pve:kill", "いま場に居る敵を消す（運営）", (player) => {
      const n = killEnemies();
      player.sendMessage(`§7敵を §f${n}§7 体消した`);
    }),
  (registry) =>
    simple(registry, "pve:skip", "ウェーブを終わらせる（運営）", (player, now) => {
      const ok = endWave(now);
      player.sendMessage(ok ? "§7ウェーブを終わらせた" : "§c戦場の最中ではない");
    }),
  (registry) =>
    simple(registry, "pve:start", "試合を始める（開始準備へ）", (player, now) => {
      if (!toPhase("prepare", now)) player.sendMessage(`§cいまは始められない §8${WORLD_LABEL[phase()]}`);
    }),

  (registry) =>
    simple(registry, "pve:stop", "試合を終わらせる（リザルトへ）", (player, now) => {
      if (!end("admin", now)) player.sendMessage(`§cいまは終われない §8${WORLD_LABEL[phase()]}`);
    }),

  (registry) =>
    simple(registry, "pve:pause", "一時停止する", (player, now) => {
      if (!toPhase("paused", now)) player.sendMessage(`§cいまは止められない §8${WORLD_LABEL[phase()]}`);
    }),

  (registry) =>
    simple(registry, "pve:resume", "一時停止から戻す", (player, now) => {
      if (!resume(now)) player.sendMessage("§c止まっていない");
    }),

  (registry) =>
    simple(registry, "pve:join", "試合に入る", (player) => {
      player.sendMessage(`§7参加した §f${PLAYER_LABEL[join(player)]}`);
    }),

  (registry) =>
    simple(registry, "pve:leave", "試合から抜ける", (player) => {
      leave(player);
      player.sendMessage("§7抜けた");
    }),

  (registry) =>
    simple(registry, "pve:state", "いまの状態を出す", (player, now) => {
      const p = phase();
      const left = leftOf(p, phaseAge(now));
      player.sendMessage("§7──── §f状態 §7────");
      player.sendMessage(
        `§7世界 §f${WORLD_LABEL[p]}` + (left === undefined ? "" : ` §8残り ${(left / 20).toFixed(1)} 秒`)
      );
      player.sendMessage(`§7wave §f${wave()}§7 ／ 敵 §f${enemyCount()}`);
      player.sendMessage(`§7参加 §f${members().length}§7 人（立っている §f${alive().length}§7 人）`);
      player.sendMessage(`§7あなた §f${PLAYER_LABEL[phaseOf(player)]}`);
    }),
];
