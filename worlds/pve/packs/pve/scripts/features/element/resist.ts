/**
 * 属性耐性の一覧。**「効きにくさ」ではなく「満ちるまでの量」。**
 *
 * 仕様は `docs/spec/17-element.md` 2 章。
 *
 * ```
 * 耐性 50 → 蓄積 50 で最大の効果
 * ```
 *
 * **ダメージは 1 も減らない。** 減るのは「満ちる速さ」だけ。
 *
 * ## 一覧と処理を分ける
 *
 * `docs/spec/11-structure.md` 2-1。**モブを足す人はここに 1 行**書く。
 */

import type { Entity } from "@minecraft/server";

import type { Element } from "../../lib/element.js";

/** 書いていないモブの耐性 */
const DEFAULT = 50;

/** モブごとの耐性（`docs/spec/17-element.md` 2-1） */
const TABLE: Readonly<Record<string, Readonly<Partial<Record<Element, number>>>>> = {
  // **グラントは全属性 50。** 弓の 1 発でほぼ満ちる＝「当てれば効く」
  "pve:grunt": { water: 50, thunder: 50, fire: 50, wind: 50, ice: 50 },
};

/** その相手の、その属性の耐性 */
export function resistOf(entity: Entity, element: Element): number {
  let id: string;
  try {
    id = entity.typeId;
  } catch {
    return DEFAULT;
  }
  return TABLE[id]?.[element] ?? DEFAULT;
}
