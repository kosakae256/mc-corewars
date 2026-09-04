/**
 * 戦場に居るものを数える。
 *
 * **敵が 0 になったらウェーブが終わる**（`docs/spec/17-state.md` 2-2）——
 * **その判定を 1 か所に置く。**
 */

import { world, type Entity } from "@minecraft/server";

/** 敵の目印。**すべての敵実体が持つ**（`behavior_packs/pve_v3/entities/*.json`） */
export const ENEMY_FAMILY = "pve_mob";

function overworld(): ReturnType<typeof world.getDimension> | undefined {
  try {
    return world.getDimension("overworld");
  } catch {
    return undefined;
  }
}

/** 場に居る敵 */
export function enemies(): Entity[] {
  const dim = overworld();
  if (dim === undefined) return [];
  try {
    return dim.getEntities({ families: [ENEMY_FAMILY] });
  } catch {
    return [];
  }
}

/** 場に居る敵の数 */
export function enemyCount(): number {
  return enemies().length;
}

/** 全部消す。**ウェーブの終わりと、ゲームの終わり** */
export function clearEnemies(): number {
  let n = 0;
  for (const e of enemies()) {
    try {
      e.remove();
      n++;
    } catch {
      /* もう居ない */
    }
  }
  return n;
}
