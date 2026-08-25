/**
 * 自動で試合を始める。
 *
 * 仕様は `docs/spec/19-admin-menu.md` 5 章。
 *
 * ## 何をするか
 *
 * **片付けが終わって 10 秒したら、開始ボタンを押したのと同じことをする。**
 *
 * 連戦させるための道具。
 * 試合が終わる → 片付けが走る → **勝手に次が始まる。**
 *
 * ## なぜ片付けの終わりを待つのか
 *
 * **片付け中は始められない**（`docs/spec/11-match.md` 7-5）。
 * 途中で始めると、始めたあとに片付けが走って
 * **新しい試合の物を消す。**
 *
 * ## なぜ 10 秒待つのか
 *
 * **戻ってきた人が構える時間。**
 * 片付けが終わった瞬間に始まると、
 * ロビーに着いた直後にまた飛ばされる。
 *
 * ## カウントダウンはしない（2026-08-25 変更）
 *
 * **連戦のたびに必ず走る。**
 * ここに演出を置くと、**ロビーに戻るたびに同じものを見せられる。**
 *
 * チャットに 1 行出すだけにして、あとは黙って始める。
 * 開始そのもののカウントダウン（`features/match`）は
 * 戦場へ送ったあとに 1 度だけ走るので、そちらは残っている。
 */

import { system, world, type Player } from "@minecraft/server";

import { matchState } from "../../lib/match-state.js";
import { autoStart } from "../../lib/settings.js";
import { cleanupBusy } from "../cleanup/index.js";
import { beginFromMenu } from "../match/index.js";
import { isOp } from "../../lib/op.js";

/** 待つ長さ（秒） */
const WAIT = 10;

/** 見張る間隔（tick）。**1 秒** */
const INTERVAL = 20;

/** あと何秒か。**走っていなければ 0** */
let left = 0;

/** いま走っているか。**設定メニューが出す** */
export function autoStartLeft(): number {
  return left;
}

/** 誰か 1 人、運営を探す。**始めた人として記録するため** */
function anyOp(): Player | undefined {
  return world.getAllPlayers().find((p) => isOp(p));
}

/**
 * 走らせてよいか。
 *
 * **非開始で、片付けが終わっていて、人が居ること。**
 * 誰も居ない世界で勝手に始めても意味が無い。
 */
function canRun(): boolean {
  if (!autoStart()) return false;
  if (matchState() !== "idle") return false;
  if (cleanupBusy()) return false;
  return world.getAllPlayers().length > 0;
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startAutoStart(): void {
  system.runInterval(() => {
    if (!canRun()) {
      // **止まったことは黙って忘れる。**
      // 片付けの最中に「取り消しました」と流れても、意味が無い
      left = 0;
      return;
    }

    if (left <= 0) {
      left = WAIT;
      world.sendMessage(`§e${WAIT} 秒後に自動で試合を始めます`);
      return;
    }

    left--;

    // **途中は黙って減らす。** 数字も音も出さない
    if (left > 0) return;

    // ---- 時間切れ。**開始ボタンを押したのと同じ**
    //
    // **始めた人として運営を記録する**（`setHost`）。
    // 居なければ始めない——運営主が空だと、抜けても止まらない
    const by = anyOp();
    if (by === undefined) {
      world.sendMessage("§c自動開始できません §7(運営が居ません)");
      return;
    }
    const msg = beginFromMenu(by);
    if (msg !== "") by.sendMessage(msg);
  }, INTERVAL);
}
