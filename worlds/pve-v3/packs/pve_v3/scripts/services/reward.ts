/**
 * エメラルドを配る。
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md` 5 章。
 *
 * ```
 * 倒した人   ＋KILL
 * 削った人   ＋ASSIST（倒した人を除く）
 * ウェーブ   ＋CLEAR ＋ CLEAR_PER_WAVE × wave（生きている人だけ）
 * ```
 *
 * > ### 値は**仮**（2026-09-04）
 * >
 * > **★ごとの倍率も、配分も、まだ決まっていない**（`15-growth.md` 6 章）。
 * > **仕組みだけ先に通しておく。**
 */

import { world, type Entity, type Player } from "@minecraft/server";

import { addEmerald } from "../state/growth.js";

/** 倒した人 */
const KILL = 12;

/** 削った人（倒した人を除く） */
const ASSIST = 6;

/** ウェーブを越えたとき */
const CLEAR = 40;
const CLEAR_PER_WAVE = 8;

/**
 * **誰がその敵を削ったか。**
 *
 * 実体が消えれば要らなくなるので、**倒したときに捨てる。**
 * `/reload` で消えてよい（アシストが 1 回ぶん落ちるだけ）。
 */
const damagers = new Map<string, Set<string>>();

/** 削った人を覚える */
export function noteHit(target: Entity, by: Player | undefined): void {
  if (by === undefined) return;
  let set = damagers.get(target.id);
  if (set === undefined) {
    set = new Set<string>();
    damagers.set(target.id, set);
  }
  set.add(by.id);
}

function give(player: Player, amount: number, why: string): void {
  const left = addEmerald(player, amount);
  try {
    player.onScreenDisplay.setActionBar(`§a+${amount} §7エメラルド §8${why}§7 ／ 計 §a${left}`);
  } catch {
    /* 消えている */
  }
}

/** 倒れたときに配る。**倒した人とアシストに** */
export function awardKill(target: Entity, killer: Player | undefined): void {
  const set = damagers.get(target.id);
  damagers.delete(target.id);
  if (killer !== undefined) give(killer, KILL, "撃破");
  if (set === undefined) return;
  for (const id of set) {
    if (killer !== undefined && id === killer.id) continue;
    const player = world.getAllPlayers().find((p) => p.id === id);
    if (player === undefined) continue;
    give(player, ASSIST, "アシスト");
  }
}

/** ウェーブを越えたときに配る */
export function awardClear(players: readonly Player[], wave: number): void {
  const amount = CLEAR + CLEAR_PER_WAVE * Math.max(0, wave);
  for (const player of players) give(player, amount, `wave ${wave} 突破`);
}

/** 覚えていることを捨てる。**試合が終わったとき** */
export function forgetAll(): void {
  damagers.clear();
}
