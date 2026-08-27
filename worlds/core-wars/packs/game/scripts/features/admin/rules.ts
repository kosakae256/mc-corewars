/**
 * ルール調整の画面。
 *
 * 仕様は `docs/spec/19-admin-menu.md` 9 章。
 *
 * ## 中身を知らない
 *
 * **並べるのは `lib/rule-config.ts` の一覧そのまま。**
 * 足したものが**そのまま画面に出る。**
 *
 * 画面の側に「何があるか」を書くと、
 * **足すたびに 2 箇所を直すことになる。**
 */

import { type Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

import { RULES, RULE_ORDER, resetRules, ruleBool, ruleInt, ruleLine, setRule } from "../../lib/rule-config.js";

/** 数を変える画面 */
function showNumber(player: Player, key: (typeof RULE_ORDER)[number], back: (p: Player) => void): void {
  const rule = RULES[key];
  if (rule.kind !== "int") return;
  const now = ruleInt(key);
  new ModalFormData()
    .title(rule.label)
    .slider(`${rule.note}（${rule.unit}）`, rule.min, rule.max, { valueStep: 1, defaultValue: now })
    .show(player)
    .then((res) => {
      if (res.canceled || res.formValues === undefined) {
        back(player);
        return;
      }
      const v = res.formValues[0];
      if (typeof v === "number") {
        setRule(key, v);
        player.sendMessage(`§7${rule.label} を §b${v}${rule.unit}§7 にした`);
      }
      back(player);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * ルール調整を開く。
 *
 * @param back 「戻る」で帰る先
 */
export function showRules(player: Player, back: (p: Player) => void): void {
  const form = new ActionFormData().title("ルール調整").body("§7既定から変えたものは §e黄色§7 で出る");

  for (const key of RULE_ORDER) form.button(ruleLine(key));
  form.button("§c全部を既定に戻す", "textures/items/bucket_empty");
  form.button("§e戻る", "textures/items/arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      const i = res.selection;

      // ---- 戻る
      if (i === RULE_ORDER.length + 1) {
        back(player);
        return;
      }
      // ---- 既定に戻す
      if (i === RULE_ORDER.length) {
        resetRules();
        player.sendMessage("§7ルール調整を全部既定に戻した");
        showRules(player, back);
        return;
      }

      const key = RULE_ORDER[i];
      if (key === undefined) return;
      const rule = RULES[key];
      if (rule.kind === "bool") {
        // **押したら反転する。** 入／切だけのものに画面を挟まない
        const next = !ruleBool(key);
        setRule(key, next);
        player.sendMessage(`§7${rule.label} を ${next ? "§a入" : "§c切"}§7 にした`);
        showRules(player, back);
        return;
      }
      showNumber(player, key, (p) => showRules(p, back));
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}
