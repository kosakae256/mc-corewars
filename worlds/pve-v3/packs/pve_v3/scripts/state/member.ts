/**
 * その人の参加のしかたと、死んでいるか。**この 2 つだけを保存する。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md` 3 章。
 *
 * > ### 9 つの状態を直接持たない
 * >
 * > **世界の状態と合わせて毎回出す**（`core/state.ts` の `playerPhase()`）。
 * > **直接持つと、世界と食い違ったときに直せなくなる。**
 */

import type { Player } from "@minecraft/server";

import type { Membership } from "../core/state.js";
import { KEYS } from "./keys.js";

function isMembership(v: unknown): v is Membership {
  return v === "out" || v === "member" || v === "late";
}

/** 参加のしかた。**記録が無ければ「非参加」** */
export function membership(player: Player): Membership {
  try {
    const v = player.getDynamicProperty(KEYS.member);
    return isMembership(v) ? v : "out";
  } catch {
    return "out";
  }
}

export function setMembership(player: Player, value: Membership): void {
  try {
    player.setDynamicProperty(KEYS.member, value);
  } catch {
    /* 消えている */
  }
}

/** 戦場で倒れているか */
export function isDead(player: Player): boolean {
  try {
    return player.getDynamicProperty(KEYS.dead) === true;
  } catch {
    return false;
  }
}

export function setDead(player: Player, value: boolean): void {
  try {
    player.setDynamicProperty(KEYS.dead, value);
  } catch {
    /* 消えている */
  }
}
