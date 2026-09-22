/**
 * 得点（`docs/spec/11-flow.md` 4 章、`17-modes.md` 1 章）。
 *
 * - 対戦スコア `quiz_score`: 対戦を始めるたびに 0。**表示スロットには出さない**（サイドバーは現在のルール——17-modes 6 章）。
 *   正解のチャットと最後の結果発表で見せる
 * - 累計 `quiz_total`: モードに関係なく当てるたびに +1。**消さない**。tab（list）とランキング板（17-modes 7 章）
 */

import {
  DisplaySlotId,
  world,
  type Player,
  type ScoreboardIdentity,
  type ScoreboardObjective,
} from "@minecraft/server";

import { MSG } from "../lib/format.js";

const OBJECTIVE = "quiz_score";
const TOTAL = "quiz_total";

function objective(): ScoreboardObjective {
  return world.scoreboard.getObjective(OBJECTIVE) ?? world.scoreboard.addObjective(OBJECTIVE, MSG.scoreboardTitle);
}

function total(): ScoreboardObjective {
  return world.scoreboard.getObjective(TOTAL) ?? world.scoreboard.addObjective(TOTAL, MSG.totalTitle);
}

/** 累計を tab（list）に常に出す */
export function showTotal(): void {
  try {
    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.List, { objective: total() });
  } catch (err) {
    console.warn(`[score] list に出せない: ${String(err)}`);
  }
}

function bump(o: ScoreboardObjective, player: Player, points: number): void {
  const now = o.hasParticipant(player) ? (o.getScore(player) ?? 0) : 0;
  o.setScore(player, now + points);
}

export function totalOf(player: Player): number {
  try {
    const o = total();
    return o.hasParticipant(player) ? (o.getScore(player) ?? 0) : 0;
  } catch {
    return 0;
  }
}

export interface Rank {
  readonly name: string;
  readonly score: number;
}

/**
 * 名前を覚える（17-modes 7 章）。抜けている人の `ScoreboardIdentity.displayName` は "offlineplayername" になる（本人が発見）ので、
 * 参加・得点のたびに scoreboard identity の id → 名前を dynamic property に書いておく
 */
export function rememberName(player: Player): void {
  try {
    const id = player.scoreboardIdentity?.id;
    if (id !== undefined) world.setDynamicProperty(`quiz:name:${id}`, player.name);
  } catch {
    /* 抜けた */
  }
}

function nameOf(p: ScoreboardIdentity): string {
  try {
    const saved = world.getDynamicProperty(`quiz:name:${p.id}`);
    if (typeof saved === "string" && saved) return saved;
  } catch {
    /* 読めない */
  }
  return p.displayName;
}

/** 目標の参加者を点数の多い順に（同点は名前順）。抜けている人も入る（scoreboard に残る） */
function rankingOf(o: ScoreboardObjective, limit: number): Rank[] {
  const rows: Rank[] = [];
  for (const p of o.getParticipants()) {
    const score = o.getScore(p);
    if (score === undefined || score <= 0) continue;
    rows.push({ name: nameOf(p), score });
  }
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows.slice(0, limit);
}

/** 対戦スコア（このゲーム） */
export function scoreOf(player: Player): number {
  try {
    const o = objective();
    return o.hasParticipant(player) ? (o.getScore(player) ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function versusRanking(limit = 100): Rank[] {
  try {
    return rankingOf(objective(), limit);
  } catch {
    return [];
  }
}

export function totalRanking(limit: number): Rank[] {
  try {
    return rankingOf(total(), limit);
  } catch {
    return [];
  }
}

/** 全員 0 に（ゲーム単位） */
export function resetScores(): void {
  try {
    const o = objective();
    for (const p of o.getParticipants()) o.removeParticipant(p);
  } catch (err) {
    console.warn(`[score] 消せない: ${String(err)}`);
  }
}

/** 当てた。累計は常に +1、対戦スコアは対戦中だけ */
export function addPoint(player: Player, points: number, versus: boolean): void {
  try {
    bump(total(), player, 1);
    if (versus) bump(objective(), player, points);
    rememberName(player); // 得点した時点で identity ができるので、ここで名前を覚える
  } catch (err) {
    console.warn(`[score] 加点できない: ${String(err)}`);
  }
}
