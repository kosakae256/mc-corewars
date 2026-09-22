/**
 * **飛ぶ敵の高さを、帯の中に保つ。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 11 章。
 *
 * > ### **バニラの飛行は高さを選ばない**（実測・2026-09-08）
 * >
 * > **`float_wander` は上下 7 マスの範囲で適当に点を選ぶだけ。**
 * > **ガストは上へ上へと行き、弓でしか届かなくなった。**
 *
 * ```
 * 狙う人から見た高さ
 *   ├ 帯より上 ── そっと下げる
 *   ├ 帯の中   ── 何もしない（バニラの動きに任せる）
 *   └ 帯より下 ── そっと上げる
 * ```
 *
 * **横には触らない。** **`melee_box_attack` や `ranged_attack` の経路を壊さない。**
 */

import { type Entity, type Player } from "@minecraft/server";

import { insideWall } from "./wall.js";
import { groundHoverVelocity } from "../core/hover-height.js";

/** 足元の衝突面を使う低空飛行。標的不在でも上へ飛び去らない。 */
function aboveGround(mob: Entity, band: { readonly min: number; readonly max: number }): void {
  try {
    const at = mob.location;
    const floor = mob.dimension.getBlockFromRay(
      { x: at.x, y: at.y + 0.1, z: at.z },
      { x: 0, y: -1, z: 0 },
      { maxDistance: 64, includeLiquidBlocks: true, includePassableBlocks: false }
    );
    const height = floor === undefined ? undefined : at.y - floor.block.location.y - floor.faceLocation.y;
    const want = groundHoverVelocity(height, band.min, band.max);
    // 現在の上下速度を差し引く。押し続けて上昇・下降が加速するのを防ぐ。
    const delta = Math.max(-0.24, Math.min(0.24, want - mob.getVelocity().y));
    mob.applyImpulse({ x: 0, y: delta, z: 0 });
  } catch {
    /* 消滅・未ロード時は次回の高度確認に任せる。 */
  }
}

/** 押し戻す強さ（マス／tick） */
const PUSH = 0.08;

/** 帯からどれだけ外れたら効かせるか（マス） */
const SLACK = 0.5;

/** いちばん近い人 */
function prey(mob: Entity, people: readonly Player[], within: number): Player | undefined {
  let best: Player | undefined;
  let near = within;
  const at = mob.location;
  for (const p of people) {
    const q = p.location;
    const d = Math.hypot(q.x - at.x, q.z - at.z);
    if (d >= near) continue;
    near = d;
    best = p;
  }
  return best;
}

/** そこは塊の中か */
function stuck(mob: Entity): boolean {
  try {
    const at = mob.location;
    return insideWall(mob.dimension, { x: at.x, y: at.y + 0.5, z: at.z });
  } catch {
    return false;
  }
}

/** 埋まっているときに押し出す強さ */
const DIG = 0.22;

/** その人のほうへ押す */
function push(mob: Entity, target: Player, power: number): void {
  const a = mob.location;
  const b = target.location;
  const dx = b.x - a.x;
  const dy = b.y + 1 - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len <= 0) return;
  try {
    mob.clearVelocity();
    mob.applyImpulse({ x: (dx / len) * power, y: (dy / len) * power, z: (dz / len) * power });
  } catch {
    /* 消えている */
  }
}

/**
 * 高さを合わせる。
 *
 * @param band 狙う人から見た高さの帯（マス）
 * @param range 人を探す横の距離（マス）
 */
export function hover(
  mob: Entity,
  people: readonly Player[],
  band: { readonly min: number; readonly max: number; readonly ground?: boolean },
  range: number
): void {
  if (band.ground === true) {
    aboveGround(mob, band);
    return;
  }
  // > ### **壁に埋まったら、外へ押し出す**（実測・2026-09-08）
  // >
  // > **壁を抜ける敵**（`ghost`）**は、壁の中で止まることがある。**
  // > **`navigation.hover` は「壁の中に居る」を想定していない**——経路が引けない。
  // > **埋まっていたら、狙う人のほうへ強く押す。**
  const target = prey(mob, people, range);
  if (target === undefined) return;
  if (stuck(mob)) {
    push(mob, target, DIG);
    return;
  }
  const up = mob.location.y - target.location.y;
  const want = up > band.max + SLACK ? -PUSH : up < band.min - SLACK ? PUSH : 0;
  if (want === 0) return;
  try {
    // **上下だけ足す。** 横はバニラの経路探索のまま
    mob.applyImpulse({ x: 0, y: want, z: 0 });
  } catch {
    /* 消えている */
  }
}
