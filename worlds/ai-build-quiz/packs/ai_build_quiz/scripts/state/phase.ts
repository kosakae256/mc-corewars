/**
 * 状態（phase）。**書くのはここだけ。** `docs/spec/11-flow.md` 1 章、`15-state.md` 2 章。
 *
 * bridge は scoreboard `quiz` の偽プレイヤー `phase` を読むので、
 * メモリの状態と scoreboard を**必ず同時に**更新する。数への写像はこの表だけ。
 */

import { world, type ScoreboardObjective } from "@minecraft/server";

export type Phase = "idle" | "waiting" | "building" | "answering" | "reveal" | "failed";

const PHASE_CODE: Record<Phase, number> = {
  waiting: 0,
  building: 1,
  answering: 2,
  reveal: 3,
  idle: 8,
  failed: 9,
};

const OBJECTIVE = "quiz";

let current: Phase = "idle";
let since = 0;

export function quizObjective(): ScoreboardObjective {
  return world.scoreboard.getObjective(OBJECTIVE) ?? world.scoreboard.addObjective(OBJECTIVE, "quiz");
}

const objective = quizObjective;

export function phase(): Phase {
  return current;
}

/** いまの状態になった tick */
export function phaseSince(): number {
  return since;
}

export function setPhase(p: Phase, tick: number): void {
  current = p;
  since = tick;
  try {
    objective().setScore("phase", PHASE_CODE[p]);
  } catch (err) {
    console.warn(`[phase] scoreboard に書けない: ${String(err)}`);
  }
}

export function setRoundNumber(n: number): void {
  try {
    objective().setScore("round", n);
  } catch (err) {
    console.warn(`[phase] scoreboard に書けない: ${String(err)}`);
  }
}

/** 起動直後・/reload 直後は idle。scoreboard にも書く（bridge が古い値を見ないように） */
export function resetPhase(tick: number): void {
  setPhase("idle", tick);
  setRoundNumber(0);
}

/** 計測用（spec 13 の 5-2）: `quiz:echo` で受けた長さを偽プレイヤー `echo` に書く。bridge の probe が読む */
export function setEcho(length: number): void {
  objective().setScore("echo", length);
}
