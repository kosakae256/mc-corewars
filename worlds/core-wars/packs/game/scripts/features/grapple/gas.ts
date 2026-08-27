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

import { shouldBeInBattle } from "../../lib/match-state.js";
import { ruleBool } from "../../lib/rule-config.js";

/** 動的プロパティの名前 */
const KEY = "cw:gas";

/** 上限 */
export const GAS_MAX = 100;

/**
 * ガスは減らない設定か。
 *
 * 仕様は `docs/spec/19-admin-menu.md` 9 章。
 * **動きだけ試したいとき**に使う。既定は切。
 */
function infinite(): boolean {
  return ruleBool("infiniteGas");
}

export function gasOf(player: Player): number {
  // **無限なら常に満タン。** 表示もこれを通る
  if (infinite()) return GAS_MAX;
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
  if (infinite()) return true;
  if (free(player)) return true;
  const now = gasOf(player);
  if (now < amount) return false;
  setGas(player, now - amount);
  return true;
}

/** 減らせるだけ減らす。**移動中の消費に使う** */
export function drainGas(player: Player, amount: number): number {
  if (infinite()) return amount;
  if (free(player)) return GAS_MAX;
  const now = gasOf(player);
  const used = Math.min(now, amount);
  setGas(player, now - used);
  return now - used;
}

/**
 * ただで使えるか。**戦場に居ないなら。**
 *
 * 仕様は `docs/spec/13-grapple.md` 6章。
 *
 * ロビーでも使えるようにしてあるのは**練習させたいから。**
 * そこでガスが尽きて 30 秒待たされるのでは、練習にならない。
 *
 * **減らす側を 1 箇所で止める。**
 * 呼ぶ側それぞれに「ロビーなら」と書くと、経路が増えたときに必ず漏れる。
 */
function free(player: Player): boolean {
  return !shouldBeInBattle(player);
}

/** 回復する */
export function addGas(player: Player, amount: number): void {
  setGas(player, gasOf(player) + amount);
}

/** 満タンに戻す。**参加したとき** */
export function refillGas(player: Player): void {
  setGas(player, GAS_MAX);
}
