/**
 * **散弾。** **間合いを取ったまま、前方へまとめて撒く。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 7 章。
 *
 * > ### **`traits.ts` から切り出した**（2026-09-08）
 * >
 * > **1 ファイル 300 行という決まりがある。**
 */

import { type Entity, type Player, type Vector3 } from "@minecraft/server";

import type { EnemyDef } from "../core/enemy.js";
import { powerOf } from "./melee.js";
import { startSwing } from "./swing.js";
import { sweep } from "./sweep.js";
import { faceAt, ready, swingOf, told, toward } from "./traits.js";
import { fire } from "./bullet.js";
import { hit } from "./combat.js";
import { hittable } from "./mobaim.js";
import { pointAt } from "../core/geometry.js";
import { visibleTarget } from "./ranged-ai.js";
import { aimGun } from "./gun-aim.js";

/** 銃口の前へ出す距離（マス） */
const MUZZLE = 0.6;

/** 右手のぶん、横へずらす距離（マス） */
const HAND = 0.28;

/**
 * 散弾。**間合いを取ったまま、前方へ撒く。**
 *
 * > ### **弾は飛ばさない**（`25-enemy-kit.md` 7 章）
 * >
 * > **50 発を 1 発ずつ飛ばすと重い。** **当たりはその場で決めて、見た目だけ出す。**
 */
export function doRangedSweep(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  const w = def.sweep;
  if (w === undefined) return;
  const target = visibleTarget(mob, people, w.radius);
  if (def.id === "shotgun") aimGun(mob, target);
  if (target === undefined) return;
  if (!ready(mob, swingOf(mob, def), now)) return;
  told("散弾", mob);
  startSwing(mob);
  // **撃つ前に相手を向く**（`25-enemy-kit.md` 7-2）
  faceAt(mob, target);
  const at = mob.location;
  try {
    mob.dimension.playSound("random.explode", at, { volume: 0.6, pitch: 1.8 });
  } catch {
    /* 読み込まれていない */
  }
  const aim = toward(mob, target);
  // > ### **銃口から出す**（2026-09-09）
  // >
  // > **胸の真ん中から出すと、銃を構えているのに体から湧いて見える。**
  // > **向いた先へ少し前、右手のぶんだけ右**（`right` は向きを 90 度回したもの）。
  const from = {
    x: at.x + aim.x * MUZZLE + aim.z * HAND,
    y: at.y + 1.25,
    z: at.z + aim.z * MUZZLE - aim.x * HAND,
  };
  // > ### **狙いは銃口から引き直す**（**踏んだ**・2026-09-09）
  // >
  // > **体の真ん中から向きを取り、銃口から撃っていた。**
  // > **ずらしたぶんだけ狙いが外れる**——**近いほどひどい。**
  const q = target.location;
  const to = { x: q.x - from.x, y: q.y + 1 - from.y, z: q.z - from.z };
  const len = Math.hypot(to.x, to.y, to.z) || 1;
  const dir = { x: to.x / len, y: to.y / len, z: to.z / len };
  const power = powerOf(mob) || def.attack;
  // **実体のある弾を、本当に飛ばす**（`core/trait-shot.ts` の `buck`）
  const b = def.buck;
  if (b !== undefined) {
    for (let i = 0; i < b.count; i++) fireOne(mob, b, from, dir, power, def.knockback);
    return;
  }
  sweep(
    {
      dim: mob.dimension,
      at: from,
      dir,
      power,
      radius: w.radius,
      angle: w.angle,
      hits: w.hits,
      knock: def.knockback,
      particle: "pve_v3:foe_fire",
    },
    mob
  );
}

/** 散らす角（度 → 弧度）。**その角の中へ、まっすぐな向きをずらす** */
function scatter(dir: Vector3, deg: number): Vector3 {
  const r = (): number => ((Math.random() * 2 - 1) * deg * Math.PI) / 360;
  const len = Math.hypot(dir.x, dir.z) || 1;
  const yaw = Math.atan2(dir.z, dir.x) + r();
  const pitch = Math.atan2(dir.y, len) + r() * 0.6;
  const flat = Math.cos(pitch);
  return { x: Math.cos(yaw) * flat, y: Math.sin(pitch), z: Math.sin(yaw) * flat };
}

/** 1 発。**当たった人にだけ効く** */
function fireOne(
  mob: Entity,
  b: NonNullable<EnemyDef["buck"]>,
  from: Vector3,
  dir: Vector3,
  power: number,
  knock: number | undefined
): void {
  fire({
    dim: mob.dimension,
    from,
    dir: scatter(dir, b.spread),
    speed: b.speed,
    range: b.range,
    shape: { fat: b.fat ?? 0.5, marks: [0.9, 1.6] },
    body: b.body,
    // **実体を連れるので、跡は出さない**
    trail: undefined,
    playersOnly: true,
    skip: (e) => !hittable(e),
    onHit: (target, _flown, point) => {
      hit({ target, attack: power, source: pointAt(point, dir, -3), knockPower: knock });
    },
  });
}
