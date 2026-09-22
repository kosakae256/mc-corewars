/**
 * **弾の向きを扱う。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 6 章。
 *
 * > ### **`bullet.ts` から切り出した**（2026-09-08）
 * >
 * > **弾に重力と追尾を足したら、1 ファイルの上限（300 行）を超えた。**
 * > **向きの計算は弾の入れ物に依らない**ので、こちらへ移した。
 */

import { world, type Dimension, type Player, type Vector3 } from "@minecraft/server";

import { norm } from "../core/geometry.js";
import { insideWall, wallAlong } from "./wall.js";

/** **向きを持って動くもの。** 弾がこれを満たす */
export interface Moving {
  at: Vector3;
  /** いまの速さと向き（マス／tick） */
  vel: Vector3;
}

/** いまの向き（長さ 1）。**重力と追尾で変わる** */
export function headOf(b: Moving, fallback: Vector3): Vector3 {
  const v = b.vel;
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= 0) return fallback;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** **その tick に数えた人**（`playersOnly` の弾が使い回す） */
let peopleTick = -1;
let people: Player[] = [];

export function peopleNow(now: number): Player[] {
  if (peopleTick === now) return people;
  peopleTick = now;
  try {
    people = world.getAllPlayers();
  } catch {
    people = [];
  }
  return people;
}

/**
 * **いちばん近い人のほうへ、少しだけ向きを寄せる**（`25-enemy-kit.md` 6 章）。
 *
 * **速さは変えない。** **向きだけ混ぜる。**
 *
 * > ### **一気に向けない**
 * >
 * > **`rate` が 1 なら即座に向く**——**避けられない弾になる。**
 * > **0.1 ならゆるく曲がる**——**回り込めば振り切れる。**
 */
export function steer(b: Moving, rate: number, now: number, mark?: string): void {
  let best: Vector3 | undefined;
  let near = Infinity;
  for (const p of peopleNow(now)) {
    // > ### **決めた相手だけを追う**（`25-enemy-kit.md` 6-1-2）
    // >
    // > **居なくなったら、いちばん近い人へ戻る**（`best` が埋まらないので、下の輪が拾う）
    if (mark !== undefined && p.id === mark) {
      best = { x: p.location.x, y: p.location.y + 1, z: p.location.z };
      near = -1;
      break;
    }
    const q = p.location;
    const d = (q.x - b.at.x) ** 2 + (q.y - b.at.y) ** 2 + (q.z - b.at.z) ** 2;
    if (d >= near) continue;
    near = d;
    // **足元ではなく胸のあたりを狙う**
    best = { x: q.x, y: q.y + 1, z: q.z };
  }
  if (best === undefined) return;
  const dx = best.x - b.at.x;
  const dy = best.y - b.at.y;
  const dz = best.z - b.at.z;
  const len = Math.hypot(dx, dy, dz);
  if (len <= 0) return;
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  if (speed <= 0) return;
  const mixX = b.vel.x / speed + (dx / len) * rate;
  const mixY = b.vel.y / speed + (dy / len) * rate;
  const mixZ = b.vel.z / speed + (dz / len) * rate;
  const m = Math.hypot(mixX, mixY, mixZ);
  if (m <= 0) return;
  b.vel = { x: (mixX / m) * speed, y: (mixY / m) * speed, z: (mixZ / m) * speed };
}

/** **迂回のとき、何マス先まで見るか** */
const LOOK = 2.0;

/** **振ってみる向き**（上へどれだけ・横へどれだけ）。**上を先に試す** */
const TURNS: readonly (readonly [number, number])[] = [
  [0.6, 0],
  [0, 0.8],
  [0, -0.8],
  [0.6, 0.8],
  [0.6, -0.8],
  [1.4, 0],
  [0, 1.6],
  [0, -1.6],
];

/**
 * **塞がっていない向きを探す**（`throughWall` の弾・`25-enemy-kit.md` 6-1）。
 *
 * ```
 * まっすぐ通る？ ── 通る ── そのまま
 *        └ 通らない ── 上・左右へ順に振って、通る向きを使う
 *              └ どこも通らない ── そのまま進む（消えるよりは通り抜ける）
 * ```
 *
 * **飛竜の避け方と同じ考え**（`services/flight.ts` の `avoid`）——
 * **経路探索は使わない。** **目の前を触って、通る向きを選ぶだけ。**
 */
function around(dim: Dimension, from: Vector3, head: Vector3, step: number): Vector3 {
  const clear = (dir: Vector3): boolean => wallAlong(dim, from, dir, Math.max(step, LOOK)) === undefined;
  if (clear(head)) return head;
  // **横に振る向き**（進む向きと真上の外積）
  const side = norm({ x: -head.z, y: 0, z: head.x });
  for (const [up, across] of TURNS) {
    const dir = norm({
      x: head.x + side.x * across,
      y: head.y + up,
      z: head.z + side.z * across,
    });
    if (clear(dir)) return dir;
  }
  return head;
}

/**
 * **壁を無視する弾の、1 tick ぶんの向き直し**（`25-enemy-kit.md` 6-1）。
 *
 * ```
 * 壁の中に居る ── 少し上へ逃がす（消さない）
 * 進む先が塞がっている ── 通る向きへ振る
 * ```
 *
 * **速さは変えない。** **向きだけ置き直す。**
 */
export function throughWall(dim: Dimension, b: Moving, head: Vector3, step: number): Vector3 {
  if (insideWall(dim, b.at)) b.at = { x: b.at.x, y: b.at.y + 0.5, z: b.at.z };
  const dir = around(dim, b.at, head, step);
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  b.vel = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
  return dir;
}

/**
 * **狙う相手を 1 人だけ決める**（`lockOn`・`25-enemy-kit.md` 6-1-2）。
 *
 * > ### **いちばん近い人にしない**
 * >
 * > **毎 tick 近い人へ寄せると、人が動くたびに狙いが入れ替わる。**
 * > **弾は誰にも当たらず、群れの中心をうろつく。**
 *
 * @param skip **狙わない相手**（クリエイティブ・観戦・味方）
 * @returns その人の id。**誰も居なければ `undefined`**（近い人を追う形に戻る）
 */
export function lockOn(
  from: Vector3,
  now: number,
  range: number,
  skip: (e: Player) => boolean,
  roll: () => number = Math.random
): string | undefined {
  const found: Player[] = [];
  for (const p of peopleNow(now)) {
    if (skip(p)) continue;
    const q = p.location;
    if (Math.hypot(q.x - from.x, q.y - from.y, q.z - from.z) > range) continue;
    found.push(p);
  }
  if (found.length === 0) return undefined;
  return found[Math.min(found.length - 1, Math.floor(roll() * found.length))]?.id;
}
