/**
 * 「強化を選び終わったか」。**その人に持つ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md` 3 章（人の状態）。
 *
 * > ### 状態にして、毎周期あるべき姿へ寄せる
 * >
 * > **暗転も UI も「選んでいる状態」から出す。**
 * > 以前は機能の中に覚え書きを置いていたので、
 * > **捨てる場所を 1 つ間違えただけで暗転が途切れた**（2026-09-05 の失敗）。
 */

import { world, type Player } from "@minecraft/server";

import { KEYS } from "./keys.js";

/** 選び終わったか。**既定は「終わっている」**（幕間の外では関係ない） */
export function isPicked(player: Player): boolean {
  return player.getDynamicProperty(KEYS.picked) !== false;
}

export function setPicked(player: Player, value: boolean): void {
  player.setDynamicProperty(KEYS.picked, value);
}

/** 全員を「まだ選んでいない」に戻す。**幕間に入った瞬間** */
export function resetPicked(): void {
  for (const p of world.getAllPlayers()) {
    try {
      setPicked(p, false);
    } catch {
      /* 抜けた */
    }
  }
}
