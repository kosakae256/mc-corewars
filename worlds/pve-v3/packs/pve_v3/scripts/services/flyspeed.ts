/**
 * **飛ぶ速さの段。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 11 章。
 *
 * > ### **`flying_speed` は書き換えても効かない**（実測・2026-09-08）
 * >
 * > **script から `value` を書いても、移動速度の効果を掛けても、飛ぶ速さは変わらない。**
 * > **バニラのミツバチで確かめた。**
 * >
 * > **攻撃速度と同じ手を使う**——**段ごとの部品を並べて、湧いた瞬間に差し替える。**
 */

import { WALK, type EnemyDef } from "../core/enemy.js";
import { hasteTier } from "../core/haste.js";

/**
 * **飛ぶ速さの段。**
 *
 * **素の速さに対して何倍か**を、攻撃速度と同じ 41 段に丸める。
 */
export function flyTier(def: EnemyDef, move: number): number {
  const bare = def.speed * WALK;
  return hasteTier(bare <= 0 ? 1 : move / bare);
}
