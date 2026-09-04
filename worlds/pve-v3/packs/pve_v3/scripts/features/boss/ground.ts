/**
 * 地上での動き。**地面を歩いて寄って、溜めてから出す。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 6-2・6-3。
 */

import type { Entity, Vector3 } from "@minecraft/server";

import { FLIGHT, pickAct, TURN } from "../../core/boss.js";
import { current, max as hpMax } from "../../state/hp.js";
import { aimOf, start } from "./act.js";
import { hasteOf, withHaste } from "./curse.js";
import { brake, flatDist, groundSpot, nearest, onGround, push, setAct, sound, turnTo, type Brain } from "./util.js";

/**
 * > ### この竜は歩いて寄らない（2026-09-05 決定）
 * >
 * > **距離を詰めたいときは「踏み込み」（突進）を出すか、飛ぶ。**
 * > だらだら歩かないぶん、**動くときは必ず溜めが見える。**
 * >
 * > 実体からも `minecraft:behavior.melee_box_attack` を外した——
 * > **経路探索で寄る係が居ない。**

/** HP の割合 */
function hpRatio(boss: Entity): number {
  const now = current(boss);
  const cap = hpMax(boss);
  if (now === undefined || cap === undefined || cap <= 0) return 1;
  return now / cap;
}

/**
 * 飛ぶか決める。
 *
 * | | |
 * | --- | --- |
 * | **HP の関門を切った** | **必ず飛ぶ**（読める合図） |
 * | 3 秒ごとの抽選 | 予測させない |
 * | 相手が遠い | 追うために飛ぶ |
 */
function wantsFly(boss: Entity, brain: Brain, dist: number, now: number): boolean {
  if (now - brain.since < FLIGHT.groundMin) return false;

  const ratio = hpRatio(boss);
  const gate = FLIGHT.hpGates[brain.gates];
  if (gate !== undefined && ratio <= gate) {
    brain.gates++;
    return true;
  }

  if (dist > FLIGHT.farTrigger) return true;

  if (now - brain.rolled >= FLIGHT.rollEvery) {
    brain.rolled = now;
    if (Math.random() < FLIGHT.rollChance) return true;
  }
  return false;
}

/** 離陸を始める */
export function takeoff(boss: Entity, brain: Brain, now: number): void {
  brain.phase = "takeoff";
  brain.since = now;
  brain.airActs = 0;
  setAct(boss, "takeoff");
  sound(boss, "mob.enderdragon.flap", 1.6, 0.9);
  try {
    boss.triggerEvent("pve_v3:takeoff");
  } catch {
    /* 定義が読み込まれていない */
  }
  push(boss, { x: 0, y: 1.15, z: 0 });
}

/** 地上の 1 tick */
export function step(boss: Entity, brain: Brain, now: number): void {
  // ---- 隙。**降りた直後は動かない**（6-5）
  //
  // > **何もしない時間にも動きを付ける。** 棒立ちだと「固まった」に見える
  if (now < brain.stun) {
    brake(boss);
    setAct(boss, "recover");
    return;
  }
  if (brain.stun > 0) {
    brain.stun = 0;
    setAct(boss, "none");
  }

  const target = nearest(boss);
  if (target === undefined) return;

  // **相手そのものではなく、相手の真下の地面**を見る（6-0 の 3）
  const spot = groundSpot(boss, target.location);
  const dist = flatDist(boss, spot);

  if (wantsFly(boss, brain, dist, now)) {
    takeoff(boss, brain, now);
    return;
  }

  turnTo(boss, spot, TURN.ground);

  // ---- **足が着くまでは、落ちるだけ**（6-0 の 3）
  //
  // > 押すと空中で止まり、**そのまま空を歩く。**
  // > **物理に任せる**——着いてから動く。
  if (!onGround(boss)) return;

  const def = pickAct(dist, false, (id) => (brain.cools.get(id) ?? 0) <= now);
  if (def === undefined) return;
  start(boss, brain, withHaste(def, hasteOf(boss)), now, aimOf(target));
}
