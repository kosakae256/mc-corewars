/**
 * **支援役**（恵み・鼓舞）。**攻撃せず、味方を強くする。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 9 章。
 *
 * > ### **`traits.ts` から切り出した**（2026-09-08）
 * >
 * > **1 ファイル 300 行という決まりがある。**
 */

import { type Entity, type Player } from "@minecraft/server";

import type { EnemyDef } from "../core/enemy.js";
import { healAura, rouseAura } from "./aura.js";

/** 恵み・鼓舞。**攻撃しない代わりに、味方を強くする** */
export function doAura(
  mob: Entity,
  def: EnemyDef,
  foes: readonly Entity[],
  people: readonly Player[],
  now: number
): void {
  const a = def.aura;
  if (a === undefined) return;
  // > ### **輪は実体に付いている**（2026-09-09 に script から移した）
  // >
  // > **`spawnParticle` で置くと、その場に残って実体が置いていく。**
  // > **`emitter_local_space.position: true` の粒を見た目の定義に付ければ、
  // > 歩いても一緒に動く**（`25-enemy-kit.md` 9-1）。
  if (a.healPct !== undefined) healAura(mob, foes, a.healPct, a.radius);
  if (a.atkMult !== undefined) rouseAura(mob, foes, a.atkMult, a.atkTicks ?? 100, now, a.radius);
}
