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
 * > ### とどめとアシストは**ウェーブと個体で決まる**（2026-09-06）
 * >
 * > **`20 × wave × 倍率` ／ `4 × wave × 倍率`**（`23-enemy-unit.md` 5 章）。
 * > **ウェーブ突破のぶんは、まだ仮の値。**
 */

import { world, type Entity, type Player } from "@minecraft/server";

import { addEmerald } from "../state/growth.js";
import { KEYS } from "../state/keys.js";
import { wave } from "../state/match.js";

/**
 * 倒した人・削った人の取り分（**ウェーブごと**・`23-enemy-unit.md` 5 章）。
 *
 * ```
 * とどめ    20 × wave × その敵のエメラルド倍率
 * アシスト   4 × wave × その敵のエメラルド倍率
 * ```
 *
 * > ### **★ごとの倍率は置かない**（2026-09-06 決定）
 * >
 * > **強い個体はエメラルド倍率が高く、強い個体が多い群れは★が高い。**
 * > **だから★が高いほど、自然に多く入る。**
 */
const KILL_PER_WAVE = 20;
const ASSIST_PER_WAVE = 4;

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
  // **wave 0（休憩所の前）でも 0 にしない**——1 として数える
  const w = Math.max(1, wave());
  const mult = multOf(target);
  const kill = Math.max(1, Math.round(KILL_PER_WAVE * w * mult));
  const assist = Math.max(1, Math.round(ASSIST_PER_WAVE * w * mult));
  if (killer !== undefined) give(killer, kill, "撃破");
  if (set === undefined) return;
  for (const id of set) {
    if (killer !== undefined && id === killer.id) continue;
    const player = world.getAllPlayers().find((p) => p.id === id);
    if (player === undefined) continue;
    give(player, assist, "アシスト");
  }
}

/** その敵のエメラルド倍率。**湧かせたときに入れてある**（`services/spawn.ts`） */
function multOf(target: Entity): number {
  try {
    const v = target.getDynamicProperty(KEYS.emeraldMult);
    return typeof v === "number" && v >= 0 ? v : 1;
  } catch {
    return 1;
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
