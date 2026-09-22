/**
 * **当たりの大きさを、相手の体に合わせる。**
 *
 * 仕様は `docs/spec/24-mob-howto.md` 10-2。
 *
 * > ### **人に合わせた当たりを、小さい敵にも使っていた**（実測・2026-09-08）
 * >
 * > **高さ 0.9 と 1.6 の 2 点、半径 0.6。**
 * > **シルバーフィッシュ（0.4 × 0.3）やコウモリ（0.5 × 0.9）には大きすぎる。**
 * > **頭の上を通った矢が当たっていた。**
 */

import { type Entity } from "@minecraft/server";

import type { HitShape } from "../core/geometry.js";

/**
 * **相手の背丈に合わせる。**
 *
 * > ### **小さい敵の当たりが大きすぎた**（実測・2026-09-08）
 * >
 * > **当たりの高さは人に合わせて 0.9 と 1.6 の 2 点で見ていた。**
 * > **シルバーフィッシュ・エンダーマイトは背丈 0.3。**
 * > **頭のはるか上を通った矢が当たっていた。**
 *
 * **`getHeadLocation()` と足元の差**が、その実体の背丈。
 * **背丈より高い点は見ない**——**低すぎるときは足元 1 点だけ。**
 */
export function fitTo(e: Entity, shape: HitShape): HitShape {
  let tall = 1.8;
  try {
    tall = Math.max(0.2, e.getHeadLocation().y - e.location.y + 0.2);
  } catch {
    return shape;
  }
  // > ### **太さも背丈に合わせる**（2026-09-08 に足した）
  // >
  // > **高さだけ削っても、横の半径が人と同じでは太いまま。**
  // > **コウモリ（0.5 × 0.9）に、人と同じ 0.6 マスの半径が当たっていた。**
  // > **背丈 1.8 を 1.0 として、それより小さい相手は細くする**（下限は半分）。
  const fat = shape.fat * Math.max(0.5, Math.min(1, tall / 1.8));
  const marks = shape.marks.filter((h) => h <= tall);
  return marks.length === 0 ? { fat, marks: [tall * 0.5] } : { fat, marks };
}
