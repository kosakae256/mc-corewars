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
 * ```
 *
 * **画面（3 択・ポータル・秒読み）ができるまでの代用。**
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

import type { CommandDef } from "../../types.js";
import { PLAYER_LABEL, RESULT_TICKS, REST_TICKS, WORLD_LABEL, type WorldPhase } from "../../core/state.js";
import { enemyCount } from "../../services/field.js";
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

export const commands: readonly CommandDef[] = [
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
