/**
 * 試合そのものの記録。**ワールドに持つ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md`。
 *
 * | 何 | なぜワールドか |
 * | --- | --- |
 * | **状態** | **1 つしかない。**人ごとに持つと必ず食い違う |
 * | **wave 番号** | 同上 |
 * | **敵グループ** | 同上 |
 * | **状態に入った時刻** | **砂時計**（休憩所 30 秒・リザルト 15 秒） |
 * | **一時停止の戻り先** | 止めた所へ返すため |
 */

import { world } from "@minecraft/server";

import { WORLD_NEXT, type WorldPhase } from "../core/state.js";
import { KEYS } from "./keys.js";

function num(key: string, fallback: number): number {
  try {
    const v = world.getDynamicProperty(key);
    return typeof v === "number" ? v : fallback;
  } catch {
    return fallback;
  }
}

function str(key: string): string | undefined {
  try {
    const v = world.getDynamicProperty(key);
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

function put(key: string, value: string | number): void {
  try {
    world.setDynamicProperty(key, value);
  } catch {
    /* 書けない */
  }
}

function isPhase(v: string | undefined): v is WorldPhase {
  return v !== undefined && v in WORLD_NEXT;
}

/** いまの状態。**記録が無ければ「非開始」** */
export function phase(): WorldPhase {
  const v = str(KEYS.phase);
  return isPhase(v) ? v : "idle";
}

/** 状態を書く。**遷移してよいかの判定は `services/match.ts`** */
export function setPhase(next: WorldPhase, at: number): void {
  put(KEYS.phase, next);
  put(KEYS.phaseAt, at);
}

/** その状態に入った時刻（tick） */
export function phaseAt(): number {
  return num(KEYS.phaseAt, 0);
}

/** いま何戦目か。**始まる前は 0** */
export function wave(): number {
  return num(KEYS.wave, 0);
}

export function setWave(value: number): void {
  put(KEYS.wave, Math.max(0, Math.floor(value)));
}

/** 選ばれている敵グループ */
export function legion(): string | undefined {
  const v = str(KEYS.legion);
  return v === undefined || v === "" ? undefined : v;
}

export function setLegion(id: string): void {
  put(KEYS.legion, id);
}

/** 一時停止から戻る先 */
export function resumeTo(): WorldPhase | undefined {
  const v = str(KEYS.resumeTo);
  return isPhase(v) ? v : undefined;
}

export function setResumeTo(value: WorldPhase | ""): void {
  put(KEYS.resumeTo, value);
}

/** 試合の記録を全部消す。**「ゲーム非開始」の入口で呼ぶ** */
export function clear(): void {
  setWave(0);
  put(KEYS.legion, "");
  setResumeTo("");
}
