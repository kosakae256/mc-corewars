/**
 * **その実体の定義を引く。**
 *
 * > ### **`traits.ts` から切り出した**（2026-09-08）
 * >
 * > **`melee.ts` が `traits.ts` の `defOf` を、`traits.ts` が `melee.ts` の `powerOf` を
 * > 呼んでいて、輪になっていた。** 巻き上げで動いてはいたが、**輪は輪。**
 * > **`defOf` は表を引くだけ**なので、どちらにも依らない場所へ置く。
 */

import type { Entity } from "@minecraft/server";

import type { EnemyDef } from "../core/enemy.js";
import { ENEMIES } from "../core/roster.js";
import { KEYS } from "../state/keys.js";
import { rangedReach } from "../core/ranged-ai.js";

/** その敵の定義。**湧かせた側が id を置いている** */
export function defOf(mob: Entity): EnemyDef | undefined {
  try {
    const v = mob.getDynamicProperty(KEYS.kind);
    return typeof v === "string" ? ENEMIES[v] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * **その敵は、殴りで削るか。**
 *
 * > ### **判断を 1 か所に集める**（実測・2026-09-08）
 * >
 * > **`回転` は近接と薙ぎ払いが同じ間隔で回っていて、範囲の中に居ると 2 回ぶん入っていた。**
 * > **表の備考は範囲攻撃しか書いていない**——**振る敵は殴らない。**
 *
 * | 削らない敵 | なぜ |
 * | --- | --- |
 * | **`noMelee`** | 「投げるだけ」「攻撃しない」と表に書いてある |
 * | **`kind: "boom"`** | クリーパーの攻撃は爆発だけ |
 * | **`sweep` を持つ** | 回転・妖狐・散弾。**当たりは薙ぎ払いが決める** |
 *
 * **どれも `melee_box_attack` は残す**——**あれは「寄る」役でもある**（`25-enemy-kit.md` 14 章）。
 */
export function hitsInMelee(def: EnemyDef | undefined): boolean {
  if (def === undefined) return true;
  return def.noMelee !== true && def.kind !== "boom" && def.sweep === undefined && rangedReach(def) === undefined;
}
