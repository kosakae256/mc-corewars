/**
 * ワイヤーのガス。
 *
 * 仕様は `docs/spec/13-grapple.md` 2章。
 *
 * ## どこに持つか
 *
 * **プレイヤーの動的プロパティ。**
 * `/reload` でも読み込み直しでも消えない（`docs/spec/11-match.md` R-1）。
 *
 * メモリに持つと、読み込み直しのたびに満タンに戻る。
 * **撃ち尽くしてから `/reload` すれば無限に使える**ことになってしまう。
 */

import type { Player } from "@minecraft/server";

/** 動的プロパティの名前 */
const KEY = "cw:gas";

/** 上限 */
export const GAS_MAX = 100;

export function gasOf(player: Player): number {
  const v = player.getDynamicProperty(KEY);
  // **既定は満タン。** 初参加でいきなり使えないのは不親切
  return typeof v === "number" ? v : GAS_MAX;
}

function setGas(player: Player, v: number): void {
  player.setDynamicProperty(KEY, Math.max(0, Math.min(GAS_MAX, v)));
}

/**
 * 使う。
 *
 * **足りなければ何も減らさず false。**
 * 中途半端に減らすと、撃てないのにガスだけ減る事故になる。
 */
export function spendGas(player: Player, amount: number): boolean {
  const now = gasOf(player);
  if (now < amount) return false;
  setGas(player, now - amount);
  return true;
}

/** 減らせるだけ減らす。**移動中の消費に使う** */
export function drainGas(player: Player, amount: number): number {
  const now = gasOf(player);
  const used = Math.min(now, amount);
  setGas(player, now - used);
  return now - used;
}

/** 回復する */
export function addGas(player: Player, amount: number): void {
  setGas(player, gasOf(player) + amount);
}

/** 満タンに戻す。**参加したとき** */
export function refillGas(player: Player): void {
  setGas(player, GAS_MAX);
}
