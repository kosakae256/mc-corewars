/**
 * **飛ぶ敵の動きを、こちらで作る。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 11 章。
 *
 * ## なぜ自作するのか
 *
 * > ### **バニラの経路探索は地面のためのもの**（実測・2026-09-08）
 * >
 * > **`navigation.float` と `melee_box_attack` を両方持たせると、綱引きになる。**
 * > **経路は地面を這い、`can_fly` は浮かせようとする**——
 * > **少し浮いて、少し下がって、そのまま上へ上がり続ける。**
 * >
 * > **バニラのファントムは経路探索を 1 つも持っていない**（`movement.glide` だけ）。
 * > **飛ぶものは、飛ぶための動きを自分で持つ。**
 *
 * ## 作り
 *
 * ```
 * 狙う人が居る ── その人の少し上を目指す
 *   │              └ 目の前が壁なら、上へ逃がす
 *   └ 居ない ──── その場でゆっくり漂う
 * ```
 *
 * **毎 tick、速さを丸ごと置き直す**（`clearVelocity` ＋ `applyImpulse`）。
 * **足し算にすると、際限なく速くなる。**
 */

import { world, type Entity, type Player, type Vector3 } from "@minecraft/server";

import type { EnemyDef } from "../core/enemy.js";
import { WALK } from "../core/enemy.js";
import { hittable } from "./mobaim.js";
import { has } from "../state/hp.js";
import { insideWall } from "./wall.js";

/** 相手のどれだけ上を目指すか（マス） */
const HOVER = 1.6;

/** ここまで近づいたら、それ以上は寄らない（マス） */
const CLOSE = 1.2;

/** 速さの倍率。**`EnemyDef.speed` を、飛ぶ速さに読み替える** */
const SPEED = 1.35;

/** 目の前を何マス先まで見るか */
const LOOK = 1.6;

/** 壁を避けるとき、どれだけ上へ振るか */
const CLIMB = 0.8;

/** ふわふわの強さ（狙う人が居ないとき） */
const DRIFT = 0.06;

/** 長さ 1 に揃える */
function unit(v: Vector3): Vector3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** その敵が狙う人。**HP を持っている人のうち、いちばん近い** */
function prey(mob: Entity, people: readonly Player[], within: number): Player | undefined {
  let best: Player | undefined;
  let near = within;
  const at = mob.location;
  for (const p of people) {
    // **クリエイティブ・観戦は狙わない**
    if (!has(p) || !hittable(p)) continue;
    const q = p.location;
    const d = Math.hypot(q.x - at.x, q.y - at.y, q.z - at.z);
    if (d >= near) continue;
    near = d;
    best = p;
  }
  return best;
}

/**
 * **目の前が塞がっていたら、上へ振る。**
 *
 * **経路探索の代わり。** **壁に沿って登れば、たいていの地形は越えられる。**
 */
function avoid(mob: Entity, dir: Vector3): Vector3 {
  const at = mob.location;
  const ahead = { x: at.x + dir.x * LOOK, y: at.y + 0.5 + dir.y * LOOK, z: at.z + dir.z * LOOK };
  let blocked = false;
  try {
    blocked = insideWall(mob.dimension, ahead);
  } catch {
    blocked = false;
  }
  if (!blocked) return dir;
  return unit({ x: dir.x, y: dir.y + CLIMB, z: dir.z });
}

/** ゆっくり漂う。**狙う人が居ないとき** */
function drift(mob: Entity, now: number): void {
  const t = (now + mob.id.length * 7) * 0.03;
  try {
    mob.clearVelocity();
    mob.applyImpulse({ x: Math.cos(t) * DRIFT, y: Math.sin(t * 0.7) * DRIFT * 0.6, z: Math.sin(t) * DRIFT });
  } catch {
    /* 消えている */
  }
}

/**
 * 飛ぶ敵を 1 体進める。
 *
 * @param range どこまで人を探すか（マス）
 */
export function fly(mob: Entity, def: EnemyDef, people: readonly Player[], now: number, range: number): void {
  const target = prey(mob, people, range);
  if (target === undefined) {
    drift(mob, now);
    return;
  }
  const at = mob.location;
  const want = { x: target.location.x, y: target.location.y + HOVER, z: target.location.z };
  const gap = Math.hypot(want.x - at.x, want.y - at.y, want.z - at.z);
  // **近づきすぎたら止まる。** **押し込むと、相手の中でぶるぶる震える**
  if (gap <= CLOSE) {
    try {
      mob.clearVelocity();
    } catch {
      /* 消えている */
    }
    return;
  }
  const dir = avoid(mob, unit({ x: want.x - at.x, y: want.y - at.y, z: want.z - at.z }));
  const speed = def.speed * WALK * SPEED;
  try {
    // **足さずに置き直す。** 足し算だと際限なく速くなる
    mob.clearVelocity();
    mob.applyImpulse({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed });
  } catch {
    /* 消えている */
  }
}

/** その人たち。**1 tick に 1 度だけ数える** */
export function peopleFor(): Player[] {
  try {
    return world.getAllPlayers();
  } catch {
    return [];
  }
}
