/**
 * 休憩所を組む。**形は毎回同じ**（`docs/spec/14-map-build.md` 6 章）。
 *
 * ```
 * /pve:buildrest ok   −2000, 0, −2000 に組み直す（**いまの休憩所は消える**）
 * /pve:goto rest      休憩所へ飛ぶ
 * ```
 *
 * **流すのは `services/builder.ts`。ここは手順を渡すだけ。**
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

import type { Feature } from "../../types.js";
import { FACING, PLACES } from "../../core/places.js";
import { FLOOR, restOps } from "../../core/rest.js";
import { busy, start } from "../../services/builder.js";

/** 休憩所の基準（絶対座標）。**手順はここからの相対** */
function origin(): { x: number; y: number; z: number } {
  const p = PLACES.rest;
  // **`places.ts` の rest は「立つ高さ」**（床の 1 つ上）
  return { x: p.x, y: FLOOR, z: p.z };
}

function goPlace(player: Player, name: string): boolean {
  const key = name.trim().toLowerCase();
  const where =
    key === "rest" || key === "休憩所"
      ? "rest"
      : key === "field" || key === "戦場"
        ? "field"
        : key === "lobby" || key === "ロビー"
          ? "lobby"
          : undefined;
  if (where === undefined) return false;
  try {
    const yaw = FACING[where];
    // **向きが決まっている場所では、必ずそちらを向かせる**
    player.teleport(PLACES[where], yaw === undefined ? undefined : { rotation: { x: 0, y: yaw } });
  } catch {
    /* 消えている */
  }
  return true;
}

function buildCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:buildrest",
      description: "休憩所を組み直す（**いまの休憩所は消える**。`ok` が要る）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "確認", type: CustomCommandParamType.String }],
    },
    (origin_: CustomCommandOrigin, confirm: string): CustomCommandResult => {
      const e = origin_.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      // **手で直したものが消える。**うっかり打てないようにする
      if (confirm.trim().toLowerCase() !== "ok") {
        return {
          status: CustomCommandStatus.Failure,
          message: "いまの休憩所を全部消して建て直す。よければ /pve:buildrest ok",
        };
      }
      if (busy()) {
        return { status: CustomCommandStatus.Failure, message: "いま別のものを組んでいる" };
      }
      const player = e;
      system.run(() => {
        // **先に飛ぶ**——そこが読み込まれていないと組めない
        goPlace(player, "rest");
        const ops = restOps();
        start("休憩所", ops, origin(), player);
        player.sendMessage(`§7休憩所を組んでいる… §8手順 ${ops.length}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function gotoCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:goto",
      description: "決まった場所へ飛ぶ（lobby / rest / field）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "場所", type: CustomCommandParamType.String }],
    },
    (origin_: CustomCommandOrigin, name: string): CustomCommandResult => {
      const e = origin_.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        if (!goPlace(player, name)) player.sendMessage("§clobby / rest / field のどれか");
        else player.sendMessage(`§7${name} へ飛んだ`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const rest: Feature = {
  name: "rest",
  commands: [buildCommand, gotoCommand],
};
