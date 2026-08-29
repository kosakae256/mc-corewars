/**
 * 落雷。**1 枚の絵として描いた雷を、パラパラ漫画で光らせる。**
 *
 * 仕様は `docs/spec/17-element.md` 5-7。
 *
 * ## 粒を並べるのをやめた（2026-08-29）
 *
 * はじめは**節を縦に繋いで**折れ線を作っていた。**雷に見えなかった**——
 * 粒を並べても**点の列**にしかならず、**枝も細かい折れも描けない。**
 *
 * **雷 1 本を、縦長の絵に丸ごと描く。**
 * **4 コマの明滅**（`flipbook`）で、本物の雷のように光らせる。
 *
 * | | |
 * | --- | --- |
 * | 絵と定義 | `tools/pve-bolt-from-gif.py` が映像から切り出す（**5 通り**） |
 * | 形 | **当たるたびに引く。** 同じ形が続くと「絵」に見える |
 * | 着弾 | **閃光 ＋ 跳ねる火花** |
 */

import { type Dimension, type Entity, type Vector3 } from "@minecraft/server";

/**
 * 雷の絵の高さ（マス）。**粒の `size` と揃える**
 *（`tools/pve-bolt-flipbook.py`）。
 */
const BOLT_HEIGHT = 8.0;

/** 形の数（`pve:el_bolt_0`〜`_4`）。**絵を増やしたらここも増やす** */
const KINDS = 5;

/** 着弾の閃光 */
const FLASH = "pve:el_thunder_flash";

/** 跳ねる火花 */
const SPARK = "pve:el_thunder_spark";

function put(dim: Dimension, id: string, at: Vector3): void {
  try {
    dim.spawnParticle(id, at);
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 落とす。
 *
 * @param at 落とす場所（**足元**）
 */
export function strike(entity: Entity, at: Vector3): void {
  let dim: Dimension;
  try {
    dim = entity.dimension;
  } catch {
    return;
  }

  // **6 通りから引く。** 同じ形が続くと「絵」に見える
  const kind = Math.floor(Math.random() * KINDS);
  // 板は真ん中で位置が決まるので、**半分ぶん持ち上げて足元に着地させる**
  put(dim, `pve:el_bolt_${kind}`, { x: at.x, y: at.y + BOLT_HEIGHT / 2, z: at.z });

  put(dim, FLASH, { x: at.x, y: at.y + 0.1, z: at.z });
  put(dim, SPARK, { x: at.x, y: at.y + 0.1, z: at.z });
}
