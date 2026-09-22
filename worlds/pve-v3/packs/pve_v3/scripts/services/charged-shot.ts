/** 溜め開始で射撃を確定し、射程外へ逃げられても連射を完了する（spec/40）。 */
import type { Entity, Player, Vector3 } from "@minecraft/server";
import type { EnemyDef } from "../core/enemy.js";
import { norm } from "../core/geometry.js";
import { current } from "../state/hp.js";
import { hittable, scatter } from "./mobaim.js";
import { fireMobShot } from "./mobshot.js";
import { rangedBusy, visibleTarget } from "./ranged-ai.js";
import { swingOf } from "./traits.js";

interface Cast {
  readonly target: string;
  readonly gap: number;
  next: number;
  nextParticle: number;
  remaining: number;
  aim: Vector3;
}
const casts = new Map<string, Cast>();
const initialized = new Set<string>();

/** 死亡・消滅・アンロードした個体の連射を破棄する。 */
export function pruneChargedShots(mobs: readonly Entity[]): void {
  const alive = new Set(mobs.filter((m) => m.isValid && (current(m) ?? 0) > 0).map((m) => m.id));
  for (const id of initialized) {
    if (alive.has(id)) continue;
    initialized.delete(id);
    casts.delete(id);
  }
}

/** 開始射程だけを検査し、開始後は標的の距離で時計を取り消さない。 */
export function doChargedShot(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  const charge = def.charge;
  if (!charge?.commit) return;
  if (!initialized.has(mob.id)) {
    mob.triggerEvent("pve_v3:shot_done");
    rangedBusy(mob, false);
    initialized.add(mob.id);
  }
  if ((current(mob) ?? 0) <= 0) {
    casts.delete(mob.id);
    mob.triggerEvent("pve_v3:shot_done");
    rangedBusy(mob, false);
    return;
  }
  let cast = casts.get(mob.id);
  if (cast === undefined) {
    const target = visibleTarget(mob, people, def.reach);
    if (target === undefined) return;
    const ratio = swingOf(mob, def) / def.interval;
    cast = {
      target: target.id,
      gap: Math.max(2, Math.round((charge.burstGap ?? 0.3) * 20 * ratio)),
      next: now + Math.max(2, Math.round(charge.shoot * 20 * ratio)),
      nextParticle: now,
      remaining: charge.burst ?? 1,
      aim: { ...target.location, y: target.location.y + 1.2 },
    };
    casts.set(mob.id, cast);
    mob.triggerEvent("pve_v3:shot_charge");
    rangedBusy(mob, charge.approach === undefined);
  }
  const target = people.find(
    (p) => p.id === cast.target && p.dimension.id === mob.dimension.id && (current(p) ?? 0) > 0 && hittable(p)
  );
  if (target !== undefined) cast.aim = { ...target.location, y: target.location.y + 1.2 };
  const at = mob.location;
  if (charge.particle && cast.remaining === (charge.burst ?? 1) && now < cast.next && now >= cast.nextParticle) {
    cast.nextParticle = now + 4;
    try {
      mob.dimension.spawnParticle(charge.particle, at);
    } catch {
      /* 描画に失敗しても溜め・発射は進める。 */
    }
  }
  const dir = norm({ x: cast.aim.x - at.x, y: cast.aim.y - at.y - 1.2, z: cast.aim.z - at.z });
  // 溜め中の移動方向は経路探索に任せる。照準で回り込みの向きを上書きしない。
  if (now < cast.next) return;
  mob.setRotation({
    x: (-Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI,
    y: (Math.atan2(-dir.x, dir.z) * 180) / Math.PI,
  });
  // 接近しながら溜めた場合も、実際の3連射中だけは止まる。
  rangedBusy(mob, true);
  fireMobShot(mob, def, scatter(dir, (def.spread ?? 1.7) / 57.3));
  mob.dimension.playSound("mob.blaze.shoot", at);
  cast.remaining--;
  cast.next = now + cast.gap;
  if (cast.remaining > 0) return;
  casts.delete(mob.id);
  mob.triggerEvent("pve_v3:shot_done");
  rangedBusy(mob, false);
}
