/**
 * 常時飛行（サバイバルのまま）。`docs/spec/16-world-rules.md` 2 章。
 *
 * 掛けるのは **1 人につき 1 回**: スクリプト起動時に居る全員と、参加したとき（初回スポーン）。
 * 5 秒ごとの掛け直しはやめた（既に飛べる人に掛けると飛行が切れる——本人・2026-09-21）。
 * 死亡の再スポーンでも掛けない（mayfly は死んでも残る）。外れた人は /quiz:start で 1 回だけ全員に掛かる。
 */

import { system, world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { allowFlight, allowFlightAll } from "../../services/flight.js";

function subscribe(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return; // 死亡の再スポーンは掛け直さない
    // 参加直後は実体が揃っていないことがあるので 1 tick 待つ
    system.run(() => allowFlight(ev.player));
  });
  // /reload やパック更新でスクリプトだけ入れ直したときに居る人
  system.run(allowFlightAll);
}

export const flight: Feature = { name: "flight", subscribe };
