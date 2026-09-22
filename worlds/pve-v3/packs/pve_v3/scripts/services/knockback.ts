/**
 * **押す。ここ 1 本。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 4 章。決め方は `core/knockback.ts`。
 *
 * ```
 * 押す強さ ＝ その攻撃の強さ × (1 − 受け手の軽減)
 * ```
 *
 * > ### **飛竜も、雑魚も、弓も、全部ここを通る**（2026-09-08）
 * >
 * > 前は**飛竜だけ自前で押していた**（`features/boss/util.ts`）。
 * > **軽減を足すたびに、両方直す羽目になる。**
 * > **通り道が 1 本なら、直す場所も 1 つ。**
 *
 * > ### **上へは飛ばさない**
 * >
 * > **既定は 0。** **打ち上げる技を作るときだけ `up` を渡す。**
 */

import { Player, type Entity, type Vector3 } from "@minecraft/server";

import { KNOCK_UP, knockPower } from "../core/knockback.js";
import { resistOf } from "../state/knockback.js";

/** 押し方 */
export interface KnockOptions {
  /** 水平の強さ。**省略なら既定**（`core/knockback.ts` の `KNOCK_H`） */
  readonly power?: number;
  /** 上へ飛ばす強さ。**省略なら 0**（浮かせない） */
  readonly up?: number;
  /**
   * **モブも押すか。** **既定は押さない**（`22-feedback.md` 6 章）。
   *
   * **押すと、多段ヒットの武器が当てるたびに遠ざける。**
   */
  readonly mobs?: boolean;
}

function pointOf(from: Entity | Vector3): Vector3 | undefined {
  try {
    return "location" in from ? (from as Entity).location : (from as Vector3);
  } catch {
    return undefined;
  }
}

/**
 * **押す。**
 *
 * @param from **殴ってきたもの**（実体でも、位置でもよい）。**そこから離れる向きへ押す**
 */
export function knockback(target: Entity, from: Entity | Vector3 | undefined, o: KnockOptions = {}): void {
  if (from === undefined) return;
  // **モブは、押すと言われたときだけ押す**
  if (!(target instanceof Player) && o.mobs !== true) return;
  const at = pointOf(from);
  if (at === undefined) return;
  try {
    const me = target.location;
    const dx = me.x - at.x;
    const dz = me.z - at.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    // **受け手の軽減を掛ける**（モーション強化でも、モブの性質でも同じ 1 本）
    const power = knockPower(o.power, resistOf(target));
    if (power <= 0) return;
    target.applyKnockback({ x: (dx / len) * power, z: (dz / len) * power }, o.up ?? KNOCK_UP);
  } catch {
    /* 消えている */
  }
}
