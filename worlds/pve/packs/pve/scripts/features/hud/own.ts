/**
 * 自分の画面（アクションバー）。
 *
 * 仕様は `docs/spec/15-hud.md` 2 章。
 *
 * ```
 * §a||||||||||||§0||||  §f142§7/200  §8|  §fグラント §e|||||§0|||||  §f96§7/200
 * ```
 *
 * ## ここは「本人だけに見えるもの」の置き場
 *
 * **名札は全員に同じものが見える。**
 * **狙っている敵**のように、**見ている人によって変わるもの**は、ここでしか出せない。
 */

import { HudElement, HudVisibility, type Entity, type Player } from "@minecraft/server";

import { bar, hpNumber } from "../../lib/bar.js";
import { current, max } from "../../state/hp.js";
import { labelOf } from "../../state/label.js";
import { focusOf } from "./focus.js";
import { hpDebugOn } from "./debug.js";

/** 敵の帯は短くする。**自分のより目立たせない** */
const ENEMY_SEGMENTS = 10;

/** ハートを消す（`docs/spec/15-hud.md` 2-1） */
export function hideHearts(player: Player): void {
  try {
    player.onScreenDisplay.setHudVisibility(HudVisibility.Hide, [HudElement.Health]);
  } catch {
    /* 消えている */
  }
}

/** バニラの体力。**デバッグ用**（減っていないことを目で確かめる） */
function vanillaHp(entity: Entity): string {
  try {
    const h = entity.getComponent("minecraft:health");
    if (h === undefined) return "-";
    return `${Math.round(h.currentValue)}/${Math.round(h.effectiveMax)}`;
  } catch {
    return "-";
  }
}

/** 1 体ぶんの「名前＋帯＋数字」 */
function line(entity: Entity, name: string, segments: number): string | undefined {
  const now = current(entity);
  const cap = max(entity);
  if (now === undefined || cap === undefined) return undefined;
  return `${name}${bar(now, cap, segments)}  ${hpNumber(now, cap)}`;
}

/** 自分の画面を書き直す */
export function showOwn(player: Player, now: number): void {
  const self = line(player, "", 20);
  if (self === undefined) return;

  const target = focusOf(player, now);
  const enemy = target === undefined ? undefined : line(target, `§f${labelOf(target) ?? "？"} `, ENEMY_SEGMENTS);

  let text = self;
  if (enemy !== undefined) text += `  §8|  ${enemy}`;
  // ---- 体力の実態（`docs/spec/15-hud.md` 6-1）
  if (hpDebugOn(player)) {
    const own = `§8自分 バニラ${vanillaHp(player)}`;
    const foe = target === undefined ? "" : ` 敵 バニラ${vanillaHp(target)}`;
    text += `  ${own}${foe}`;
  }

  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    /* 消えている */
  }
}
