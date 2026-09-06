/**
 * 戦場に居るものを数える。
 *
 * **敵が 0 になったらウェーブが終わる**（`docs/spec/17-state.md` 2-2）——
 * **その判定を 1 か所に置く。**
 */

import { world, type Entity, type Vector3 } from "@minecraft/server";

import { fieldBox } from "./arena.js";

/** 敵の目印。**すべての敵実体が持つ**（`behavior_packs/pve_v3/entities/*.json`） */
export const ENEMY_FAMILY = "pve_mob";

function overworld(): ReturnType<typeof world.getDimension> | undefined {
  try {
    return world.getDimension("overworld");
  } catch {
    return undefined;
  }
}

/** 世界中の敵。**消すときはこちら** */
export function allEnemies(): Entity[] {
  const dim = overworld();
  if (dim === undefined) return [];
  try {
    return dim.getEntities({ families: [ENEMY_FAMILY] });
  } catch {
    return [];
  }
}

/** その実体は、いまの戦場の箱の中に居るか */
function inside(e: Entity, box: { from: Vector3; to: Vector3 }): boolean {
  try {
    const at = e.location;
    return at.x >= box.from.x && at.x <= box.to.x && at.z >= box.from.z && at.z <= box.to.z;
  } catch {
    return false;
  }
}

/**
 * **いまの戦場に居る敵**（2026-09-07 変更）。
 *
 * > ### 世界中を数えない
 * >
 * > **マップは 1000 マスずつ離して常設してある**（`19-map-store.md` 0 章）。
 * > **別のマップに 1 体でも残っていると、ウェーブが終わらなくなる。**
 */
export function enemies(): Entity[] {
  const box = fieldBox();
  return allEnemies().filter((e) => inside(e, box));
}

/** 場に居る敵の数 */
export function enemyCount(): number {
  return enemies().length;
}

/** **箱の外に居る敵。** 居てはいけないもの */
export function strays(): Entity[] {
  const box = fieldBox();
  return allEnemies().filter((e) => !inside(e, box));
}

/**
 * **全部消す。** ウェーブの終わりと、ゲームの終わり。
 *
 * > ### 倒すのではなく、消す
 * >
 * > **`entity.remove()`**——**報酬は出ない。** 片付けであって、戦果ではない。
 *
 * **世界中を見る**——**別のマップに残ったものも消す。**
 */
export function clearEnemies(): number {
  let n = 0;
  for (const e of allEnemies()) {
    try {
      e.remove();
      n++;
    } catch {
      /* もう居ない */
    }
  }
  return n;
}
