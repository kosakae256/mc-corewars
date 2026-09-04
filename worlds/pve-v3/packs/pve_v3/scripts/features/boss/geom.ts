/**
 * 向きとベクトル。**純粋に近い小物。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 6-6。
 */

import type { Entity, Vector3 } from "@minecraft/server";

/**
 * その向きを向くときのヨー（度）。
 *
 * **Minecraft のヨーは 0 が ＋z**（南）。前は `(-sin, 0, cos)`。
 */
export function yawOf(dx: number, dz: number): number {
  return (Math.atan2(-dx, dz) * 180) / Math.PI;
}

/** 角度の差を −180〜180 に収める */
export function wrap(deg: number): number {
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * その場所の方へ、**少しずつ**向き直す。
 *
 * > ### 押すだけでは、横を向いたまま寄ってくる
 * >
 * > **経路探索が効いていないときは、誰も向きを変えてくれない。**
 * > **毎 tick、上限つきで回す**——一気に向けると首振り人形になる。
 *
 * @param maxDeg 1 tick に回せる角度
 * @param dead **これ未満なら触らない**（バニラの向き付けと取り合わない）。
 *             **溜めの間は 0 にする**——そこで向きが決まるので、譲らない
 */
export function turnTo(boss: Entity, to: Vector3, maxDeg: number, dead = 4): void {
  try {
    const at = boss.location;
    const want = yawOf(to.x - at.x, to.z - at.z);
    const cur = boss.getRotation().y;
    const diff = wrap(want - cur);
    if (Math.abs(diff) < dead) return;
    const step = Math.max(-maxDeg, Math.min(maxDeg, diff));
    boss.setRotation({ x: 0, y: cur + step });
  } catch {
    /* 消えている */
  }
}

/** そこへ、すぐ向く */
export function faceAt(boss: Entity, to: Vector3): void {
  try {
    const at = boss.location;
    faceDir(boss, { x: to.x - at.x, y: 0, z: to.z - at.z });
  } catch {
    /* 消えている */
  }
}

/** その向きへ、すぐ向く（突進の最中） */
export function faceDir(boss: Entity, dir: Vector3): void {
  try {
    boss.setRotation({ x: 0, y: yawOf(dir.x, dir.z) });
  } catch {
    /* 消えている */
  }
}

/** 単位ベクトルにする */
export function unit(v: Vector3): Vector3 {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

/**
 * **止める。** 溜めの間に動かれると、予備動作にならない。
 *
 * > `applyImpulse` は足し算なので、**いまの速さの逆を少し足して**打ち消す。
 */
export function brake(boss: Entity): void {
  try {
    const v = boss.getVelocity();
    if (Math.hypot(v.x, v.z) < 0.02) return;
    boss.applyImpulse({ x: -v.x * 0.6, y: 0, z: -v.z * 0.6 });
  } catch {
    /* 消えている */
  }
}

/** 押す */
export function push(boss: Entity, v: Vector3): void {
  try {
    boss.applyImpulse(v);
  } catch {
    /* 消えている */
  }
}
