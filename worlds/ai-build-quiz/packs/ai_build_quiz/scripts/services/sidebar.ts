/**
 * サイドバーに文章を出す（17-modes 6 章「現在のルール」）。
 *
 * scoreboard の偽プレイヤーを行にし、上から順の番号を点数にする（降順）。番号は行番号として見える。
 * **中身が変わったときだけ書き直す**（毎秒消して足すと点滅する）。同じ文の行は末尾の色記号で区別する。
 */

import { DisplaySlotId, ObjectiveSortOrder, world } from "@minecraft/server";

let shownLines: string[] = [];

export function showSidebar(objectiveId: string, title: string, lines: readonly string[]): void {
  // 同じ字が 2 行あると 1 人（1 参加者）になってしまうので、2 回目以降は見えない記号を足す
  const unique: string[] = [];
  for (const l of lines) {
    let s = l;
    while (unique.includes(s)) s += "§r";
    unique.push(s);
  }
  if (unique.length === shownLines.length && unique.every((l, i) => l === shownLines[i])) return;
  try {
    const o = world.scoreboard.getObjective(objectiveId) ?? world.scoreboard.addObjective(objectiveId, title);
    for (const p of o.getParticipants()) if (!unique.includes(p.displayName)) o.removeParticipant(p);
    unique.forEach((l, i) => o.setScore(l, unique.length - i));
    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
      objective: o,
      sortOrder: ObjectiveSortOrder.Descending,
    });
    shownLines = unique;
  } catch (err) {
    console.warn(`[sidebar] 出せない: ${String(err)}`);
  }
}
