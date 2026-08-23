/**
 * ボットの体力・空腹を無限にする（spec 3-7）。
 *
 * サバイバルで動かすので、放っておくと落下・窒息・殴り合いで死ぬ。
 * 死なれると整地が止まるので、常に満タンに戻し続ける。
 *
 * ## 1本のタイマーで全員ぶんやる
 *
 * ボットごとにタイマーを持つと 100体で 100本になる。
 * `allBots()` を回して1本で済ませる。
 *
 * ## 空腹も戻す
 *
 * 空腹が減ると自然回復が止まり、走れなくなる。
 * 体力だけ戻しても遅いボットになってしまう。
 */
import { EntityComponentTypes, system } from "@minecraft/server";
import type { SimulatedPlayer } from "@minecraft/server-gametest";

import { VITALS_INTERVAL } from "./config.js";
import { allBots } from "./registry.js";

let runId: number | undefined;

/** 満タンに戻す対象。どれも EntityAttributeComponent なので同じ扱いでよい */
const VITALS = [
  EntityComponentTypes.Health,
  EntityComponentTypes.Hunger,
  EntityComponentTypes.Saturation,
] as const;

function restore(bot: SimulatedPlayer): void {
  for (const id of VITALS) {
    try {
      bot.getComponent(id)?.resetToMaxValue();
    } catch {
      // 取れない個体は次の周期で拾う
    }
  }
}

/** 体力・空腹を戻し続ける。何度呼んでもタイマーは1本 */
export function startVitals(): void {
  if (runId !== undefined) return;

  runId = system.runInterval(() => {
    for (const { bot } of allBots()) {
      if (bot.isValid) restore(bot);
    }
  }, VITALS_INTERVAL);
}

/** 止める。ボットを全員退場させたときに呼ぶ */
export function stopVitals(): void {
  if (runId === undefined) return;
  system.clearRun(runId);
  runId = undefined;
}
