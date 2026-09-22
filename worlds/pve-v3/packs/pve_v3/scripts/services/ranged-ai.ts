/** 移動はBPの経路探索、射程と射線の判断は共通処理（spec/38）。 */
import type { Entity, Player, Vector3 } from "@minecraft/server";
import type { EnemyDef } from "../core/enemy.js";
import { ENEMY_SEARCH, rangedMode, rangedReach } from "../core/ranged-ai.js";
import { current } from "../state/hp.js";
import { hittable } from "./mobaim.js";
import { clearSight } from "./sight.js";

const modes = new Map<string, "seek" | "hold">();
const busy = new Set<string>();
const checked = new Map<string, number>();
const progress = new Map<string, { readonly at: number; readonly position: Vector3 }>();

/** 移動が進まない接近だけ再試行する。歩行中に経路を毎回破棄しない。 */
function retryApproach(mob: Entity, now: number): boolean {
  const last = progress.get(mob.id);
  const at = mob.location;
  if (last === undefined || Math.hypot(at.x - last.position.x, at.y - last.position.y, at.z - last.position.z) >= 0.5) {
    progress.set(mob.id, { at: now, position: { ...at } });
    return false;
  }
  if (now - last.at < 40) return false;
  progress.set(mob.id, { at: now, position: { ...at } });
  return true;
}

export function rangedTarget(mob: Entity, people: readonly Player[], range: number): Player | undefined {
  let target: Player | undefined;
  let near = range;
  for (const p of people) {
    if (p.dimension.id !== mob.dimension.id || (current(p) ?? 0) <= 0 || !hittable(p)) continue;
    const d = Math.hypot(p.location.x - mob.location.x, p.location.y - mob.location.y, p.location.z - mob.location.z);
    if (d > near) continue;
    near = d;
    target = p;
  }
  return target;
}

export function visibleTarget(mob: Entity, people: readonly Player[], range: number): Player | undefined {
  const target = rangedTarget(mob, people, range);
  if (target === undefined) return undefined;
  const from = { ...mob.location, y: mob.location.y + 1.3 };
  const to = { ...target.location, y: target.location.y + 1 };
  return clearSight(mob.dimension, from, to) ? target : undefined;
}

function change(mob: Entity, mode: "seek" | "hold", retry = false): void {
  if (modes.get(mob.id) === mode && !retry) return;
  mob.triggerEvent(`pve_v3:ranged_${mode}`);
  modes.set(mob.id, mode);
  if (mode === "hold") {
    progress.delete(mob.id);
    const velocity = mob.getVelocity();
    mob.clearVelocity();
    mob.applyImpulse({ x: 0, y: velocity.y, z: 0 });
  }
}

export function rangedBusy(mob: Entity, value: boolean): void {
  if (value) {
    busy.add(mob.id);
    change(mob, "hold");
  } else {
    busy.delete(mob.id);
    checked.delete(mob.id);
  }
}

export function updateRanged(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  const range = rangedReach(def);
  if (range === undefined || now < (checked.get(mob.id) ?? 0)) return;
  const target = rangedTarget(mob, people, ENEMY_SEARCH);
  const distance =
    target === undefined
      ? undefined
      : Math.hypot(
          target.location.x - mob.location.x,
          target.location.y - mob.location.y,
          target.location.z - mob.location.z
        );
  // **壁を無視する敵は、いつでも「射線あり」**（追尾弾・`25-enemy-kit.md` 6-1）——
  // **射線を作りに行く必要が無い**
  const clear =
    distance !== undefined &&
    distance <= range &&
    (def?.throughWall === true || visibleTarget(mob, people, range) !== undefined);
  // 射撃開始の間合いに入っても、移動しながら溜める敵は指定距離まで詰める。
  const approach = def.charge?.commit ? Math.min(range, def.charge.approach ?? range) : range;
  const mode = rangedMode(distance, approach, clear, busy.has(mob.id));
  change(mob, mode, mode === "seek" && retryApproach(mob, now));
  checked.set(mob.id, now + 10);
}

export function pruneRanged(mobs: readonly Entity[]): void {
  const alive = new Set(mobs.map((m) => m.id));
  for (const id of modes.keys())
    if (!alive.has(id)) {
      modes.delete(id);
      checked.delete(id);
      busy.delete(id);
      progress.delete(id);
    }
}
