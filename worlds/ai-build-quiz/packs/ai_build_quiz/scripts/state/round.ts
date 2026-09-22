/**
 * いまのお題（メモリだけ）。`docs/spec/15-state.md` 3 章。
 *
 * `/reload` で消える。消えたら idle に戻る（覚えるより、あるべき姿へ寄せる——imp.md 10-7）。
 */

import type { Cell } from "../core/order.js";
import type { RoundHeader } from "../core/messages.js";

export interface Round {
  readonly round: number;
  /** 表示用（発表で出す） */
  readonly answer: string;
  /** 正規化済みの正解の集合 */
  readonly accepted: ReadonlySet<string>;
  readonly kind: string;
  readonly size: number;
  /** `minecraft:` 付き。[0] は air */
  readonly palette: readonly string[];
  /** 置く順 */
  readonly order: readonly Cell[];
  readonly height: number;
  readonly perTick: number;
  placed: number;
  /** 正解した player.id */
  readonly correct: Set<string>;
  /** 正解した順の名前（発表用） */
  readonly winners: string[];
  /** ジャンル（10 秒のヒント）。空なら出さない */
  readonly hint: string;
  hinted: boolean;
  /** 置き始めた tick（正解までのタイム表示に使う。11-flow 5 章） */
  readonly startedTick: number;
  /** 出題モード: 画像モデルに渡したプロンプト・出題者の入力（発表で見せる。17-modes 3 章） */
  readonly prompt?: string;
  readonly topic?: string;
  readonly detail?: string;
  /** 出題モードの出題者（player.id）。無ければ undefined。発言を無視し、発表に名前を出す */
  readonly setterId?: string;
  readonly setterName?: string;
}

/** 受信中（分割された accept・palette・chunk を集めている間。spec 13 の 2 章） */
export interface Pending {
  readonly header: RoundHeader;
  readonly accepts: Map<number, string[]>;
  readonly palettes: Map<number, string[]>;
  readonly chunks: Map<number, string>;
  readonly prompts: Map<number, string>;
}

let current: Round | undefined;
let pending: Pending | undefined;
/** ゲーム内の問番号（`/quiz:start` で 0 に戻す）。bridge の round とは別 */
let questionNumber = 0;

export function round(): Round | undefined {
  return current;
}
export function setRound(r: Round | undefined): void {
  current = r;
}
export function pendingRound(): Pending | undefined {
  return pending;
}
export function setPending(p: Pending | undefined): void {
  pending = p;
}
export function nextQuestionNumber(): number {
  questionNumber++;
  return questionNumber;
}
export function questionNo(): number {
  return questionNumber;
}
export function resetQuestions(): void {
  questionNumber = 0;
}

/** 対戦のこのゲームの問数（`/quiz:start` で決まる。フリー・出題は undefined）。17-modes 1 章 */
let goal: number | undefined;

export function versusGoal(): number | undefined {
  return goal;
}
export function setVersusGoal(n: number | undefined): void {
  goal = n;
}

/** 出題モード: いまお題を出している人（UI を出してから、その round が終わるまで） */
let setter: { id: string; name: string } | undefined;

export function currentSetter(): { id: string; name: string } | undefined {
  return setter;
}

export function setSetter(s: { id: string; name: string } | undefined): void {
  setter = s;
}
