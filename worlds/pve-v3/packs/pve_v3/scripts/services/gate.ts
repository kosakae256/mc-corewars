/**
 * 戦場のゲートを、★の色に塗り替える。
 *
 * 仕様は `worlds/pve-v3/docs/spec/20-portal.md` 3 章。
 *
 * > ### マップの中のポータルは、色を持っていない
 * >
 * > マップは**保存された構造物**なので、置くと `pve_v3:portal` のまま出る。
 * > **置き終わってから、ゲートの位置だけ差し替える。**
 * >
 * > **座標が決まっている**（`14-map-build.md` 0-2）ので、探す範囲は狭くてよい。
 */

import { BlockPermutation, world, type Dimension } from "@minecraft/server";

import { GATE } from "../core/places.js";
import { ACROSS, portalOf, type PortalTarget } from "../core/portal.js";

function dim(): Dimension {
  return world.getDimension("overworld");
}

/**
 * **戦場のゲートを置く。**
 *
 * **マップの中には入っていない**（`20-portal.md` 0-2）——
 * **敵を倒し切ったときに、行き先の色でこの箱を埋める。**
 *
 * @returns 置いた数
 */
export function openGate(target: PortalTarget): number {
  const want = BlockPermutation.resolve(portalOf(target), { [ACROSS]: false });
  const d = dim();
  let n = 0;
  for (let x = GATE.x1; x <= GATE.x2; x++) {
    for (let y = GATE.y1; y <= GATE.y2; y++) {
      try {
        const block = d.getBlock({ x, y, z: GATE.z });
        if (block === undefined || block.typeId === want.type.id) continue;
        block.setPermutation(want);
        n++;
      } catch {
        /* 読み込まれていない */
      }
    }
  }
  return n;
}
