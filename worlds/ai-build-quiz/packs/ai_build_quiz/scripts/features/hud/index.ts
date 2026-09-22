/**
 * 表示（actionbar）。`docs/spec/11-flow.md` 5 章。
 *
 * 状態ごとに 1 行。10 tick ごとに全員へ。idle は何も出さない。
 */

import { world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { kindLabel, MSG } from "../../lib/format.js";
import { phase, phaseSince } from "../../state/phase.js";
import { currentMode } from "../../state/mode.js";
import { questionNo, round } from "../../state/round.js";
import { queueHead, queueOpen } from "../../state/queue.js";
import { answerTicksOf } from "../../core/timing.js";

function line(tick: number): string | undefined {
  const r = round();
  switch (phase()) {
    case "waiting":
    case "failed":
      // 出題モード（キュー。17-modes 3 章）: 先頭があれば「◯◯ さんのお題を AI が作成中」、無ければ「ボタンを押すと出題できます」
      if (currentMode() === "custom") {
        const head = queueHead();
        if (head) return MSG.queueGenerating(questionNo() + 1, head.authorName);
        return queueOpen() ? MSG.queueWaiting : MSG.queueWaitingClosed;
      }
      return MSG.thinking(questionNo() + 1);
    case "building":
      return r ? MSG.building(Math.max(0, r.placed), r.order.length) : undefined;
    case "answering":
      if (!r) return undefined;
      return r.kind === "custom"
        ? MSG.answeringHiragana(Math.max(0, Math.ceil((answerTicksOf(r.kind) - (tick - phaseSince())) / 20)))
        : MSG.answering(
            Math.max(0, Math.ceil((answerTicksOf(r.kind) - (tick - phaseSince())) / 20)),
            kindLabel(r.kind)
          );
    case "reveal":
      return undefined; // 一番下の小さい文字は要らない（本人・2026-09-21）
    default:
      return undefined;
  }
}

function tick(tick: number): void {
  const text = line(tick);
  if (text === undefined) return;
  // 出題者にだけ「あなたのお題: ◯◯」（他の人には見えない。17-modes 3 章）
  const r = round();
  const mine = r?.setterId && r.topic && (phase() === "building" || phase() === "answering") ? r : undefined;
  for (const p of world.getAllPlayers()) {
    try {
      p.onScreenDisplay.setActionBar(mine && p.id === mine.setterId ? MSG.yourTopicBar(mine.topic ?? "") : text);
    } catch {
      /* 抜けた */
    }
  }
}

export const hud: Feature = { name: "hud", tick: { every: 10, run: tick } };
