/**
 * サイドバー ＝ 現在のルール（`docs/spec/17-modes.md` 6 章）。
 *
 * 得点ではなく、いま遊んでいるルール（モード・カテゴリ・問数・答え方）を右に出す。
 * 1 秒ごとに組み直し、**変わったときだけ**書き換える（`services/sidebar.ts`）。
 */

import type { Feature } from "../../types.js";
import { answerTicksOf, HINT_AT_TICKS } from "../../core/timing.js";
import { kindLabel, MSG } from "../../lib/format.js";
import { answerRule, currentMode, fixedKind, genProfile, versusRounds, type Mode } from "../../state/mode.js";
import { phase } from "../../state/phase.js";
import { questionNo, versusGoal } from "../../state/round.js";
import { queueOpen } from "../../state/queue.js";
import { showSidebar } from "../../services/sidebar.js";

const OBJECTIVE = "quiz_rules";
const MODE_LABEL: Record<Mode, string> = { free: "フリー", versus: "対戦", custom: "出題" };

function lines(): string[] {
  const mode = currentMode();
  const k = fixedKind();
  const goal = versusGoal();
  const out: string[] = [
    MSG.ruleMode(mode === "versus" ? `${MODE_LABEL[mode]}（${goal ?? versusRounds()} 問）` : MODE_LABEL[mode]),
    MSG.ruleKind(k ? kindLabel(k) : "すべて"),
  ];
  if (genProfile() !== "v2") out.push(MSG.ruleGen(genProfile())); // v2 が既定なので、それ以外のときだけ
  if (phase() === "idle") {
    out.push(MSG.ruleIdle);
  } else if (goal !== undefined) {
    // 対戦のゲーム中: 何問目か（お題待ちの間は次の問番号）
    out.push(
      MSG.ruleProgress(Math.min(goal, Math.max(1, phase() === "waiting" ? questionNo() + 1 : questionNo())), goal)
    );
  }
  out.push(MSG.ruleAnswer);
  out.push(
    mode === "custom"
      ? MSG.ruleTimeCustom(answerTicksOf("custom") / 20)
      : MSG.ruleTime(answerTicksOf("") / 20, HINT_AT_TICKS / 20)
  );
  out.push(answerRule() === "all" ? MSG.ruleEveryone : MSG.ruleFirstWins);
  if (mode === "versus") {
    out.push(
      answerRule() === "all" ? MSG.ruleVersusTime(goal ?? versusRounds()) : MSG.ruleVersus(goal ?? versusRounds())
    );
    out.push(MSG.ruleBuildingBonus);
  }
  if (mode === "custom")
    out.push(queueOpen() ? MSG.ruleCustom : MSG.ruleCustomClosed, MSG.ruleCustomHiragana, MSG.ruleSetterHint);
  return out;
}

function tick(): void {
  showSidebar(OBJECTIVE, MSG.rulesTitle, lines());
}

export const rules: Feature = { name: "rules", tick: { every: 20, run: tick } };
