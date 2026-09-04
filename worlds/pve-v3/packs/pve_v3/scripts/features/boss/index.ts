/**
 * ボスの飛竜。**動きは実体、判断はここ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md`。
 *
 * ```
 * 地上 ──飛ぶ条件──▶ 離陸 ──▶ 空（旋回・ブレス・突進） ──▶ 着地 ──▶ 地上
 * ```
 *
 * | 分けたもの | |
 * | --- | --- |
 * | `core/boss.ts` | **表**（間合い・威力・当たる瞬間・飛行の決まり） |
 * | `util.ts` | 向き・距離・当てる・記憶 |
 * | `act.ts` | 攻撃を始めて、当たる瞬間に当てる |
 * | `ground.ts` | 寄る・殴る・飛ぶか決める |
 * | `air.ts` | 上がる・旋回・突進・降りる |
 * | `bullet.ts` | 火の玉（実体にしない） |
 */

import type { Entity } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { FLIGHT } from "../../core/boss.js";
import { hasteOf, ticks } from "./curse.js";
import { has, setup } from "../../state/hp.js";
import { setLabel } from "../../state/label.js";
import { step as stepAct } from "./act.js";
import * as air from "./air.js";
import * as bullet from "./bullet.js";
import * as ground from "./ground.js";
import { commands } from "./command.js";
import { bosses, BOSS_HP, brainOf, forgetExcept, isFlying, LABEL, onGround, push, setAct, type Brain } from "./util.js";

export { WYVERN, BOSS_HP, BOSS_CURSE, LABEL, bosses } from "./util.js";

/**
 * **見た目（`pve_v3:fly`）と中身（`phase`）を合わせる。**
 *
 * > ### ずれると「落ちながら歩く」
 * >
 * > 動きの切り替えは `pve_v3:fly` を見ている。
 * > **空に居るのに false**なら歩きの動きが出るし、
 * > **地上なのに true** なら翼を振り続ける。
 */
function syncFly(boss: Entity, brain: Brain): void {
  const want = brain.phase === "air" || brain.phase === "takeoff";
  if (isFlying(boss) === want) return;
  try {
    boss.triggerEvent(want ? "pve_v3:takeoff" : "pve_v3:land");
  } catch {
    /* 定義が読み込まれていない */
  }
}

/** 1 体ぶん進める */
function step(boss: Entity, now: number): void {
  if (!has(boss)) {
    setup(boss, BOSS_HP);
    setLabel(boss, LABEL);
  }
  const brain = brainOf(boss.id, now);
  syncFly(boss, brain);

  // ---- 攻撃の途中なら、それを進めるだけ
  //
  // > ### 動きは一度に 1 つだけ
  // >
  // > 攻撃の最中に着地へ移すと、**着地の動きを出しながら火を吐く。**
  // > **攻撃が終わってから**、次の状態を見る。
  if (stepAct(boss, brain, now)) return;
  if (brain.phase === "air") air.checkGrounded(boss, brain, now);

  // ---- とびかかりの後は、**必ず降りる**（6-5）
  if (brain.forceLand === true) {
    brain.forceLand = false;
    if (brain.phase === "air") {
      air.land(boss, brain, now);
      return;
    }
  }

  switch (brain.phase) {
    case "takeoff":
      // **翼を打って上がる。** 終わったら空へ
      if (now - brain.since < ticks(FLIGHT.takeoff, hasteOf(boss))) {
        return;
      }
      brain.phase = "air";
      brain.since = now;
      setAct(boss, "none");
      return;

    case "air":
      air.step(boss, brain, now);
      return;

    case "land":
      // **足が着いた瞬間に出す。** 秒数で待つと、降り立った数秒後に衝撃が出る
      if (!onGround(boss) && now - brain.since < FLIGHT.landMax) {
        // **着くまで押し下げる。** 空中で止まったまま待たない
        push(boss, { x: 0, y: -0.28, z: 0 });
        return;
      }
      air.impact(boss);
      brain.phase = "ground";
      brain.since = now;
      // **降りた直後は隙**（6-5）。ここを殴らせる
      brain.stun = now + ticks(FLIGHT.recover, hasteOf(boss));
      brain.gates = Math.max(brain.gates, 0);
      setAct(boss, "none");
      return;

    default:
      ground.step(boss, brain, now);
  }
}

function tick(now: number): void {
  // **弾は飛竜が死んでも飛び続ける**ので、先に進める
  bullet.step();
  const alive = bosses();
  for (const boss of alive) {
    try {
      step(boss, now);
    } catch (err) {
      console.warn(`[boss] ${String(err)}`);
    }
  }
  // **居なくなった飛竜の記憶を落とす**（10 秒ごと）
  if (now % 200 === 0) forgetExcept(new Set(alive.map((e) => e.id)));
}

export const boss: Feature = {
  name: "boss",
  commands,
  tick: { every: 1, run: tick },
};
