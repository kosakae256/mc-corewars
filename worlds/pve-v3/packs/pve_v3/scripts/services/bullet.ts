/**
 * 飛んでいる弾。**味方の矢も、敵の矢も、ここを通る。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 10-2。
 *
 * ```
 * 撃つ ──▶ 弾を 1 つ作る
 *            └ 毎 tick、速さのぶんの「区間」を進む
 *                 ├ その区間に相手が居れば、いちばん手前に当たる
 *                 ├ 壁が手前にあれば、そこで消える
 *                 └ どちらも無ければ、軌跡の粒を置いて進む
 * ```
 *
 * ## 点ではなく区間で見る
 *
 * **速い弾は 1 tick に 4 マス進む。** **点で当たり判定をすると隙間を抜ける。**
 * **線分と相手の距離**で見る（`distanceAlong`）。
 *
 * ## 重力は無い
 *
 * **落ちない。まっすぐ飛ぶ。** **味方も敵も同じ**（`24-mob-howto.md` 10-2）。
 */

import {
  MolangVariableMap,
  system,
  world,
  type Dimension,
  type Entity,
  type Player,
  type Vector3,
} from "@minecraft/server";

import { distanceAlong, pointAt } from "../core/geometry.js";
import { tellOps } from "./tell.js";
import { fitTo } from "./hitbox.js";
import type { BulletSpec } from "./bullet-spec.js";
import { headOf, lockOn, peopleNow, steer, throughWall, type Moving } from "./steer.js";
import { insideWall, wallAlong } from "./wall.js";
import { BULLET_SPRITE_TICKS, bulletSpriteLife } from "../core/bullet-sprite.js";

/** 壁を触って探すときの刻み（マス）。**細かいほど面に近づく** */
/** 粒を置く間隔（マス）。**空けすぎると点線に見える** */
const TRAIL_GAP = 0.7;

export type { BulletSpec } from "./bullet-spec.js";

interface Bullet {
  readonly spec: BulletSpec;
  at: Vector3;
  /**
   * **いまの速さと向き**（マス／tick）。
   *
   * > ### **向きは途中で変わる**（2026-09-08）
   * >
   * > **重力で下を向き、追尾で相手のほうを向く。**
   * > **`spec.dir` は撃った瞬間の向き**なので、進むときはこちらを見る。
   */
  vel: Vector3;
  flown: number;
  /** 撃たれた時刻（tick）。**`spec.life` を数えるのに要る** */
  readonly born: number;
  /** **追う相手**（player の id）。**`spec.lockOn` を書いた弾だけ** */
  readonly mark?: string;
  readonly hitIds: Set<string>;
  /** 見た目の実体。**連れていれば** */
  body?: Entity;
  nextSprite: number;
}

const bullets: Bullet[] = [];

/** 1 発撃つ */
export function fire(spec: BulletSpec): void {
  const b: Bullet = {
    spec,
    at: spec.from,
    vel: { x: spec.dir.x * spec.speed, y: spec.dir.y * spec.speed, z: spec.dir.z * spec.speed },
    flown: 0,
    born: system.currentTick,
    // **撃った瞬間に、狙う相手を 1 人決める**（`25-enemy-kit.md` 6-1-2）
    mark:
      spec.lockOn === undefined ? undefined : lockOn(spec.from, system.currentTick, spec.lockOn, (p) => spec.skip(p)),
    hitIds: new Set<string>(),
    nextSprite: 0,
  };
  if (spec.body !== undefined) {
    try {
      b.body = spec.dim.spawnEntity(spec.body, spec.from);
      face(b, spec.from);
    } catch (err) {
      // **見た目が出せなくても、弾は飛ばす。** ただし黙って消えない
      tellOps(`弾: ${spec.body} を出せなかった — ${String(err)}`);
    }
  }
  bullets.push(b);
}

/** 見た目を、その点へ運んで、進む先を向かせる */
function face(b: Bullet, at: Vector3): void {
  const body = b.body;
  if (body === undefined) return;
  try {
    body.teleport(at, { facingLocation: pointAt(at, headOf(b, b.spec.dir), 2) });
  } catch {
    b.body = undefined;
  }
}

/** 弾を捨てる。**見た目も一緒に消す** */
function drop(index: number, b: Bullet): void {
  try {
    b.body?.remove();
  } catch {
    /* もう居ない */
  }
  bullets.splice(index, 1);
}

/** 飛んでいる弾の数。**確かめる用** */
export function bulletCount(): number {
  return bullets.length;
}

