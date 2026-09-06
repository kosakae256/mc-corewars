/**
 * **奈落に落ちた人を、湧く所へ戻す。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md` 3-5。
 *
 * ```
 * y ≤ -30 ──▶ 湧く所へ戻す ＋ いまの HP の 25% を削る
 *                              （HP 3 以下なら削らない）
 * ```
 *
 * > ### なぜ「いまの HP の割合」なのか
 * >
 * > **固定値だと、HP の低い人ほど致命的になる。**
 * > 割合なら**誰にとっても同じ重さ**で、**削り切ることもない。**
 *
 * **`services/presence.ts` に置かなかった理由**——
 * 削るのは `services/combat.ts` だが、**そちらが `presence.ts` を呼んでいる**。
 * 同じ所に書くと**行って戻る形**になる（`docs/imp.md` P-4）。
 */

import type { Player } from "@minecraft/server";

import { center, FACING } from "../core/places.js";
import { spawnSpot } from "./arena.js";
import * as match from "../state/match.js";
import { hit, hpOf } from "./combat.js";
import { members } from "./presence.js";

/** 落ちたと認める高さ。**戦場の底（y −50）より上** */
export const VOID_Y = -30;

/** 持って行かれる割合 */
export const VOID_CUT = 0.25;

/** **これ以下なら削らない。** 奈落で倒れることはない */
export const VOID_SAFE = 3;

/**
 * 落ちた 1 人を戻す。
 *
 * @returns **削った量**（削らなかったら 0）
 */
function rescue(player: Player): number {
  try {
    player.teleport(center(spawnSpot()), { rotation: { x: 0, y: FACING.field ?? 0 } });
  } catch {
    /* 消えている */
    return 0;
  }

  const hp = hpOf(player);
  if (hp === undefined || hp.now <= VOID_SAFE) return 0;
  const cut = Math.floor(hp.now * VOID_CUT);
  if (cut <= 0) return 0;
  hit({ target: player, attack: cut, via: "void" });
  return cut;
}

/** 毎周期。**戦っている間だけ見る** */
export function tick(): void {
  if (match.phase() !== "wave") return;
  for (const player of members()) {
    try {
      if (player.location.y > VOID_Y) continue;
    } catch {
      continue;
    }
    rescue(player);
  }
}
