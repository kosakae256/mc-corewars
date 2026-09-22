/**
 * **敵の弾の「狙い」。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 10 章。
 *
 * **`services/mobshot.ts` から切り出した**（2026-09-09）——**1 ファイル 300 行の上限に収めるため。**
 * **中身は変えていない。**
 */

import { GameMode, Player, world, type Entity, type Vector3 } from "@minecraft/server";

import type { EnemyDef } from "../core/enemy.js";
import { norm } from "../core/geometry.js";
import { arcOf } from "./lob.js";
import { LOB } from "../core/tuning.js";
import { current } from "../state/hp.js";

/**
 * **狙いのばらつき**（2026-09-08 追加）。
 *
 * > ### **少しだけ散らす**
 * >
 * > **まっすぐ過ぎると、機械が撃っているように見える。**
 * > **0.03 ＝ およそ 1.7 度。** **15 マス先で 0.45 マスほどずれる。**
 * > **上下は半分**——**地面や空へ大きく外さないため。**
 * >
 * > **バニラの矢の `uncertainty_base`（16）は使わない**——**散りすぎる。**
 */
const SPREAD = 0.03;

/** 当てられる相手か。**プレイヤーだけ。見ているだけの人は当たらない** */
export function hittable(e: Entity): boolean {
  if (!(e instanceof Player)) return false;
  try {
    const mode = e.getGameMode();
    return mode !== GameMode.Creative && mode !== GameMode.Spectator;
  } catch {
    return false;
  }
}

/**
 * 飛ぶ向き。
 *
 * > ### **狙う人へまっすぐ向ける**（2026-09-08 に変えた）
 * >
 * > **前は種の速さを引き継いでいた。** **バニラが乗せた向きは、**
 * > **大きい実体ほど上や斜めを向く**——**ガストの火の玉が斜め上へ出ていた。**
 * >
 * > **狙う人が居れば、胸へまっすぐ。** **居なければ本人の向き。**
 */
export function aimOf(arrow: Entity, mob: Entity, from: Vector3): Vector3 {
  const target = nearestTo(from, mob.dimension.id);
  if (target !== undefined) {
    return norm({ x: target.x - from.x, y: target.y - from.y, z: target.z - from.z });
  }
  try {
    const v = arrow.getVelocity();
    if (Math.hypot(v.x, v.y, v.z) > 0.01) return norm(v);
  } catch {
    /* 消えている */
  }
  return norm(mob.getViewDirection());
}

/** いちばん近い人の胸 */
function nearestTo(from: Vector3, dimension: string): Vector3 | undefined {
  let best: Vector3 | undefined;
  let near = Infinity;
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== dimension || (current(p) ?? 0) <= 0 || !hittable(p)) continue;
    const q = p.location;
    const d = (q.x - from.x) ** 2 + (q.y - from.y) ** 2 + (q.z - from.z) ** 2;
    if (d >= near) continue;
    near = d;
    best = { x: q.x, y: q.y + 1.2, z: q.z };
  }
  return best;
}

/** 狙いを少しだけ散らす */
export function scatter(dir: Vector3, spread = SPREAD): Vector3 {
  const r = (): number => (Math.random() * 2 - 1) * spread;
  return norm({ x: dir.x + r(), y: dir.y + r() * 0.5, z: dir.z + r() });
}

/**
 * **いちばん近い人へ、山なりに届く初速を出す。**
 *
 * **届く距離と、着弾までの時間から逆算する**（`services/lob.ts` の `arcOf`）。
 * **狙う人が居なければ `undefined`**——**そのときはまっすぐ飛ぶ。**
 */
export function arcTo(mob: Entity, def: EnemyDef, from: Vector3): { dir: Vector3; speed: number } | undefined {
  const l = def.lob;
  if (l === undefined) return undefined;
  let best: Vector3 | undefined;
  let near = (def.reach || l.range) * 1.5;
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== mob.dimension.id || (current(p) ?? 0) <= 0 || !hittable(p)) continue;
    const q = p.location;
    const d = Math.hypot(q.x - from.x, q.y - from.y, q.z - from.z);
    if (d >= near) continue;
    near = d;
    best = { x: q.x, y: q.y + 1, z: q.z };
  }
  if (best === undefined) return undefined;
  return arcOf(from, best, l.flight, LOB.gravity);
}

/**
 * **狙う向き。** **散らばりまで込み。**
 *
 * **`EnemyDef.spread` は度数**（書かなければ既定の約 1.7 度）。
 */
export function aimFor(arrow: Entity, mob: Entity, from: Vector3, def: EnemyDef | undefined): Vector3 {
  return scatter(aimOf(arrow, mob, from), def?.spread === undefined ? SPREAD : def.spread / 57.3);
}
