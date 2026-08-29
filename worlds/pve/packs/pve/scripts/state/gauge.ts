/**
 * 属性の蓄積。**実体に溜まる。**
 *
 * 仕様は `docs/spec/17-element.md` 2 章。
 *
 * ```
 * 蓄積 ＝ その属性で与えたダメージの合計
 * 効き具合 ＝ clamp(蓄積 ÷ 属性耐性, 0, 1)
 * ```
 *
 * ## ここが state に居る理由
 *
 * **削る側（`features/damage`）も、属性側（`features/element`）も読む。**
 * どちらかの機能に置くと、**機能どうしが互いを呼ぶ形**になる
 *（`docs/imp.md` 10-4）。
 */

import type { Entity } from "@minecraft/server";

import { KEYS, gaugeKey, gaugePrefix } from "./keys.js";
import type { Element } from "../lib/element.js";

function num(entity: Entity, key: string): number {
  try {
    const v = entity.getDynamicProperty(key);
    return typeof v === "number" ? v : 0;
  } catch {
    return 0;
  }
}

function set(entity: Entity, key: string, value: number): void {
  try {
    entity.setDynamicProperty(key, value);
  } catch {
    /* 消えている */
  }
}

/**
 * いまの蓄積。
 *
 * **武器ごとに分かれている**（`docs/spec/17-element.md` 2-2）。
 * 弓の雷と、他の武器の雷は**別の入れ物。**
 */
export function gaugeOf(entity: Entity, weapon: string, element: Element): number {
  return num(entity, gaugeKey(weapon, element));
}

/** 蓄積を足す。**足した後の値** */
export function addGauge(entity: Entity, weapon: string, element: Element, amount: number, now: number): number {
  const next = Math.max(0, gaugeOf(entity, weapon, element) + Math.max(0, amount));
  set(entity, gaugeKey(weapon, element), next);
  set(entity, KEYS.gaugeAt, now);
  return next;
}

/** 蓄積を 0 に戻す。**氷が炸裂したとき**（`docs/spec/17-element.md` 3-2） */
export function clearGauge(entity: Entity, weapon: string, element: Element): void {
  set(entity, gaugeKey(weapon, element), 0);
}

/**
 * その属性の、**いちばん溜まっている武器の値**。
 *
 * 名札に出すのは 1 つだけ（`docs/spec/15-hud.md` 3-2）なので、
 * **どれか 1 つ——いちばん進んでいるもの**を見せる。
 */
export function bestGauge(entity: Entity, element: Element): number {
  let best = 0;
  try {
    for (const id of entity.getDynamicPropertyIds()) {
      if (!id.startsWith(gaugePrefix()) || !id.endsWith(`_${element}`)) continue;
      const v = entity.getDynamicProperty(id);
      if (typeof v === "number" && v > best) best = v;
    }
  } catch {
    return 0;
  }
  return best;
}

/**
 * 蓄積を落とす。
 *
 * **満タンから 0 まで 3 秒**（`docs/spec/17-element.md` 2-2）。
 * 落とす速さは**耐性に対する割合**なので、耐性が高いほどゆっくり落ちる。
 *
 * @param per 1 回の呼び出しで落とす量
 */
export function decayGauge(entity: Entity, weapon: string, element: Element, per: number): void {
  const now = gaugeOf(entity, weapon, element);
  if (now <= 0) return;
  set(entity, gaugeKey(weapon, element), Math.max(0, now - per));
}

/** 溜まっている入れ物（武器と属性の組）を数え上げる。**落とすときに回る** */
export function eachGauge(entity: Entity, run: (weapon: string, element: string, value: number) => void): void {
  try {
    for (const id of entity.getDynamicPropertyIds()) {
      if (!id.startsWith(gaugePrefix())) continue;
      const rest = id.slice(gaugePrefix().length);
      const cut = rest.lastIndexOf("_");
      if (cut <= 0) continue;
      const v = entity.getDynamicProperty(id);
      if (typeof v !== "number" || v <= 0) continue;
      run(rest.slice(0, cut), rest.slice(cut + 1), v);
    }
  } catch {
    /* 消えている */
  }
}
