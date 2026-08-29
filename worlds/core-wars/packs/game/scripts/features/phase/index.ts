/**
 * フェーズを進めて、切り替わりを知らせる。
 *
 * 仕様は `docs/spec/11-match.md` 6-Z。
 *
 * ## 黙って切り替えない
 *
 * **削れるようになった瞬間が試合の山場。**
 * 全員が同時に気づく必要がある。
 *
 * ## 画面は割り込ませない（2026-08-25 変更）
 *
 * **5〜1 秒のカウントダウンはしない。**
 *
 * フェーズ 1 は資源を集めて位置を取る時間で、**手を動かしている最中。**
 * そこへ画面いっぱいの数字と音が入ると、邪魔にしかならない。
 *
 * **残り時間はサイドバーに出しっぱなし**（`features/hud`）。
 *
 * **チャットは 60 秒前と 30 秒前の 2 回だけ。**
 * サイドバーを見ていない人にも、そろそろだと伝わる必要がある。
 * チャットは手を止めさせないので、この 2 回は割り込みにならない。
 *
 * ## 止まっている間は数えない
 *
 * 一時停止中は減らさない。**再開したところから続く。**
 */

import { system, world } from "@minecraft/server";

import { isRunning } from "../../lib/match-state.js";
import { forcePhase, phase1LeftSeconds, tickPhase } from "../../lib/phase.js";
import { soundAll, titleAll } from "../../lib/fx.js";

/** 進める間隔（tick）。**1 秒** */
const INTERVAL = 20;

/** チャットに出す残り秒数。**2 回だけ** */
const ANNOUNCE = new Set([60, 30]);

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startPhases(): void {
  system.runInterval(() => {
    // **動いている間だけ数える**（一時停止中は減らさない）
    if (!isRunning()) return;

    if (tickPhase(INTERVAL)) {
      announcePhase2();
      return;
    }

    // **残り 60 秒と 30 秒だけ、チャットに 1 行。**
    // 画面は使わない（`docs/spec/11-match.md` 6-Z）
    const left = phase1LeftSeconds();
    if (ANNOUNCE.has(left)) world.sendMessage(`§eコアを削れるまで §f${left}§e 秒`);
  }, INTERVAL);
}

/**
 * フェーズ 2 になったことを知らせる。
 *
 * **時間で切り替わっても、運営が指定しても同じ合図を出す**
 *（`docs/spec/19-admin-menu.md` 5-A）。
 *
 * どちらで切り替わったかは**遊ぶ側には関係ない。**
 * 「削れるようになった」という事実だけが要る。
 */
function announcePhase2(): void {
  titleAll("§6§lフェーズ 2", "§eコアを削れます", 60);
  soundAll("game.levelup", 1, 1);
  world.sendMessage("§6§lフェーズ 2§r §eコアを削れるようになりました");
}

/**
 * **フェーズを指定する。** 設定メニューから呼ぶ。
 *
 * **黙って変えない。**
 * 1 に戻すと**削れていたものが急に削れなくなる**ので、
 * 言わないと壊れたと思われる。
 */
export function setPhase(to: 1 | 2): void {
  forcePhase(to);
  if (to === 2) {
    announcePhase2();
    return;
  }
  titleAll("§b§lフェーズ 1", "§bコアは削れません", 60);
  soundAll("note.bass", 1, 0.8);
  world.sendMessage(`§b§lフェーズ 1§r §bコアを削れなくなりました §7(あと ${phase1LeftSeconds()} 秒)`);
}
