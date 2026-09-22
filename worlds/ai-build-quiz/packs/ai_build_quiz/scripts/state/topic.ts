/**
 * 出題モードのお題（キューの先頭）を bridge に見せる（`docs/spec/17-modes.md` 3 章、`13-transport.md` 3 章）。
 *
 * scoreboard 目標 `quiz_topic` の偽プレイヤー名に書く: `0:<id>`、`1:<お題>`、`2:` `3:` … に詳細を 50 文字ずつ。
 * bridge が名前を読む。書く前に前の名前を全部消す。先頭が変わるたびに `state/queue.ts` が呼ぶ。
 */

import { world, type ScoreboardObjective } from "@minecraft/server";

const OBJECTIVE = "quiz_topic";
/** 詳細を割る長さ（偽プレイヤー名の上限が分からないので短く保つ。spec 13 の 3 章） */
const PIECE = 50;

function objective(): ScoreboardObjective {
  return world.scoreboard.getObjective(OBJECTIVE) ?? world.scoreboard.addObjective(OBJECTIVE, "quiz_topic");
}

let last: { id: number; topic: string; detail: string } | undefined;

/** 最後に書いた先頭（発表で見せる・go で照合する） */
export function lastTopic(): { id: number; topic: string; detail: string } | undefined {
  return last;
}

function wipe(o: ScoreboardObjective): void {
  for (const p of o.getParticipants()) o.removeParticipant(p);
}

export function writeTopic(id: number, topic: string, detail: string): void {
  last = { id, topic, detail };
  try {
    const o = objective();
    wipe(o);
    o.setScore(`0:${id}`, 0);
    o.setScore(`1:${topic}`, 1);
    const chars = [...detail];
    for (let i = 0, n = 2; i < chars.length; i += PIECE, n++)
      o.setScore(`${n}:${chars.slice(i, i + PIECE).join("")}`, n);
  } catch (err) {
    console.warn(`[topic] scoreboard に書けない: ${String(err)}`);
  }
}

/** キューが空: bridge に「無い」と見せる */
export function clearTopic(): void {
  last = undefined;
  try {
    wipe(objective());
  } catch (err) {
    console.warn(`[topic] scoreboard を消せない: ${String(err)}`);
  }
}
