/**
 * 輪は 1 本。
 *
 * 仕様は `docs/imp.md` 10-1。
 *
 * ## なぜ 1 本なのか
 *
 * 機能ごとに `runInterval` を書くと、
 * **順序も負荷も、どこにも書かれていない状態**になる。
 *
 * | 1 本にすると | |
 * | --- | --- |
 * | **順序** | 一覧の上から順。**読めば分かる** |
 * | **負荷** | 1 か所で測れる。重いものを後ろへ回せる |
 * | **止め方** | 一覧から外すだけ |
 *
 * **`every` は tick で割る。** 開始位置に依らず、必ず回る。
 */

import { system } from "@minecraft/server";

import type { Feature } from "./types.js";

/** 動かす機能。**`main.ts` から渡される** */
export function startLoop(features: readonly Feature[]): void {
  const jobs = features
    .filter((f) => f.tick !== undefined)
    .map((f) => ({ name: f.name, every: Math.max(1, f.tick?.every ?? 1), run: f.tick?.run }));

  system.runInterval(() => {
    const tick = system.currentTick;
    for (const job of jobs) {
      if (tick % job.every !== 0) continue;
      try {
        job.run?.(tick);
      } catch (err) {
        // **1 つこけても、残りは回す。**
        // 止まると「何も動かない」になり、原因が分からなくなる
        console.warn(`[loop] ${job.name}: ${String(err)}`);
      }
    }
  }, 1);
}
