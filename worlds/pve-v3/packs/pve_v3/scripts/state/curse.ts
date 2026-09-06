/**
 * 呪いの積み上がりを、ワールドに持つ。
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md` 4 章。**数え方は `core/curse.ts`。**
 *
 * **1 本の文字列にまとめて持つ**——鍵を 4 つに分けるほどのものではない。
 */

import { world } from "@minecraft/server";

import { NO_CURSE, type CurseCount, type CurseKind } from "../core/curse.js";
import { KEYS } from "./keys.js";

function read(): CurseCount {
  try {
    const v = world.getDynamicProperty(KEYS.curse);
    if (typeof v !== "string") return NO_CURSE;
    const [hp, power, speed, haste] = v.split(",").map((x) => Number.parseInt(x, 10));
    if ([hp, power, speed, haste].some((n) => !Number.isFinite(n))) return NO_CURSE;
    return { hp: hp ?? 0, power: power ?? 0, speed: speed ?? 0, haste: haste ?? 0 };
  } catch {
    return NO_CURSE;
  }
}

/** いまの積み上がり */
export function curseCount(): CurseCount {
  return read();
}

/** 書き戻す */
export function setCurse(count: CurseCount): void {
  try {
    world.setDynamicProperty(KEYS.curse, `${count.hp},${count.power},${count.speed},${count.haste}`);
  } catch {
    /* 読み込まれていない */
  }
}

/** 積む */
export function addCurse(picks: readonly CurseKind[]): CurseCount {
  const now = read();
  const next: Record<CurseKind, number> = { ...now };
  for (const k of picks) next[k]++;
  setCurse(next);
  return next;
}

/** 全部落とす。**試合を始めるとき** */
export function clearCurse(): void {
  setCurse(NO_CURSE);
}
