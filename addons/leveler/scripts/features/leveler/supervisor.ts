/**
 * 止まったボットを外から蹴り起こす（spec 3-A-10）。
 *
 * ## なぜ要るか
 *
 * ボットの作業は「終わったら次を予約する」という自己申告で回っている。
 * **どこかで申告が途切れると、その個体は永久に止まる。**
 * 実際に次の経路で起きた。
 *
 *   - `system.runJob` に渡したジェネレータが例外で死に、完了通知が来ない
 *   - `runInterval` の中で例外が出て、次のマスが割り当てられない
 *   - 予約を持ったまま止まり、そのマスが誰にも触れなくなる
 *
 * ## 見張りは外に置く
 *
 * **止まる仕組みの内側に見張りを置いても意味がない。**
 * 「探索中なら見張る」を探索の入口に書いても、
 * その入口が呼ばれなくなる止まり方には効かない（実際そうなっていた）。
 *
 * **独立した `runInterval` から、全ボットをまとめて見る。**
 */
import { system } from "@minecraft/server";

import { STALL_LIMIT, SUPERVISOR_INTERVAL } from "./config.js";

/** 見張る対象。止まっていたら `kick()` を呼ぶ */
export type Supervisable = {
  readonly isRunning: boolean;
  /** 最後に何かが進んだ tick */
  readonly lastActive: number;
  /** 強制的に作業をやり直させる */
  kick(): void;
};

const watched = new Set<Supervisable>();
let runId: number | undefined;

export function watch(target: Supervisable): void {
  watched.add(target);
  if (runId !== undefined) return;

  runId = system.runInterval(() => {
    const now = system.currentTick;
    for (const t of watched) {
      if (!t.isRunning) continue;
      if (now - t.lastActive < STALL_LIMIT) continue;
      try {
        t.kick();
      } catch {
        // 蹴るのに失敗しても、次の周期でまた蹴る
      }
    }
  }, SUPERVISOR_INTERVAL);
}

export function unwatch(target: Supervisable): void {
  watched.delete(target);
  if (watched.size > 0 || runId === undefined) return;
  system.clearRun(runId);
  runId = undefined;
}
