/**
 * 空での動き。**上がって、旋回して、溜めてから撃つか突っ込む。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 6-4・6-5。
 */

import type { Entity, Player, Vector3 } from "@minecraft/server";

import { FLIGHT, pickAct, TURN } from "../../core/boss.js";
import { current, max as hpMax } from "../../state/hp.js";
import { aimOf, start } from "./act.js";
import { hasteOf, ticks, withHaste } from "./curse.js";
import { distTo, groundY, nearest, push, setAct, sound, splash, turnTo, unit, type Brain } from "./util.js";

/**
 * 目標の位置へ寄せる。**押す力は上限を付ける**（積み上がって飛んでいく）。
 */
function steer(boss: Entity, want: Vector3, power: number): void {
  try {
    const at = boss.location;

    // ---- **高さは、速さの上限に関わらず取り切る**
    //
    // > ### 上がりきらないと、飛行がすぐ終わる
    // >
    // > 横の速さで上限に掛かると、**上へ押す番が回ってこない。**
    // > **足りない高さは、別に押す。**
    const k = hasteOf(boss);
    const lack = want.y - at.y;
    if (lack > 1) push(boss, { x: 0, y: Math.min(FLIGHT.climb * k, lack * 0.06 * k), z: 0 });

    const d = { x: want.x - at.x, y: 0, z: want.z - at.z };
    const len = Math.hypot(d.x, d.z);
    if (len < 0.6) return;
    const dir = unit(d);
    const v = boss.getVelocity();
    if (Math.hypot(v.x, v.z) > power) return;
    push(boss, { x: dir.x * power * 0.4, y: 0, z: dir.z * power * 0.4 });
  } catch {
    /* 消えている */
  }
}

/** 旋回して居たい場所 */
function circleSpot(boss: Entity, target: Player, now: number): Vector3 {
  // **ゆっくり回る**。角度は時間から作る
  const a = (now / 40) % (Math.PI * 2);
  const at = boss.location;
  return {
    x: target.location.x + Math.cos(a) * FLIGHT.circle,
    y: groundY(boss, at.x, at.z, at.y) + FLIGHT.altitude,
    z: target.location.z + Math.sin(a) * FLIGHT.circle,
  };
}

function hpRatio(boss: Entity): number {
  const now = current(boss);
  const cap = hpMax(boss);
  if (now === undefined || cap === undefined || cap <= 0) return 1;
  return now / cap;
}

/** 着地を始める */
export function land(boss: Entity, brain: Brain, now: number): void {
  brain.phase = "land";
  brain.since = now;
  setAct(boss, "land");
  sound(boss, "mob.enderdragon.flap", 1.4, 0.7);
  try {
    boss.triggerEvent("pve_v3:land");
  } catch {
    /* 定義が読み込まれていない */
  }
  push(boss, { x: 0, y: -0.9, z: 0 });
}

/** 着地の衝撃 */
export function impact(boss: Entity): void {
  splash(boss, FLIGHT.landRadius, FLIGHT.landDamage, 1.4, "wyvern:land");
  sound(boss, "random.explode", 1.4, 0.7);
  try {
    const at = boss.location;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      boss.dimension.spawnParticle("minecraft:large_explosion", {
        x: at.x + Math.cos(a) * 3,
        y: at.y + 0.4,
        z: at.z + Math.sin(a) * 3,
      });
    }
  } catch {
    /* 見えない所 */
  }
}

/** 空の 1 tick */
export function step(boss: Entity, brain: Brain, now: number): void {
  const target = nearest(boss);
  if (target === undefined) {
    land(boss, brain, now);
    return;
  }

  // ---- 降りる条件。**上がりきるまでは降りない**
  const spent = now - brain.since;
  const settled = spent > ticks(FLIGHT.minAir, hasteOf(boss));
  if (spent > FLIGHT.maxAir || (settled && (brain.airActs >= FLIGHT.maxAirActs || hpRatio(boss) <= FLIGHT.landHp))) {
    land(boss, brain, now);
    return;
  }

  // ---- 相手を見て、旋回する場所へ寄る
  turnTo(boss, target.location, TURN.air);
  steer(boss, circleSpot(boss, target, now), 0.9 * hasteOf(boss));

  const def = pickAct(distTo(boss, target), true, (id) => (brain.cools.get(id) ?? 0) <= now);
  if (def === undefined) return;
  brain.airActs++;
  start(boss, brain, withHaste(def, hasteOf(boss)), now, aimOf(target));
}

/** 突進が終わった後に、地面に着いていたら降りたことにする */
export function checkGrounded(boss: Entity, brain: Brain, now: number): void {
  if (brain.phase !== "air") return;
  // **離陸した直後はまだ地面に触れている。** そこで降りたことにしない
  if (now - brain.since < ticks(FLIGHT.minAir, hasteOf(boss))) return;
  try {
    if (!boss.isOnGround) return;
  } catch {
    return;
  }
  land(boss, brain, now);
}
