/**
 * ゲームモードと固定カテゴリ（`docs/spec/17-modes.md`）。**書くのはここだけ。**
 *
 * scoreboard `quiz` の偽プレイヤー `mode` `kind` `rounds` `rule` `gen` にも同時に書く（bridge が `mode` `kind` を読む。ワールドに残る）。
 * 起動時は scoreboard から読み戻す。
 */

import { quizObjective } from "./phase.js";

export type Mode = "free" | "versus" | "custom";
export const MODES: readonly Mode[] = ["free", "versus", "custom"];
const MODE_CODE: Record<Mode, number> = { free: 0, versus: 1, custom: 2 };

/** 固定カテゴリ。"" = すべて。番号は 13-transport 3 章 */
export const KINDS = [
  "animal",
  "vehicle",
  "building",
  "food",
  "object",
  "nature",
  "character",
  "person",
  "plant",
] as const;
export type Kind = (typeof KINDS)[number];

/** 対戦の問数の既定（17-modes 1 章） */
export const DEFAULT_ROUNDS = 10;

/** 回答のルール（17-modes 1-1）: 早い者勝ち（最初の 1 人だけ）か、全員回答（当てた人みんな） */
export type AnswerRule = "first" | "all";
export const RULES: readonly AnswerRule[] = ["first", "all"];

/** 生成プロファイル（docs/spec/08-genlab.md 2-1b）。scoreboard `gen` 0 / 1 */
export type GenProfile = "v1" | "v2" | "v3";
export const GEN_PROFILES: readonly GenProfile[] = ["v1", "v2", "v3"];

let mode: Mode = "free";
let kind: Kind | "" = "";
let rounds = DEFAULT_ROUNDS;
let rule: AnswerRule = "first";
let gen: GenProfile = "v2"; // 既定は v2（本人・2026-09-22「v2 を主に使う」）

function read(name: string): number | undefined {
  try {
    const o = quizObjective();
    return o.hasParticipant(name) ? o.getScore(name) : undefined;
  } catch {
    return undefined;
  }
}

function write(name: string, v: number): void {
  try {
    quizObjective().setScore(name, v);
  } catch (err) {
    console.warn(`[mode] scoreboard に書けない: ${String(err)}`);
  }
}

/** 起動時に scoreboard から戻す（無ければ既定を書く） */
export function loadMode(): void {
  const m = read("mode");
  mode = MODES[m ?? 0] ?? "free";
  const k = read("kind") ?? 0;
  kind = k >= 1 && k <= KINDS.length ? (KINDS[k - 1] as Kind) : "";
  const r = read("rounds");
  rounds = r !== undefined && r >= 1 ? r : DEFAULT_ROUNDS;
  rule = RULES[read("rule") ?? 0] ?? "first";
  gen = GEN_PROFILES[read("gen") ?? 1] ?? "v2";
  write("mode", MODE_CODE[mode]);
  write("kind", kind ? KINDS.indexOf(kind) + 1 : 0);
  write("rounds", rounds);
  write("rule", RULES.indexOf(rule));
  write("gen", GEN_PROFILES.indexOf(gen));
}

export function genProfile(): GenProfile {
  return gen;
}

export function setGenProfile(g: GenProfile): void {
  gen = g;
  write("gen", GEN_PROFILES.indexOf(g));
}

export function answerRule(): AnswerRule {
  return rule;
}

export function setAnswerRule(r: AnswerRule): void {
  rule = r;
  write("rule", RULES.indexOf(r));
}

/** 対戦の問数（1 以上。運営がコンパスで決める） */
export function versusRounds(): number {
  return rounds;
}

export function setVersusRounds(n: number): void {
  rounds = Math.max(1, Math.floor(n));
  write("rounds", rounds);
}

export function currentMode(): Mode {
  return mode;
}

export function setMode(m: Mode): void {
  mode = m;
  write("mode", MODE_CODE[m]);
}

export function fixedKind(): Kind | "" {
  return kind;
}

export function setFixedKind(k: Kind | ""): void {
  kind = k;
  write("kind", k ? KINDS.indexOf(k) + 1 : 0);
}
