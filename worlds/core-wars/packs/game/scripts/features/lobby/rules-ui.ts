/**
 * ルールの同意画面。
 *
 * 仕様は `docs/spec/16-participation.md` 1章。
 *
 * ## なぜ画面にするのか
 *
 * チャットに流すだけでは、**読んだかどうかが分からない。**
 * 「同意する」を押させることで、**押した記録が残る。**
 */

import { system, type Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { RULES, RULES_VERSION, agree, hasAgreed } from "../../lib/rules.js";

/**
 * ルールを見せる。
 *
 * **同意済みなら読むだけ。** もう一度押させる意味が無い。
 */
export function showRules(player: Player): void {
  const already = hasAgreed(player);
  const form = new ActionFormData().title("参加ルール").body(`${RULES.join("\n")}\n\n§7版 ${RULES_VERSION}`);

  if (already) {
    form.button("§a同意済み");
  } else {
    form.button("§a同意する");
    form.button("§7同意しない");
  }

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (already) return;
      if (res.selection === 0) {
        agree(player);
        player.sendMessage("§aルールに同意しました。試合に参加できます");
        try {
          player.playSound("random.levelup", { location: player.location, pitch: 1.2 });
        } catch {
          /* 消えている */
        }
      } else {
        player.sendMessage("§7同意しなかったので、試合には参加できません");
      }
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}