/** 通った跡に粒を置く */
function drawTrail(b: Bullet, from: Vector3, length: number): void {
  const trail = b.spec.trail;
  if (trail === undefined) return;
  for (let d = 0; d < length; d += b.spec.gap ?? TRAIL_GAP) {
    try {
      b.spec.dim.spawnParticle(trail, pointAt(from, headOf(b, b.spec.dir), d));
    } catch {
      /* 読み込まれていない */
    }
  }
}

/** クライアントで次の4tickだけ移動する一粒。命中後は更新せず自然に消える。 */
function drawSprite(b: Bullet, now: number): void {
  const sprite = b.spec.sprite;
  if (sprite === undefined || now < b.nextSprite) return;
  b.nextSprite = now + BULLET_SPRITE_TICKS;
  const life = bulletSpriteLife(Math.hypot(b.vel.x, b.vel.y, b.vel.z), b.spec.range - b.flown);
  if (life <= 0) return;
  const variables = new MolangVariableMap();
  variables.setFloat("bullet_life", life);
  for (const axis of ["x", "y", "z"] as const) variables.setFloat(`bullet_v${axis}`, b.vel[axis] * 20);
  try {
    b.spec.dim.spawnParticle(sprite, b.at, variables);
  } catch {
    /* 範囲外・未ロード時も当たり判定は進める。 */
  }
}

/** この区間で、いちばん手前に当たる相手 */
function firstTarget(
  b: Bullet,
  from: Vector3,
  step: number,
  now: number
): { readonly e: Entity; readonly at: number } | undefined {
  const s = b.spec;
  const head = headOf(b, b.spec.dir);
  let target: Entity | undefined;
  let hitAt = step + 1;
  try {
    const near: Iterable<Entity> =
      s.playersOnly === true
        ? peopleNow(now)
        : s.dim.getEntities({ location: from, maxDistance: step + s.shape.fat + 2 });
    for (const e of near) {
      if (b.hitIds.has(e.id) || s.skip(e)) continue;
      const t = distanceAlong(from, head, step, e.location, fitTo(e, s.shape));
      if (t === undefined || t >= hitAt) continue;
      target = e;
      hitAt = t;
    }
  } catch {
    /* 読み込まれていない */
  }
  return target === undefined ? undefined : { e: target, at: hitAt };
}

/**
 * 飛んでいる弾を進める。**毎 tick。**
 *
 * **1 回の区間で当たるのは 1 体。**
 */
export function stepBullets(now: number): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b === undefined) continue;
    const s = b.spec;

    // **壁の中に居たら、そこで終わり**（貫通して飛んでいくのを防ぐ）
    if (s.throughWall !== true && insideWall(s.dim, b.at)) {
      end(i, b, b.at, now);
      continue;
    }

    // ---- **曲げてから進む**（`25-enemy-kit.md` 6 章）
    if (s.homing !== undefined && s.homing > 0) steer(b, s.homing, now, b.mark);

    let head = headOf(b, b.spec.dir);
    // **寿命で消える弾は、距離を見ない**（`25-enemy-kit.md` 6-1-1）
    const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    const step = s.life === undefined ? Math.min(speed, s.range - b.flown) : speed;
    if (s.throughWall === true) head = throughWall(s.dim, b, head, step);
    const from = b.at;
    const found = firstTarget(b, from, step, now);

    // ---- 壁のほうが手前なら消える
    const wall = s.throughWall === true ? undefined : wallAlong(s.dim, from, head, step);
    if (wall !== undefined && (found === undefined || wall < found.at)) {
      drawTrail(b, from, wall);
      const at = pointAt(from, head, wall);
      face(b, at);
      end(i, b, at, now);
      continue;
    }

    if (found !== undefined) {
      drawTrail(b, from, found.at);
      b.hitIds.add(found.e.id);
      // **矢が止まった点**
      s.onHit(found.e, b.flown + found.at, pointAt(from, head, found.at), now);
      drop(i, b);
      continue;
    }

    // ---- 何も無ければ進む
    drawSprite(b, now);
    drawTrail(b, from, step);
    b.at = pointAt(from, head, step);
    b.flown += step;
    // ---- **落ちる**（山なりの投擲。`25-enemy-kit.md` 3 章）
    if (s.gravity !== undefined && s.gravity > 0) b.vel = { ...b.vel, y: b.vel.y - s.gravity };
    face(b, b.at);
    if (s.life === undefined ? b.flown >= s.range : now - b.born >= s.life) end(i, b, b.at, now);
  }
}

/**
 * **誰にも当たらずに終わった。**
 *
 * **爆発する弾は、ここで爆発する**（`onEnd`）。
 */
function end(index: number, b: Bullet, at: Vector3, now: number): void {
  drop(index, b);
  try {
    b.spec.onEnd?.(at, now);
  } catch {
    /* 呼び先で落ちても、弾の処理は続ける */
  }
}
