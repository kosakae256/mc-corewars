/**
 * **ロビーの人に戻す。**
 *
 * 仕様は `docs/spec/15-presentation.md` 1章。
 *
 * ## なぜ 1 つにまとめるのか
 *
 * 「試合の外に居る人」に戻す場面は、**同じ処理なのに入口が多い。**
 *
 * | 入口 | |
 * | --- | --- |
 * | 決着 | 全員をロビーへ |
 * | 強制終了 | 同じ |
 * | **別セッションで戻ってきた人** | 所属が外れているのに装備だけ残る |
 * | 観戦者のまま取り残された人 | 倒れた記録が残っている |
 *
 * 入口ごとに書くと、**必ずどれかを直し忘れる。**
 * 実際、別セッションで戻った人は
 * **前の試合の装備と効果を持ったままロビーに居た。**
 *
 * **戻すべき状態は 1 つしかない**のだから、関数も 1 つでよい。
 */

import { EquipmentSlot, GameMode, type Player } from "@minecraft/server";

import { clearEverything } from "../loadout/index.js";
import { removeTeamHat } from "../cosmetic/index.js";
import { forceAlive } from "../death/index.js";
import { lobbyPoint } from "../../lib/lobby.js";
import { clearTeamOf } from "../../lib/match-state.js";

/**
 * ロビーの人に戻す。
 *
 * @param move ロビーへ移すか。
 *   **既にロビーに居るなら動かさない。**
 *   歩いているのに引き戻されると、操作を奪われたように感じる。
 */
export function resetToLobby(player: Player, move: boolean): void {
  // ---- **所属を外す**（2026-08-25 追加）
  //
  // 試合が終わっても所属が残っていたので、
  // **ロビーに居るのにチームが赤のまま**だった。
  //
  // 「試合に出ているか」を所属で見ている場所（観戦の入口など）が、
  // **終わったあとも出ていると判断してしまう。**
  //
  // 戦績は数えた時点の所属を控えてあるので、消しても色は残る（`lib/stats.ts`）
  clearTeamOf(player);

  // ---- 倒れた記録を消す（観戦者のまま取り残されない）
  forceAlive(player);

  // ---- 持ち物・装備・効果・体力
  clearEverything(player);

  // ---- チームの帽子（所属が無いのにかぶったままにしない）
  removeTeamHat(player);

  try {
    if (player.getGameMode() === GameMode.Spectator) player.setGameMode(GameMode.Survival);
  } catch {
    /* 消えている */
  }

  if (!move) return;
  try {
    player.teleport(lobbyPoint(), { dimension: player.dimension });
  } catch {
    /* 読み込まれていない。次の機会に */
  }
}

/**
 * 前の試合の名残りが残っているか。
 *
 * **帽子が目印。** 所属が無いのにかぶっているなら、
 * 別のセッションから持ち越している。
 */
export function hasStaleState(player: Player): boolean {
  try {
    const head = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Head);
    if (head !== undefined) return true;
    return player.getGameMode() === GameMode.Spectator;
  } catch {
    return false;
  }
}
