/**
 * 飛行の許可（`docs/spec/16-world-rules.md` 2 章）。
 *
 * `/ability <player> mayfly true` は Script API に対応物が無いので runCommand。**教育版の機能 ON** が要る。
 * **1 人につき 1 回だけ掛ける。** 既に飛べる人に掛け直すと飛行が切れる（本人・2026-09-21）。
 * feature（flight・admin）の両方から呼ぶので services に置く。
 */

import { world, type Player } from "@minecraft/server";

import { tellOps } from "./tell.js";

let warned = false;

export function allowFlight(player: Player): void {
  try {
    player.runCommand("ability @s mayfly true");
  } catch (err) {
    if (!warned) {
      warned = true;
      tellOps(`飛行を許可できない（教育版の機能が OFF か、チートが OFF）: ${String(err)}`);
    }
  }
}

/** 今いる全員に 1 回ずつ（スクリプト起動時・/quiz:start） */
export function allowFlightAll(): void {
  for (const p of world.getAllPlayers()) allowFlight(p);
}
