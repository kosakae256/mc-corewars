/** 共通の索敵距離と遠距離の状態判断（spec/38）。 */
import type { EnemyDef } from "./enemy.js";

export const ENEMY_SEARCH = 100;
export function rangedReach(def: EnemyDef): number | undefined {
  if (def.beam !== undefined) return def.beam.range;
  if (def.sweep?.atRange === true) return def.sweep.radius;
  if (def.lob !== undefined) return def.lob.range;
  if (def.orbit !== undefined) return def.orbit.range;
  return def.kind === "shoot" ? def.reach : undefined;
}

export function rangedMode(
  distance: number | undefined,
  range: number,
  clear: boolean,
  busy: boolean
): "seek" | "hold" {
  return busy || distance === undefined || (distance <= range && clear) ? "hold" : "seek";
}
