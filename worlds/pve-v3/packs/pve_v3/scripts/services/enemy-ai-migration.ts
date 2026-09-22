/** 既存個体の旧値を一度だけ移行する（spec/38）。 */
import type { Entity } from "@minecraft/server";
import { MOVE_TOP, WALK, type EnemyDef } from "../core/enemy.js";
import { hasteTier } from "../core/haste.js";
import { KEYS } from "../state/keys.js";

export function migrateEnemyAi(mob: Entity, def: EnemyDef): void {
  const saved = mob.getDynamicProperty(KEYS.enemyAiRevision);
  const revision = typeof saved === "number" ? saved : 0;
  if (revision >= 3) return;
  if (revision < 1) migrateFirst(mob, def);
  if (revision < 2) migrateSecond(mob, def);
  if (def.id === "blinker") {
    const old = mob.getDynamicProperty(KEYS.atk);
    mob.setDynamicProperty(KEYS.atk, typeof old === "number" && old > 0 ? old / 2 : def.attack);
  }
  mob.setDynamicProperty(KEYS.enemyAiRevision, 3);
}

function migrateSecond(mob: Entity, def: EnemyDef): void {
  if (def.id === "charged") {
    const old = mob.getDynamicProperty(KEYS.swing);
    const gap = typeof old === "number" && old > 0 ? (old * 20) / 72000 : def.interval;
    mob.triggerEvent(`pve_v3:set_haste_${hasteTier(def.interval / gap)}`);
    mob.setDynamicProperty(KEYS.swing, gap);
  }
  const factor = def.id === "vital" ? 0.7 : ["healer", "rouser"].includes(def.id) ? 2 : undefined;
  const movement = mob.getComponent("minecraft:movement");
  if (factor !== undefined && movement !== undefined) {
    movement.setCurrentValue(Math.min(def.speed * WALK * MOVE_TOP, movement.currentValue * factor));
  }
  if (def.id === "taint") mob.setDynamicProperty(KEYS.atk, def.attack);
  if (def.id === "chamber") mob.setDynamicProperty(KEYS.kbPower, def.knockback ?? 1);
  mob.setDynamicProperty(KEYS.enemyAiRevision, 2);
}

function migrateFirst(mob: Entity, def: EnemyDef): void {
  const movement = mob.getComponent("minecraft:movement");
  if (movement !== undefined) {
    if (["gunner", "chamber", "seeker"].includes(def.id) && movement.currentValue === 0) {
      movement.setCurrentValue(def.speed * WALK);
    } else if (def.id === "titan" && movement.currentValue !== movement.defaultValue) {
      movement.setCurrentValue(Math.min(def.speed * WALK * MOVE_TOP, movement.currentValue * 4));
    }
  }
  if (def.id === "seeker") {
    const old = mob.getDynamicProperty(KEYS.swing);
    const gap = typeof old === "number" && old > 0 ? old / 4 : def.interval;
    // 合図が失敗した場合は旧間隔を残す。再試行でさらに1/4になるのを防ぐ。
    mob.triggerEvent(`pve_v3:set_haste_${hasteTier(def.interval / gap)}`);
    mob.setDynamicProperty(KEYS.swing, gap);
  }
  mob.setDynamicProperty(KEYS.enemyAiRevision, 1);
}
