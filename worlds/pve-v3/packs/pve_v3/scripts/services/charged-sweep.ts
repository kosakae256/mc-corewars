/** 静止・追尾する溜め→単発の扇形攻撃。sweep.windupを持つ敵の共通処理（spec/34）。 */
import type { Entity, Player, Vector3 } from "@minecraft/server";
import type { EnemyDef } from "../core/enemy.js";
import { advanceSweep, beginSweep, type SweepClock } from "../core/charged-sweep.js";
import { has } from "../state/hp.js";
import { chargeFlames, releaseFlames } from "./foxfire.js";
import { hittable } from "./mobaim.js";
import { powerOf } from "./melee.js";
import { sweep } from "./sweep.js";
import { nearest, swingOf } from "./traits.js";
import { rangedBusy, visibleTarget } from "./ranged-ai.js";

interface Cast {
  clock: SweepClock;
  readonly started: number;
  readonly anchor: Vector3;
  targetId: string;
  dir: Vector3;
  nextFx: number;
}

const casts = new Map<string, Cast>();
const initialized = new Set<string>();

/** BP側が歩行群を外す／戻す。移動速度属性や呪い倍率には触れない。 */
function pose(mob: Entity, phase: "none" | "charge" | "slash"): void {
  mob.triggerEvent(`pve_v3:pose_${phase}`);
}

/** 消滅・死亡・アンロード後に時計を持ち越さない。再発見時には姿勢も初期化する。 */
export function pruneChargedSweeps(mobs: readonly Entity[]): void {
  const alive = new Set(mobs.filter((e) => e.isValid && has(e)).map((e) => e.id));
  for (const id of initialized) {
    if (alive.has(id)) continue;
    initialized.delete(id);
    casts.delete(id);
  }
}

/** XZだけを固定して追尾。Yはその時点の値を使い、落下を止めない。 */
function faceWhileStill(mob: Entity, cast: Cast, target?: Player): void {
  if (target !== undefined) {
    const dx = target.location.x - cast.anchor.x;
    const dz = target.location.z - cast.anchor.z;
    const dy = target.location.y + 1 - (mob.location.y + 1.3);
    const length = Math.hypot(dx, dy, dz);
    if (length > 1e-6) cast.dir = { x: dx / length, y: dy / length, z: dz / length };
  }
  mob.teleport(
    { x: cast.anchor.x, y: mob.location.y, z: cast.anchor.z },
    {
      rotation: {
        x: (-Math.asin(Math.max(-1, Math.min(1, cast.dir.y))) * 180) / Math.PI,
        y: (Math.atan2(-cast.dir.x, cast.dir.z) * 180) / Math.PI,
      },
      keepVelocity: true,
    }
  );
}

/** 指定の開始距離で溜め、立体の円錐内の同じ人へ一度だけ当てる。 */
export function doChargedSweep(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  const w = def.sweep;
  if (w?.windup === undefined || !has(mob)) return;
  if (!initialized.has(mob.id)) {
    pose(mob, "none");
    initialized.add(mob.id);
  }
  const eligible = people.filter((p) => p.dimension.id === mob.dimension.id && has(p) && hittable(p));
  let cast = casts.get(mob.id);
  if (cast === undefined) {
    const target = visibleTarget(mob, eligible, def.reach);
    if (target === undefined) return;
    cast = {
      clock: beginSweep(now, w.windup, w.recover ?? 10, def.interval, swingOf(mob, def)),
      started: now,
      anchor: mob.location,
      targetId: target.id,
      dir: mob.getViewDirection(),
      nextFx: now,
    };
    pose(mob, "charge");
    rangedBusy(mob, true);
    casts.set(mob.id, cast);
  }
  // 発射後の向きは固定。溜め中だけ元の標的を追い、無効になったときだけ選び直す。
  if (cast.clock.phase === "charge") {
    const progress = (now - cast.started) / (cast.clock.until - cast.started);
    mob.setProperty("pve_v3:fox_charge", Math.min(100, Math.round(progress * 100)));
    const target = eligible.find((p) => p.id === cast.targetId) ?? nearest(mob, eligible, w.radius);
    if (target !== undefined) cast.targetId = target.id;
    faceWhileStill(mob, cast, target);
    if (now < cast.clock.until && now >= cast.nextFx && w.effect === "foxfire") {
      chargeFlames(mob, cast.dir, (now - cast.started) % 12 === 0);
      cast.nextFx = now + 6;
    }
  } else {
    faceWhileStill(mob, cast);
  }
  const next = advanceSweep(cast.clock, now);
  cast.clock = next.clock;
  if (next.fire) {
    pose(mob, "slash");
    if (w.effect === "foxfire") releaseFlames(mob, cast.dir, w.radius, w.angle);
    sweep(
      {
        dim: mob.dimension,
        at: { ...mob.location, y: mob.location.y + 1.3 },
        dir: cast.dir,
        power: powerOf(mob) || def.attack,
        radius: w.radius,
        angle: w.angle,
        hits: 1,
        knock: def.knockback,
        shape: "cone",
        targetHeight: 1,
        igniteSeconds: w.igniteSeconds,
        cover: true,
        showParticles: w.effect !== "foxfire",
      },
      mob
    );
  }
  if (cast.clock.phase === "ready") {
    pose(mob, "none");
    casts.delete(mob.id);
    rangedBusy(mob, false);
  }
}
