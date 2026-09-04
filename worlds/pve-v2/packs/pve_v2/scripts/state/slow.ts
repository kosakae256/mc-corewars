/**
 * 鈍化。**実体が持つ。**
 *
 * 仕様は `docs/spec/12-element.md` 2-5。
 *
 * ## 2 つの値を、モブごとに持つ
 *
 * | | |
 * | --- | --- |
 * | **最大蓄積値** | **どこまで溜まるか**（既定 100） |
 * | **蓄積効果値** | **最大の効きに届く値**（既定 50） |
 *
 * ```
 * 溜まった量 ≦ 最大蓄積値
 * 鈍化度 D  ＝ 溜まった量 ÷ 蓄積効果値   （1.0 で頭打ち）
 * ```
 *
 * **最大蓄積値 100・蓄積効果値 50 なら、100 まで溜まるが、意味があるのは 50 まで。**
 * **溜めた余りは「抜けるまでの猶予」**になる。
 *
 * > ### 計算に使うのは**蓄積効果値**だけ
 * >
 * > **最大蓄積値は内部の天井**——「あと何秒効きが続くか」を決めるだけ。
 * > **札が「ゲージの◯％を配る」と書いたら、それは蓄積効果値の◯％。**
 *
 * ## 抜け方
 *
 * **4 tick ごとに、最大蓄積値の 1％** ずつ減る——**満タンから 20 秒で空。**
 *
 * **読むときに減衰を計算する**（毎 tick 全実体を回さない）。
 */

import type { Entity } from "@minecraft/server";

import { KEYS } from "./keys.js";

/** 既定の最大蓄積値・蓄積効果値 */
export const SLOW_CAP = 100;
export const SLOW_EFF = 50;

/** 抜ける速さ：**4 tick ごとに最大蓄積値の 1％** */
const DECAY_PER_TICK = 0.01 / 4;

function num(entity: Entity, key: string, fallback: number): number {
  try {
    const v = entity.getDynamicProperty(key);
    return typeof v === "number" && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

/** そのモブの上限を決める。**湧いた直後に 1 度だけ** */
export function setLimits(entity: Entity, cap: number, eff: number): void {
  try {
    entity.setDynamicProperty(KEYS.slowCap, cap);
    entity.setDynamicProperty(KEYS.slowEff, eff);
  } catch {
    /* 消えている */
  }
}

/** 最大蓄積値 */
export function cap(entity: Entity): number {
  return num(entity, KEYS.slowCap, SLOW_CAP);
}

/** 蓄積効果値。**ここまで溜めれば最大の効き** */
export function effect(entity: Entity): number {
  return num(entity, KEYS.slowEff, SLOW_EFF);
}

/** いま溜まっている量（減衰を効かせた後） */
export function stored(entity: Entity, now: number): number {
  let raw = 0;
  let at = 0;
  try {
    const v = entity.getDynamicProperty(KEYS.slow);
    const t = entity.getDynamicProperty(KEYS.slowAt);
    raw = typeof v === "number" ? v : 0;
    at = typeof t === "number" ? t : now;
  } catch {
    return 0;
  }
  if (raw <= 0) return 0;
  const lost = cap(entity) * DECAY_PER_TICK * Math.max(0, now - at);
  return Math.max(0, raw - lost);
}

/**
 * 鈍化度 D（0〜1）。**蓄積効果値で割る。**
 *
 * **式に掛けるのはこれ**——溜まった量そのものではない。
 */
export function ratio(entity: Entity, now: number): number {
  const eff = effect(entity);
  if (eff <= 0) return 0;
  return Math.max(0, Math.min(1, stored(entity, now) / eff));
}

/** 溜める。**最大蓄積値で頭打ち。** 返すのは足した後の D */
export function add(entity: Entity, amount: number, now: number): number {
  if (amount <= 0) return ratio(entity, now);
  const limit = cap(entity);
  const next = Math.min(limit, stored(entity, now) + amount);
  try {
    entity.setDynamicProperty(KEYS.slow, next);
    entity.setDynamicProperty(KEYS.slowAt, now);
  } catch {
    return 0;
  }
  const eff = effect(entity);
  return eff > 0 ? Math.max(0, Math.min(1, next / eff)) : 0;
}
