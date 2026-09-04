/**
 * 攻撃を出す。**溜め → 本体**。地上でも空中でも同じ流れ。
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 6-0・6-2・6-5。
 *
 * ```
 * 溜め（windup）        本体（length）
 * ├─ 動かない          ├─ 突進なら押す
 * ├─ 狙いを合わせる     ├─ hitAt の tick で当てる
 * └─ 当たらない        ├─ shoot の tick で弾を吐く
 *                      └─ finish の tick で見た目を差し替える
 * ```
 *
 * > ### 狙いは、溜めを始めた瞬間で固定する
 * >
 * > **ずっと追尾すると、避けても当たる。**
 * > `brain.aim` に覚えて、以降は相手を見ない。
 */

import type { Entity, Player, Vector3 } from "@minecraft/server";

import { inRange, RUSH, TURN, type ActDef } from "../../core/boss.js";
import { hit } from "../../services/combat.js";
import { fire } from "./bullet.js";
import { hasteOf } from "./curse.js";
import {
  angleTo,
  brake,
  distTo,
  faceAt,
  faceDir,
  groundY,
  wrap,
  yawOf,
  push,
  setAct,
  sound,
  knockFrom,
  turnTo,
  unit,
  victims,
  type Brain,
} from "./util.js";

/** 当てる（突進以外）。**当たったら必ず弾く** */
function applyHit(boss: Entity, def: ActDef): void {
  for (const p of victims(boss, def.reach + 2)) {
    if (!inRange(def, distTo(boss, p), angleTo(boss, p))) continue;
    hit({ target: p, attack: def.damage, via: `wyvern:${def.id}` });
    knockFrom(p, boss.location, def.knock);
  }
}

/** 溜めの見せ場。**唸る・沈む・首を上げる** */
function windupSound(boss: Entity, def: ActDef): void {
  if (def.id === "fireball" || def.id === "fireball_air") sound(boss, "mob.enderdragon.growl", 1.0, 1.4);
  else if (def.id === "spin") sound(boss, "mob.irongolem.throw", 1.0, 0.8);
  else sound(boss, "mob.enderdragon.growl", 1.2, 0.7);
}

/**
 * 攻撃を始める。**ここではまだ溜めだけ。**
 *
 * @param aimAt **狙う場所。** 溜めを始めた瞬間の相手（以降は動かさない）
 */
export function start(boss: Entity, brain: Brain, def: ActDef, now: number, aimAt: Vector3): void {
  const side: "l" | "r" | undefined = def.rush?.kind === "strafe" ? (Math.random() < 0.5 ? "l" : "r") : undefined;
  // **まだ溜めではない。** 先に向き直る（`aimed` が立ってから溜めが始まる）
  brain.act = { def, from: now, next: 0, fired: false, aimed: false, side };
  brain.aim = { x: aimAt.x, y: aimAt.y, z: aimAt.z };
  brain.rush = undefined;
  brain.cools.set(def.id, now + TURN.aimMax + def.windup + def.length + def.cool);
}

/** 溜めに入る。**向きが合ってから** */
function beginWindup(boss: Entity, brain: Brain, def: ActDef, now: number): void {
  const job = brain.act;
  if (job === undefined) return;
  job.aimed = true;
  job.from = now;
  setAct(boss, job.side === undefined ? def.act : job.side === "l" ? "strafe_l" : "strafe_r");
  windupSound(boss, def);
}

/** 本体に入る瞬間。**突進なら、ここで進む線を決める** */
function beginBody(boss: Entity, brain: Brain, def: ActDef, now: number): void {
  const aim = brain.aim;
  if (aim === undefined) return;
  // **どの攻撃も、本体に入る瞬間に狙いの方を向く**（6-6）
  faceAt(boss, aim);
  if (def.rush === undefined) return;
  const at = boss.location;
  let to: Vector3 = { x: aim.x - at.x, y: aim.y + 1 - at.y, z: aim.z - at.z };

  if (def.rush.kind === "strafe") {
    // **相手そのものではなく、脇を通る線。** そして**地面まで降りる**
    //
    // > ### とびかかりは、**必ず地面に着いて終わる**
    // >
    // > 空中で止まると、**そのまま次の攻撃に移れてしまう。**
    // > **降りた所で隙をさらす**のが、この技の引き換え。
    const n = Math.hypot(to.x, to.z) || 1;
    const sign = brain.act?.side === "l" ? 1 : -1;
    const px = (-to.z / n) * RUSH.strafeOffset * sign;
    const pz = (to.x / n) * RUSH.strafeOffset * sign;
    const floor = groundY(boss, aim.x, aim.z, aim.y);
    to = { x: to.x * 1.6 + px, y: floor - at.y - RUSH.diveDrop, z: to.z * 1.6 + pz };
  } else {
    // **地上の突進。** 上下には動かない（6-0 の 3）
    to = { x: to.x, y: 0, z: to.z };
  }

  const dir = unit(to);
  brain.rush = {
    kind: def.rush.kind,
    dir,
    power: def.rush.power,
    until: now + def.rush.until,
    done: new Set<string>(),
  };
  // **動き出したら向きは固定**（6-6）
  faceDir(boss, dir);
  sound(boss, "mob.enderdragon.flap", 1.4, 0.9);
}

/**
 * 突進の途中で、段差を乗り越える。
 *
 * > ### `applyImpulse` で動かすと、実体の自動段差が効かない
 * >
 * > `minecraft:variable_max_auto_step` は**経路探索で歩くとき**の話。
 * > **押して進む突進は、ブロックにそのままぶつかる。**
 * >
 * > **前を見て、2 マスまでなら自分で跳ぶ。**
 * > 3 マス以上は壁として扱い、登らない。
 */
