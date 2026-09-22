/**
 * 自分のHP欄と、狙っている敵のアクションバー（spec/39）。
 *
 * 仕様は `docs/spec/39-player-hp-hud.md`。
 *
 * ```
 * HP欄: 赤い画像ゲージ内に142/200    通貨欄: エメラルド画像 + 12,345
 * ```
 *
 * ## ここは「本人だけに見えるもの」の置き場
 *
 * **名札は全員に同じものが見える。**
 * **狙っている敵**のように、**見ている人によって変わるもの**は、ここでしか出せない。
 */

import { HudElement, HudVisibility, type Entity, type Player } from "@minecraft/server";

import { bar, hpNumber } from "../../core/bar.js";
import { current, max } from "../../state/hp.js";
import { labelOf } from "../../state/label.js";
import { focusOf } from "./focus.js";
import { hpHudText, moneyHudText } from "./hp-text.js";
import { emeraldOf } from "../../state/growth.js";

/** HPか所持金が変わった時だけ送る。UI再構築に備え5秒ごとにも再送する。 */
const sent = new Map<string, { readonly text: string; readonly money: string; readonly at: number }>();

export function forgetOwn(id: string): void {
  sent.delete(id);
}

/** 敵の帯は短くする。**自分のより目立たせない** */
const ENEMY_SEGMENTS = 10;

/** ハート・食料・経験値の標準表示を消し、独自HUDの領域を確保する（spec/39）。 */
export function hideHearts(player: Player): void {
  try {
    player.onScreenDisplay.setHudVisibility(HudVisibility.Hide, [
      HudElement.Health,
      HudElement.Hunger,
      HudElement.ProgressBar,
    ]);
  } catch {
    /* 消えている */
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
  const hp = current(player);
  const cap = max(player);
  if (hp === undefined || cap === undefined) return;
  const text = hpHudText(hp, cap);
  const money = moneyHudText(emeraldOf(player), hp, cap);
  const previous = sent.get(player.id);
  if (previous?.text === text && previous.money === money && now - previous.at < 100) return;
  try {
    // JSON UIへの通信。専用接頭辞は中央タイトルでは表示されない。
    player.onScreenDisplay.setTitle(text, {
      subtitle: money,
      fadeInDuration: 0,
      stayDuration: 120,
      fadeOutDuration: 0,
    });
    sent.set(player.id, { text, money, at: now });
  } catch {
    /* 消えている。失敗時は控えを書かず、次の周期で再送する。 */
  }
}

/** 狙っている敵の表示は既存の場所を維持する。自分のHPは重複させない。 */
export function showFocus(player: Player, now: number): void {
  const target = focusOf(player, now);
  const enemy = target === undefined ? undefined : line(target, `§f${labelOf(target) ?? "？"} `, ENEMY_SEGMENTS);
  if (enemy === undefined) return;

  try {
    player.onScreenDisplay.setActionBar(enemy);
  } catch {
    /* 消えている */
  }
}
