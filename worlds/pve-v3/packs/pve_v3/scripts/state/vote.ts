/**
 * 休憩所の 3 択に、その人が入れた門。**その人に持つ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 3-2。
 *
 * > ### 門の中に立っている＝その門に入れている
 * >
 * > **最後に立っていた門が、その人の 1 票。** 移れば入れ直せる。
 */

import { world, type Player } from "@minecraft/server";

import { GATES } from "../core/gate-choice.js";
import { KEYS } from "./keys.js";

/** その人が入れた門（0〜2）。**入れていなければ undefined** */
export function voteOf(player: Player): number | undefined {
  const v = player.getDynamicProperty(KEYS.vote);
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= GATES) return undefined;
  return v;
}

export function setVote(player: Player, gate: number): void {
  player.setDynamicProperty(KEYS.vote, gate);
}

/** 全員の票を捨てる。**休憩所に入った瞬間** */
export function resetVotes(): void {
  for (const p of world.getAllPlayers()) {
    try {
      p.setDynamicProperty(KEYS.vote, undefined);
    } catch {
      /* 抜けた */
    }
  }
}
