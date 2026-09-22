/**
 * ノックバックの軽減を、その実体に持たせる。
 *
 * 仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 4 章。
 *
 * > ### **受け手が持つ**
 * >
 * > **モーション強化で減らす**のも、**そういう性質のモブ**も、同じ 1 本で表す。
 * > **0 ＝ そのまま押される。1 ＝ ほぼ押されない**（上限は `core/knockback.ts`）。
 */

import type { Entity } from "@minecraft/server";

import { KEYS } from "./keys.js";

/** その実体の軽減（0〜1）。**持っていなければ 0** */
export function resistOf(entity: Entity): number {
  try {
    const v = entity.getDynamicProperty(KEYS.kbResist);
    return typeof v === "number" && v > 0 ? Math.min(1, v) : 0;
  } catch {
    return 0;
  }
}

/** 軽減を置く。**0 で元通り** */
export function setResist(entity: Entity, value: number): void {
  try {
    entity.setDynamicProperty(KEYS.kbResist, Math.min(1, Math.max(0, value)));
  } catch {
    /* 消えている */
  }
}
