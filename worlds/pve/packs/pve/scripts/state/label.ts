/**
 * 実体の表示名。
 *
 * 仕様は `docs/spec/15-hud.md` 3 章。
 *
 * ## なぜ状態として持つのか
 *
 * 名札を出す側（`features/hud`）が**モブの一覧を知る必要が無くなる。**
 * **湧かせた側が名前を書き、出す側は読むだけ**——
 * モブが増えても、表示側は 1 行も変わらない（`docs/imp.md` 10-4）。
 */

import type { Entity } from "@minecraft/server";

import { KEYS } from "./keys.js";

/** 名前を付ける。**湧かせた直後に 1 度** */
export function setLabel(entity: Entity, label: string): void {
  try {
    entity.setDynamicProperty(KEYS.label, label);
  } catch {
    /* 消えている */
  }
}

/** 名前。**無ければ undefined** */
export function labelOf(entity: Entity): string | undefined {
  try {
    const v = entity.getDynamicProperty(KEYS.label);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}
