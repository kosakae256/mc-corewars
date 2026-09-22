/**
 * 体力を常に 1（ハート半分）に（`docs/spec/16-world-rules.md` 6 章。本人「HP を常に 0.5 にしておいて」）。
 *
 * 10 tick ごとに全員の `health` を 1 に戻す（自然回復で増えても戻る）。参加時も。
 */

import { world, type Player } from "@minecraft/server";

import type { Feature } from "../../types.js";

const HEALTH = 1;

function pin(player: Player): void {
  try {
    const h = player.getComponent("health");
    if (h && h.currentValue !== HEALTH) h.setCurrentValue(HEALTH);
  } catch {
    /* 抜けた・死んでいる */
  }
}

function subscribe(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => pin(ev.player));
}

function tick(): void {
  for (const p of world.getAllPlayers()) pin(p);
}

export const health: Feature = { name: "health", subscribe, tick: { every: 10, run: tick } };
