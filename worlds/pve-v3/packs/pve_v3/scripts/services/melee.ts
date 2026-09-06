/**
 * **モブの殴りを、バニラの当たりに乗せる。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/23-enemy-unit.md` 3-3。
 *
 * ```
 * バニラが振る（アニメも間合いもバニラ）
 *        ↓ 当たった瞬間
 * こちらのダメージを入れる（`services/combat.ts`）
 * ```
 *
 * > ### 自前のタイマーで殴らせない（2026-09-07 変更）
 * >
 * > **前は script が「間合いに入って n tick 経ったら当てる」としていた。**
 * > **振る動きはバニラ、当たるのは script**——**両者がずれて、腕と攻撃が合わなかった。**
 * >
 * > **当たる瞬間をバニラに任せれば、動きと必ず一致する。**
 *
 * > ### **バニラのダメージそのものに乗る**（2026-09-07）
 * >
 * > `entityHitEntity` ではなく、**`entityHurt` を打ち消す所で入れる。**
 * > **クリエイティブ・スペクテイター・無敵時間**——
 * > **バニラが「当たらない」と判断したものには、そもそも入らない。**
 *
 * **攻撃速度は部品の差し替えで効かせる**（`entities/grunt.json` の `pve_v3:haste_*`）。
 */

import type { Entity, Player } from "@minecraft/server";

import { hit } from "./combat.js";
import { ENEMY_FAMILY } from "./field.js";
import { KEYS } from "../state/keys.js";

/** その敵の攻撃力。**湧かせたときに入れてある** */
function powerOf(mob: Entity): number {
  try {
    const v = mob.getDynamicProperty(KEYS.atk);
    return typeof v === "number" && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** それは敵か */
function isEnemy(entity: Entity | undefined): entity is Entity {
  if (entity === undefined) return false;
  try {
    return entity.matches({ families: [ENEMY_FAMILY] });
  } catch {
    return false;
  }
}

/**
 * **敵がその人を殴った。** こちらの HP を削る。
 *
 * **呼ぶのは `events/hurt.ts`**——**バニラのダメージを打ち消す、その場で。**
 * **1 イベント 1 購読**（`docs/imp.md` 10-2）なので、購読はあちらに 1 本だけ。
 *
 * @returns 削ったか
 */
export function enemyMelee(target: Player, mob: Entity | undefined): boolean {
  if (!isEnemy(mob)) return false;
  const power = powerOf(mob);
  if (power <= 0) return false;
  // **`source` を渡すと、ノックバックの向きが出る**（`22-feedback.md` 6 章）
  hit({ target, attack: power, source: mob });
  return true;
}
