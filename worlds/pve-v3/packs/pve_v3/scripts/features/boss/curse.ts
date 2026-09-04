/**
 * 呪い。**この竜だけに掛かる「速さの倍率」。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 6-7。
 *
 * > ### 倍率 1 つで、全部を同じだけ速くする
 * >
 * > **攻撃速度**（溜め・本体・当たる瞬間・冷め）
 * > **移動速度**（突進の押し・飛行の押し・離着陸・隙）
 * > **弾の速さ**（進む速さ。**届く距離は変えない**）
 * > **見た目**（`anim_time_update` で全部の動きを早回し）
 * >
 * > **ばらばらに掛けると、当たる瞬間と絵がずれる。**
 */

import type { Entity } from "@minecraft/server";

import type { ActDef } from "../../core/boss.js";

/** その竜に掛かっている倍率。**既定は 1** */
export function hasteOf(boss: Entity): number {
  try {
    const v = boss.getProperty("pve_v3:haste");
    return typeof v === "number" && v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

/** 掛ける */
export function setHaste(boss: Entity, k: number): void {
  try {
    boss.setProperty("pve_v3:haste", Math.max(0.25, Math.min(4, k)));
  } catch {
    /* 定義が読み込まれていない */
  }
}

/** tick を縮める。**0 にはしない** */
export function ticks(v: number, k: number): number {
  return Math.max(1, Math.round(v / k));
}

/**
 * 攻撃 1 つを、その倍率に合わせた形にする。
 *
 * **長さは縮み、押す力は増える。** 威力と間合いは変えない。
 */
export function withHaste(def: ActDef, k: number): ActDef {
  if (k === 1) return def;
  return {
    ...def,
    windup: ticks(def.windup, k),
    length: ticks(def.length, k),
    hitAt: def.hitAt.map((t) => ticks(t, k)),
    cool: ticks(def.cool, k),
    shoot: def.shoot === undefined ? undefined : ticks(def.shoot, k),
    finish: def.finish === undefined ? undefined : { ...def.finish, at: ticks(def.finish.at, k) },
    rush:
      def.rush === undefined ? undefined : { ...def.rush, until: ticks(def.rush.until, k), power: def.rush.power * k },
  };
}
