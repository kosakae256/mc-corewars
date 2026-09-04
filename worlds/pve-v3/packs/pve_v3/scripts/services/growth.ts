/**
 * 買った強化を、実際の値にして配る。
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md`。
 *
 * ```
 * state/growth.ts  回数を持つ
 *        ↓
 * core/growth.ts   回数 → 値・値段
 *        ↓
 * ここ              その値を Minecraft に効かせる
 * ```
 *
 * **算数は `core/`、保存は `state/`。ここは橋渡しだけ。**
 */

import type { Player } from "@minecraft/server";

import { nextCost, statValue, type StatKey } from "../core/growth.js";
import { emeraldOf, levelOf, setEmerald, setLevel } from "../state/growth.js";

/**
 * 素の移動速度。
 *
 * **`tools/pve3-player-move.py` の段と揃っていること**——
 * ずれると、投げるイベント名と実際の値が食い違う。
 */
const BASE_MOVE = 0.1;

/** 段の刻み。**名前は倍率 ×1000**（`spd_1025` ＝ 1.025） */
const SPD_SCALE = 1000;
const SPD_STEP = 0.025;
const SPD_LOW = 1.0;
const SPD_HIGH = 5.0;

/** 速さが合っているとみなす幅 */
const SPD_EPS = 0.0005;

/** いまの値 */
export function valueOf(player: Player, key: StatKey): number {
  return statValue(key, levelOf(player, key));
}

/** その人の最大 HP */
export function maxHpOf(player: Player): number {
  return valueOf(player, "hp");
}

/** 攻撃力の倍率。**1.0 が素** */
export function powerOf(player: Player): number {
  return valueOf(player, "power");
}

/** 攻撃速度。**大きいほど速い**（`features/bow/index.ts` の溜めに足される） */
export function hasteOf(player: Player): number {
  return valueOf(player, "haste");
}

/** 足の速さの倍率 */
export function speedOf(player: Player): number {
  return valueOf(player, "speed");
}

/** 買った結果 */
export interface BuyResult {
  /** 実際に買えた回数。**0 なら何も起きていない** */
  readonly bought: number;
  readonly spent: number;
  /** 買ったあとの回数 */
  readonly level: number;
  /** 買ったあとの値 */
  readonly value: number;
  /** 残ったエメラルド */
  readonly left: number;
}

/**
 * 買う。**買えるところまで買う。**
 *
 * **足りなければ足りるぶんだけ**——「全部買えないから 0 回」にはしない。
 */
export function buy(player: Player, key: StatKey, times: number): BuyResult {
  let level = levelOf(player, key);
  let wallet = emeraldOf(player);
  let bought = 0;
  let spent = 0;

  const want = Math.max(1, Math.floor(Number.isFinite(times) ? times : 1));
  for (let i = 0; i < want; i++) {
    const price = nextCost(key, level);
    if (price === undefined || price > wallet) break;
    wallet -= price;
    spent += price;
    level++;
    bought++;
  }

  if (bought > 0) {
    setLevel(player, key, level);
    setEmerald(player, wallet);
  }
  return { bought, spent, level, value: statValue(key, level), left: wallet };
}

/** その倍率に対応する段のイベント名 */
export function speedEvent(mult: number): string {
  const clamped = Math.max(SPD_LOW, Math.min(SPD_HIGH, mult));
  const step = Math.round(clamped / SPD_STEP) * SPD_STEP;
  return `pve_v3:spd_${Math.round(step * SPD_SCALE)}`;
}

/**
 * 足の速さを効かせる。
 *
 * **覚えるより、あるべき姿へ寄せる**（`docs/imp.md` 10-7）——
 * **いま入っている値を読んで、違うときだけイベントを投げる。**
 * 記録を持たないので、**`/reload` でも入り直しでも勝手に戻る。**
 */
export function applySpeed(player: Player): void {
  const mult = speedOf(player);
  const want = BASE_MOVE * mult;
  try {
    const move = player.getComponent("minecraft:movement");
    if (move !== undefined && Math.abs(move.currentValue - want) < SPD_EPS) return;
    player.triggerEvent(speedEvent(mult));
  } catch {
    // **段が読み込まれていない**（パックが古い）。次の周期でまた試す
  }
}
