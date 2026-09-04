/**
 * 試合の進行。**状態を変えてよいのは、ここだけ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md`。
 *
 * ```
 * toPhase()  ─ 表にある遷移か確かめる
 *            ─ 出るときの後始末（exit）
 *            ─ 入るときの支度（entry）
 * ```
 *
 * **その人を寄せるのは `services/presence.ts`。ここは世界の状態だけ。**
 */

import { world, type Player } from "@minecraft/server";

import { canEnter, isResumable, type EndReason, type WorldPhase } from "../core/state.js";
import * as match from "../state/match.js";
import { membership, setDead, setMembership } from "../state/member.js";
import { reset as resetGrowth } from "../state/growth.js";
import { heal, max as hpMax } from "../state/hp.js";
import { clearEnemies } from "./field.js";
import { awardClear, forgetAll } from "./reward.js";
import { alive, members, unfreezeAll } from "./presence.js";

/** いまの状態 */
export function phase(): WorldPhase {
  return match.phase();
}

/** その状態に入ってから何 tick たったか */
export function phaseAge(now: number): number {
  return Math.max(0, now - match.phaseAt());
}

/** いま何戦目か */
export function wave(): number {
  return match.wave();
}

function announce(text: string): void {
  for (const p of world.getAllPlayers()) {
    try {
      p.sendMessage(text);
    } catch {
      /* 消えている */
    }
  }
}

function revive(player: Player): void {
  setDead(player, false);
  const cap = hpMax(player);
  if (cap !== undefined && cap > 0) heal(player, cap);
}

/**
 * 出るときの後始末。
 *
 * **出したもの・貼ったものを残さない**（`docs/spec/17-state.md` 4 章）。
 */
function exit(from: WorldPhase, to: WorldPhase): void {
  switch (from) {
    case "wave":
      // **クリアで抜けるときだけ、越えた褒美を配る**
      if (to === "rest") awardClear(alive(), match.wave());
      // **残った敵を片付ける**（クリアでも全滅でも）
      clearEnemies();
      break;
    case "rest":
      // **途中参加を「参加中」へ昇格**（戦場へ出るときだけ）
      if (to === "wave") {
        for (const p of members()) if (membership(p) === "late") setMembership(p, "member");
      }
      break;
    case "paused":
      unfreezeAll();
      break;
    default:
      break;
  }
}

/** 入るときの支度 */
function entry(to: WorldPhase, from: WorldPhase, now: number): void {
  switch (to) {
    case "idle":
      // **全部リセット。**参加を解き、強化とエメラルドを消す
      for (const p of world.getAllPlayers()) {
        setMembership(p, "out");
        setDead(p, false);
        resetGrowth(p);
      }
      match.clear();
      clearEnemies();
      forgetAll();
      break;

    case "prepare":
      // **その場に居る人を参加者にする**（仮。開始操作は未定）
      for (const p of world.getAllPlayers()) {
        setMembership(p, "member");
        setDead(p, false);
      }
      match.setWave(0);
      announce("§7試合の準備をしている…");
      break;

    case "rest":
      // **死んでいた人はここで生き返る**
      for (const p of members()) revive(p);
      announce(`§a休憩所 §7— 30 秒。次の相手を選ぶ §8(wave ${match.wave()} 終了)`);
      break;

    case "wave":
      match.setWave(match.wave() + 1);
      for (const p of members()) revive(p);
      announce(`§cwave ${match.wave()} §7— 開始`);
      break;

    case "paused":
      // **戻り先を覚える。**覚えないと返せない
      if (isResumable(from)) match.setResumeTo(from);
      announce("§e一時停止");
      break;

    case "result":
      clearEnemies();
      announce(`§7──── §fリザルト §7──── §8到達 wave ${match.wave()}`);
      break;
  }
  match.setPhase(to, now);
}

/**
 * 状態を変える。**表に無い遷移は通さない。**
 *
 * @returns 変えられたか
 */
export function toPhase(to: WorldPhase, now: number): boolean {
  const from = match.phase();
  if (from === to) return false;
  if (!canEnter(from, to)) {
    console.warn(`[match] ${from} → ${to} は表に無い`);
    return false;
  }
  exit(from, to);
  entry(to, from, now);
  return true;
}

/** 一時停止から戻す */
export function resume(now: number): boolean {
  if (match.phase() !== "paused") return false;
  const back = match.resumeTo() ?? "rest";
  match.setResumeTo("");
  return toPhase(back, now);
}

/** 終わらせる */
export function end(reason: EndReason, now: number): boolean {
  const ok = toPhase("result", now);
  if (ok) announce(`§8終わり方: ${reason}`);
  return ok;
}
