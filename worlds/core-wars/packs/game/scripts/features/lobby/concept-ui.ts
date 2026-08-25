/**
 * コンセプトの画面。
 *
 * 企画は `docs/00-concept.md` 1-A。
 *
 * ## ルールの画面とは別
 *
 * **読むだけ。** 同意も記録も無い。
 * 一緒にすると、**読んだかどうかを持たされる**ことになる。
 */

import type { Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { conceptText, creditsText } from "../../lib/concept.js";

/** クレジットを見せる */
export function showCredits(player: Player): void {
  new ActionFormData()
    .title("クレジット")
    .body(creditsText())
    .button("§e閉じる")
    .show(player)
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** コンセプトを見せる */
export function showConcept(player: Player): void {
  new ActionFormData()
    .title("このゲームについて")
    .body(conceptText())
    .button("§e閉じる")
    .show(player)
    .catch(() => {
      /* 画面を出せなかった */
    });
}
