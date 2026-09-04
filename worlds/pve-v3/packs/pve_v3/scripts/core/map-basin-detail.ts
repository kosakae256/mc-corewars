/**
 * 戦場 01「岩山の窪地」の、細かい飾り。
 *
 * **苔と草を、ほんの少しだけ散らす。**
 * **敷き詰めない**——岩の場所なので、緑が多いと別の場所に見える。
 */

import { set, type BuildOp } from "./build.js";
import { GROUND, heightOf, inRiverAt } from "./map-basin.js";
import { spot } from "./noise.js";

/** 種。**`map-basin.ts` と揃える** */
const SEED = 1337;

/** 苔と草を散らす */
export function detailOps(): BuildOp[] {
  const ops: BuildOp[] = [];
  for (let x = -40; x < 40; x++) {
    for (let z = -40; z < 40; z++) {
      if (spot(x, z, SEED + 41) > 0.03) continue;
      if (Math.hypot(x, z) > 34) continue;
      const h = heightOf(x, z) + (inRiverAt(x, z) ? -2 : 0);
      if (h < GROUND - 4) continue;
      ops.push(set(x, h + 1, z, spot(x, z, SEED + 43) > 0.5 ? "short_grass" : "moss_carpet"));
    }
  }
  return ops;
}
