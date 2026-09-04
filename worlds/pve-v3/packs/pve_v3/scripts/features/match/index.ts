/**
 * 試合の進行。**砂時計を進め、条件が揃ったら次の状態へ送る。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md`。
 *
 * | 状態 | 出る条件 | 次 |
 * | --- | --- | --- |
 * | 開始準備 | **5 秒（仮）** | 休憩所 |
 * | 休憩所 | **30 秒** | wave 進行中 |
 * | wave 進行中 | **敵 0** | 休憩所（**30 戦目ならゲーム終了**） |
 * | wave 進行中 | **全員死亡** | ゲーム終了 |
 * | ゲーム終了 | **15 秒** | ゲーム非開始 |
 *
 * **状態を変えるのは `services/match.ts`。ここは「いつ変えるか」だけ。**
 */

import { world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { LAST_WAVE, PREPARE_TICKS, RESULT_TICKS, REST_TICKS } from "../../core/state.js";
import { enemyCount } from "../../services/field.js";
import { end, phase, phaseAge, toPhase, wave } from "../../services/match.js";
import { alive, members, reconcile } from "../../services/presence.js";
import { commands } from "./command.js";

/**
 * ウェーブに入ってから、クリア判定を始めるまでの待ち。
 *
 * **敵を湧かせる仕組みがまだ無い**（軍団は次の段）——
 * **0 秒で見ると、始まった瞬間にクリアになって回り続ける。**
 */
const WAVE_GRACE = 60;

function tick(now: number): void {
  // ---- まず全員をあるべき姿へ寄せる
  for (const player of world.getAllPlayers()) reconcile(player, now);

  const age = phaseAge(now);

  switch (phase()) {
    case "prepare":
      // **本当はマップの完成を待つ**（`14-map-build.md`）。まだ無いので時間で進める
      if (age >= PREPARE_TICKS) toPhase("rest", now);
      break;

    case "rest":
      // **全員ポータルで早く出る**のは、休憩所ができてから
      if (age >= REST_TICKS) toPhase("wave", now);
      break;

    case "wave": {
      if (members().length > 0 && alive().length === 0) {
        end("wipe", now);
        break;
      }
      if (age < WAVE_GRACE || enemyCount() > 0) break;
      if (wave() >= LAST_WAVE) end("cleared", now);
      else toPhase("rest", now);
      break;
    }

    case "result":
      if (age >= RESULT_TICKS) toPhase("idle", now);
      break;

    default:
      // **非開始・一時停止は、時間では動かない**
      break;
  }
}

export const matchFlow: Feature = {
  name: "match",
  commands,
  tick: {
    // **5 tick に 1 回。** 砂時計は時刻で見るので、粗くてもずれない
    every: 5,
    run: tick,
  },
};
