/**
 * 輪は 1 本（`docs/imp.md` 10-1）。pve-v3 から写した。
 *
 * 機能ごとに `runInterval` を書くと、順序も負荷もどこにも書かれていない状態になる。
 * **`every` は tick で割る。** 開始位置に依らず、必ず回る。
 */

import { system } from "@minecraft/server";

import type { Feature } from "./types.js";
import { tellOps } from "./services/tell.js";

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
        // **1 つこけても、残りは回す。** 止まると「何も動かない」になり原因が分からない
        console.warn(`[loop] ${job.name}: ${String(err)}`);
        tellOps(`こけた: ${job.name} — ${String(err)}`);
      }
    }
  }, 1);
}
