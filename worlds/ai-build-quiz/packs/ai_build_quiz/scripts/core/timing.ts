/**
 * 時間の定数（`docs/spec/11-flow.md` 2 章）。**遊んでから変える前提**で 1 か所に。
 */

/** 回答の制限時間 */
export const ANSWER_TICKS = 30 * 20;
/** 出題モードの回答の制限時間（本人・2026-09-21「60 秒」。出題者がチャットでヒントを出す時間） */
export const CUSTOM_ANSWER_TICKS = 60 * 20;

/** その round の制限時間。出題モードの round は kind が "custom" */
export function answerTicksOf(kind: string): number {
  return kind === "custom" ? CUSTOM_ANSWER_TICKS : ANSWER_TICKS;
}
/** 回答開始からジャンルのヒントまで（spec 11 の 3-1）。カテゴリはヒントではなく前提なので、お題が届いた時点で出す */
export const HINT_AT_TICKS = 10 * 20; // 20 秒 → 10 秒（本人・2026-09-21）
/** 発表を出しておく時間 */
export const REVEAL_TICKS = 5 * 20;