function climb(boss: Entity, dir: Vector3): void {
  try {
    const at = boss.location;
    const ax = Math.floor(at.x + dir.x * 1.8);
    const az = Math.floor(at.z + dir.z * 1.8);
    const base = Math.floor(at.y);
    let rise = 0;
    for (let dy = 0; dy <= 2; dy++) {
      const b = boss.dimension.getBlock({ x: ax, y: base + dy, z: az });
      if (b !== undefined && !b.isAir && !b.isLiquid) rise = dy + 1;
    }
    if (rise === 0 || rise > 2) return;
    // **登った先が空いているか。** 塞がっていれば壁
    const over = boss.dimension.getBlock({ x: ax, y: base + rise, z: az });
    if (over !== undefined && !over.isAir && !over.isLiquid) return;
    const v = boss.getVelocity();
    if (v.y > 0.2) return;
    push(boss, { x: 0, y: rise === 1 ? 0.44 : 0.64, z: 0 });
  } catch {
    /* 読み込まれていない */
  }
}

/** 突進の途中。**押して、触れた人に当てる** */
function stepRush(boss: Entity, brain: Brain, def: ActDef, now: number): void {
  const rush = brain.rush;
  if (rush === undefined || def.rush === undefined) return;
  if (now <= rush.until) {
    // **段差は自分で跳ぶ**（実体の自動段差は押し出しに効かない）
    if (rush.kind === "line") climb(boss, rush.dir);
    try {
      const v = boss.getVelocity();
      // **速すぎたら押さない**（積み上がって飛んでいく）
      if (Math.hypot(v.x, v.y, v.z) < rush.power) {
        push(boss, {
          x: rush.dir.x * rush.power * 0.5,
          y: rush.dir.y * rush.power * 0.5,
          z: rush.dir.z * rush.power * 0.5,
        });
      }
    } catch {
      /* 消えている */
    }
  }
  // ---- 触れた人に当てる。**1 回の突進で 1 人 1 回**
  for (const p of victims(boss, def.rush.touchReach + 2)) {
    if (rush.done.has(p.id)) continue;
    if (distTo(boss, p) > def.rush.touchReach) continue;
    rush.done.add(p.id);
    hit({ target: p, attack: def.rush.touch, via: `wyvern:${def.id}` });
    // **触れた人だけを弾く。** 周りごと弾くと、当たっていない人まで飛ぶ
    knockFrom(p, boss.location, def.rush.knock, 0.5);
  }
}

/** 弾を吐く。**溜めで覚えた向きへ** */
function shoot(boss: Entity, brain: Brain, def: ActDef): void {
  const aim = brain.aim;
  if (aim === undefined) return;
  try {
    const at = boss.location;
    // **口の位置。** 首を上げているので少し高い
    const from = { x: at.x, y: at.y + 4.2, z: at.z };
    const dir = { x: aim.x - from.x, y: aim.y + 1 - from.y, z: aim.z - from.z };
    fire(boss.dimension, from, dir, def.damage, hasteOf(boss));
  } catch {
    /* 消えている */
  }
}

/**
 * 攻撃を 1 tick 進める。
 *
 * @returns **まだ続いているか**
 */
export function step(boss: Entity, brain: Brain, now: number): boolean {
  const job = brain.act;
  if (job === undefined) return false;
  const def = job.def;
  const aim = brain.aim;

  // ---- 向き直し。**ここが済むまで溜めに入らない**
  //
  // > ### 向きが合う前に溜めを始めると、変な角度へ撃つ
  // >
  // > **狙いを覚える → 向き直る → 溜め → 本体**の順。
  if (!job.aimed) {
    brake(boss);
    if (aim === undefined) {
      beginWindup(boss, brain, def, now);
      return true;
    }
    turnTo(boss, aim, TURN.windup, 0);
    const off = Math.abs(wrap(yawOf(aim.x - boss.location.x, aim.z - boss.location.z) - boss.getRotation().y));
    if (off <= TURN.aimed || now - job.from >= TURN.aimMax) beginWindup(boss, brain, def, now);
    return true;
  }

  const bodyFrom = job.from + def.windup;

  // ---- 溜め。**動かず、狙いだけ合わせる**
  if (now < bodyFrom) {
    brake(boss);
    // **溜めの間に向きを決める。** ここは譲らない（`dead` を 0 に）
    if (brain.aim !== undefined) turnTo(boss, brain.aim, TURN.windup, 0);
    return true;
  }
  if (now === bodyFrom) beginBody(boss, brain, def, now);

  const t = now - bodyFrom;

  if (def.rush !== undefined) {
    stepRush(boss, brain, def, now);
  }
  if (def.shoot !== undefined && !job.fired && t >= def.shoot) {
    job.fired = true;
    shoot(boss, brain, def);
  }
  while (job.next < def.hitAt.length && (def.hitAt[job.next] ?? 1e9) <= t) {
    applyHit(boss, def);
    job.next++;
  }
  if (def.finish !== undefined && t === def.finish.at) {
    setAct(boss, def.finish.act);
  }

  if (t < def.length) return true;
  // **とびかかりは着地で終わる**（6-5）
  if (def.rush?.kind === "strafe") brain.forceLand = true;
  brain.act = undefined;
  brain.rush = undefined;
  brain.aim = undefined;
  setAct(boss, "none");
  return false;
}

/** 相手を狙う場所（足元） */
export function aimOf(target: Player): Vector3 {
  const at = target.location;
  return { x: at.x, y: at.y, z: at.z };
}
