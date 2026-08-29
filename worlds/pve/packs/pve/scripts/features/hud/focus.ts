/**
 * いま狙っている敵。
 *
 * 仕様は `docs/spec/15-hud.md` 2 章。
 *
 * **名札は全員に同じものが見える。**
 * **「見ている人ごとに変える」ことは名札ではできない**ので、
 * **狙っている 1 体だけはアクションバーに出す**——そこは本人だけのもの。
 */

import type { Entity, Player } from "@minecraft/server";

import { has } from "../../state/hp.js";

/** 見る距離（マス） */
const RANGE = 24;

/** 外れてからも残す長さ（tick）。**1 秒**（少し外れただけで消えるとちらつく） */
const KEEP = 20;

/** 最後に狙っていたもの。**メモリだけ** */
const last = new Map<string, { entity: Entity; until: number }>();

/**
 * 視線の先に居るモブ。**無ければ、直前のものを 1 秒だけ返す。**
 */
export function focusOf(player: Player, now: number): Entity | undefined {
  let found: Entity | undefined;
  try {
    for (const h of player.getEntitiesFromViewDirection({ maxDistance: RANGE })) {
      const e = h.entity;
      if (e.id === player.id) continue;
      if (!has(e)) continue;
      found = e;
      break;
    }
  } catch {
    /* 見られない */
  }

  if (found !== undefined) {
    last.set(player.id, { entity: found, until: now + KEEP });
    return found;
  }

  const kept = last.get(player.id);
  if (kept === undefined) return undefined;
  if (now >= kept.until) {
    last.delete(player.id);
    return undefined;
  }
  try {
    // **消えた相手は出さない**
    return has(kept.entity) ? kept.entity : undefined;
  } catch {
    last.delete(player.id);
    return undefined;
  }
}
