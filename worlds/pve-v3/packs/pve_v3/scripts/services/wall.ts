/**
 * **弾を止める壁**を見分ける。
 *
 * 仕様は `docs/spec/24-mob-howto.md` 10-2。
 *
 * > ### **`bullet.ts` から切り出した**（2026-09-08）
 * >
 * > **弾に重力と追尾を足したら、1 ファイルの上限（300 行）を超えた。**
 * > **壁の判定は弾に依らない**ので、こちらへ移した。
 */

import { LiquidType, type Dimension, type Vector3 } from "@minecraft/server";

import { pointAt } from "../core/geometry.js";

/** 何マスごとに見るか。**細かすぎると重い** */
const PROBE_STEP = 0.25;

/**
 * そこは**弾を止める壁**か。
 *
 * > ### **1×1×1 の塊だけが壁**（2026-09-08 決定）
 * >
 * > **はしご・松明・草・半ブロック・階段・柵**——**塊でないものは全部通す。**
 * > **前は「水で流されるものは通る」で見ていたが、はしごは水で流されない**ので
 * > **壁と見なされ、はしごの中の敵を撃てなかった。**
 *
 * **塊かどうかは、水で見分ける**（`isSolid` が無いため）。
 *
 * | | |
 * | --- | --- |
 * | **水を止める**（`isLiquidBlocking`） | 石・ガラス・葉 → **止める** ／ 松明・草 → **止めない** |
 * | **水を置ける**（`canContainLiquid`） | **半ブロック・階段・柵・はしご → 置ける**（＝塊ではない） |
 *
 * **「水を止める、かつ 水を置けない」＝ 1×1×1 の塊。**
 */
export function insideWall(dim: Dimension, at: Vector3): boolean {
  try {
    const block = dim.getBlock(at);
    if (block === undefined) return false;
    if (block.isAir || block.isLiquid) return false;
    return block.isLiquidBlocking(LiquidType.Water) && !block.canContainLiquid(LiquidType.Water);
  } catch {
    // 読み込まれていない所は「壁ではない」——消してしまうより飛ばす
    return false;
  }
}

/**
 * **この区間のどこで壁に当たるか。**
 *
 * > ### レイに頼らない（2026-09-08 変更）
 * >
 * > **`getBlockFromRay` は「通り抜けられるか」を engine の基準で決める。**
 * > **半ブロックや階段は「通り抜けられない」扱いなので、こちらの決まりと食い違う。**
 * > **自分の決まりで、刻んで触って確かめる。**
 */
export function wallAlong(dim: Dimension, from: Vector3, dir: Vector3, length: number): number | undefined {
  // **同じブロックを何度も引かない**——刻みが細かいと、続けて同じ枡に入る
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  let lastZ = Number.NaN;
  for (let t = PROBE_STEP; t <= length; t += PROBE_STEP) {
    const at = pointAt(from, dir, t);
    const x = Math.floor(at.x);
    const y = Math.floor(at.y);
    const z = Math.floor(at.z);
    if (x === lastX && y === lastY && z === lastZ) continue;
    lastX = x;
    lastY = y;
    lastZ = z;
    if (insideWall(dim, at)) return t;
  }
  return undefined;
}
