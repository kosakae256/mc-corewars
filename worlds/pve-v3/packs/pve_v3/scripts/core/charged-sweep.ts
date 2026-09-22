/** 溜め攻撃の時計と扇形の算数。Minecraft APIを使わない（spec/34）。 */
import type { Point } from "./geometry.js";

export type SweepClock =
  | { readonly phase: "charge"; readonly until: number; readonly recovery: number }
  | { readonly phase: "release"; readonly until: number }
  | { readonly phase: "ready" };

/** 呪い適用後の攻撃間隔と同じ割合で、溜めと戻りを短縮する。 */
export function beginSweep(now: number, charge: number, recover: number, base: number, gap: number): SweepClock {
  const ratio = gap / base;
  return {
    phase: "charge",
    until: now + Math.max(2, Math.round(charge * ratio)),
    recovery: Math.max(2, Math.round(recover * ratio)),
  };
}

/** 発射はcharge→releaseの遷移時だけ。更新が遅れても過去分を連射しない。 */
export function advanceSweep(clock: SweepClock, now: number): { readonly clock: SweepClock; readonly fire: boolean } {
  if (clock.phase === "ready" || now < clock.until) return { clock, fire: false };
  if (clock.phase === "charge") {
    return { clock: { phase: "release", until: now + clock.recovery }, fire: true };
  }
  return { clock: { phase: "ready" }, fire: false };
}

/** 既存sweepと同じ球面距離・水平角。高さ制限は指定時だけ加える。 */
export function insideFan(
  at: Point,
  target: Point,
  dir: Point | undefined,
  radius: number,
  angle: number,
  height?: number
): boolean {
  const dx = target.x - at.x;
  const dy = target.y - at.y;
  const dz = target.z - at.z;
  if (Math.hypot(dx, dy, dz) > radius + 1e-9 || (height !== undefined && Math.abs(dy) > height)) return false;
  if (angle >= 360 || dir === undefined) return true;
  const flat = Math.hypot(dx, dz);
  if (flat <= 0) return true;
  const dot = (dx * dir.x + dz * dir.z) / (flat * Math.hypot(dir.x, dir.z) || 1);
  return dot + 1e-9 >= Math.cos(((angle / 2) * Math.PI) / 180);
}

/** 三次元の照準から直交基底を作る。真上・真下でも長さゼロにしない。 */
export function coneBasis(dir: Point): { readonly forward: Point; readonly right: Point; readonly up: Point } {
  const length = Math.hypot(dir.x, dir.y, dir.z);
  const forward = length > 1e-9 ? { x: dir.x / length, y: dir.y / length, z: dir.z / length } : { x: 0, y: 0, z: 1 };
  const flat = Math.hypot(forward.x, forward.z);
  const right = flat > 1e-9 ? { x: forward.z / flat, y: 0, z: -forward.x / flat } : { x: 1, y: 0, z: 0 };
  const up = {
    x: forward.y * right.z - forward.z * right.y,
    y: forward.z * right.x - forward.x * right.z,
    z: forward.x * right.y - forward.y * right.x,
  };
  return { forward, right, up };
}

/** 球面で切った円錐。上下左右すべて、照準軸から同じ半角で制限する。 */
export function insideCone(at: Point, target: Point, dir: Point, radius: number, angle: number): boolean {
  const dx = target.x - at.x;
  const dy = target.y - at.y;
  const dz = target.z - at.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance > radius + 1e-9) return false;
  if (distance <= 1e-9) return true;
  const { forward } = coneBasis(dir);
  return (dx * forward.x + dy * forward.y + dz * forward.z) / distance + 1e-9 >= Math.cos((angle * Math.PI) / 360);
}
