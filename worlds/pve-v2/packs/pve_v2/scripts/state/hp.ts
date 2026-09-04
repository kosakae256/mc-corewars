/**
 * HP は自分たちで持つ。
 *
 * 仕様は `docs/01-rules.md` 2 章・3-5。
 *
 * ## なぜバニラの体力を使わないのか
 *
 * | バニラに任せると | |
 * | --- | --- |
 * | 無敵時間 | **多段ヒットが刻めない** |
 * | 防具・軽減 | **武器の数字が相手によって変わる** |
 * | 上限 20 前後 | **桁が足りない**（このゲームは 3 桁を扱う） |
 *
 * > **HP が防御力**（`docs/01-rules.md` 3-5）。
 * > 硬さは HP だけで表すので、**その HP をこちらが持っていないと始まらない。**
 *
 * ## 実体に紐づけて持つ
 *
 * 動的プロパティは**実体が消えれば一緒に消える。**
 * ウェーブごとに湧いて死ぬモブとは相性がよい。
 */

import type { Entity } from "@minecraft/server";

import { KEYS } from "./keys.js";

/** 読めなかったときの値。**0 にしない**（0 は「死んでいる」を意味する） */
const UNKNOWN = -1;

function num(entity: Entity, key: string): number {
  try {
    const v = entity.getDynamicProperty(key);
    return typeof v === "number" ? v : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/** HP を持たせる。**湧いた直後に 1 度だけ** */
export function setup(entity: Entity, max: number): void {
  try {
    entity.setDynamicProperty(KEYS.hpMax, max);
    entity.setDynamicProperty(KEYS.hp, max);
  } catch {
    /* 消えている */
  }
}

/**
 * **上限だけ**を入れ替える。**いまの HP は保つ**（上限を超えたぶんだけ詰める）。
 *
 * **`setup()` を呼び直すと満タンに戻ってしまう**——
 * 最大 HP の札（深水・円環）や、ショップでの買い増しはここを通す。
 */
export function setMax(entity: Entity, cap: number): void {
  const now = current(entity);
  try {
    entity.setDynamicProperty(KEYS.hpMax, cap);
    if (now !== undefined) entity.setDynamicProperty(KEYS.hp, Math.min(now, cap));
  } catch {
    /* 消えている */
  }
}

/** HP を持っているか */
export function has(entity: Entity): boolean {
  return num(entity, KEYS.hpMax) > 0;
}

/** いまの HP。**持っていなければ undefined** */
export function current(entity: Entity): number | undefined {
  const v = num(entity, KEYS.hp);
  return v === UNKNOWN ? undefined : v;
}

/** HP の上限。**持っていなければ undefined** */
export function max(entity: Entity): number | undefined {
  const v = num(entity, KEYS.hpMax);
  return v === UNKNOWN ? undefined : v;
}

/**
 * 削る。
 *
 * @returns 削ったあとの HP。**0 なら倒れた**（消すのは呼んだ側）
 */
export function damage(entity: Entity, amount: number): number {
  const now = current(entity);
  if (now === undefined) return UNKNOWN;
  const next = Math.max(0, now - Math.max(0, amount));
  try {
    entity.setDynamicProperty(KEYS.hp, next);
  } catch {
    return UNKNOWN;
  }
  return next;
}

/** 戻す。**上限は超えない** */
export function heal(entity: Entity, amount: number): number {
  const now = current(entity);
  const cap = max(entity);
  if (now === undefined || cap === undefined) return UNKNOWN;
  const next = Math.min(cap, now + Math.max(0, amount));
  try {
    entity.setDynamicProperty(KEYS.hp, next);
  } catch {
    return UNKNOWN;
  }
  return next;
}
