/**
 * ロールを買うための点。
 *
 * 仕様は `docs/spec/24-role.md` 3 章。
 *
 * ## 数え直さない
 *
 * **戦績（`lib/stats.ts`）がすでに数えている。**
 * キルもコアも、そこから作る。
 *
 * 別に数えると**必ず食い違う。**
 */

import { world, type Player } from "@minecraft/server";

import { collectStats } from "../../lib/stats.js";
import { addPoints, pointsOf } from "../../lib/roles.js";
import { clearRookie } from "../../lib/first.js";

/** キル 1 つぶん */
const PER_KILL = 5;

/** コア破壊 1 つぶん */
const PER_CORE = 2;

/**
 * 試合の結果から点を配る。
 *
 * **決着したときに 1 回だけ呼ぶ**（`features/finish`）。
 *
 * 途中で抜けた人には入らない。**戦績はその場に居る人から作る**ため。
 */
export function awardPoints(): void {
  const stats = collectStats();
  if (stats.length === 0) return;

  const here = world.getAllPlayers();
  for (const s of stats) {
    const player: Player | undefined = here.find((p) => p.name === s.name);
    if (player === undefined) continue;

    // **1 試合終えた。** もう初めての人ではない（`docs/spec/24-role.md` 3-2-B）
    clearRookie(player);

    const got = s.kill * PER_KILL + s.core * PER_CORE;
    if (got <= 0) continue;
    addPoints(player, got);

    try {
      player.sendMessage(
        `§b+${got}P§7  （キル ${s.kill}×${PER_KILL} / コア ${s.core}×${PER_CORE}）  §7持ち点 §e${pointsOf(player)}P`
      );
    } catch {
      /* 送れなかった */
    }
  }
}
