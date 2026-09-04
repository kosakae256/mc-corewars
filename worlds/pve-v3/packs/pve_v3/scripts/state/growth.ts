/**
 * 強化の回数と、エメラルド。**その人に紐づけて持つ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md`。
 *
 * ## エメラルドはアイテムにしない（2026-09-04 決定）
 *
 * **本物のエメラルドにすると、死んだときに落ちる・人に渡せる・持ち物を圧迫する。**
 * **数だけを持つ。**
 *
 * ## 読み書きはここだけ
 *
 * **鍵の名前は `state/keys.ts`。** 呼ぶ側は鍵を知らない。
 */

import type { Player } from "@minecraft/server";

import { clampLevel, type StatKey } from "../core/growth.js";
import { KEYS } from "./keys.js";

/** どの鍵にどの回数が入っているか */
const LEVEL_KEY: Readonly<Record<StatKey, string>> = {
  hp: KEYS.lvHp,
  speed: KEYS.lvSpeed,
  haste: KEYS.lvHaste,
  power: KEYS.lvPower,
};

function num(player: Player, key: string): number {
  try {
    const v = player.getDynamicProperty(key);
    return typeof v === "number" ? v : 0;
  } catch {
    return 0;
  }
}

/** その人の強化回数。**買っていなければ 0** */
export function levelOf(player: Player, key: StatKey): number {
  return clampLevel(key, num(player, LEVEL_KEY[key]));
}

/** 強化回数を置く。**上限は越えられない** */
export function setLevel(player: Player, key: StatKey, level: number): number {
  const lv = clampLevel(key, level);
  try {
    player.setDynamicProperty(LEVEL_KEY[key], lv);
  } catch {
    /* 消えている */
  }
  return lv;
}

/** 持っているエメラルド */
export function emeraldOf(player: Player): number {
  return Math.max(0, Math.floor(num(player, KEYS.emerald)));
}

/** エメラルドを置く。**負にはしない** */
export function setEmerald(player: Player, value: number): number {
  const v = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  try {
    player.setDynamicProperty(KEYS.emerald, v);
  } catch {
    /* 消えている */
  }
  return v;
}

/** 足す（負を渡せば引く）。**残りを返す** */
export function addEmerald(player: Player, delta: number): number {
  return setEmerald(player, emeraldOf(player) + delta);
}

/** 全部消す。**試合を始め直すとき** */
export function reset(player: Player): void {
  for (const key of Object.values(LEVEL_KEY)) {
    try {
      player.setDynamicProperty(key, 0);
    } catch {
      /* 消えている */
    }
  }
  setEmerald(player, 0);
}
