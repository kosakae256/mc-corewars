/**
 * 飾りのネザーゲート（`pve_v3:portal`）を、**座標で敷く。**
 *
 * ## なぜ「探して差し替える」ではないのか
 *
 * > ### 本物のゲートは `getBlock` で拾えなかった（2026-09-01 実機）
 * >
 * > 黒曜石は数えられるのに、**ゲートのブロックだけ 0 件**だった。
 * > `getBlocks` の絞り込みでも見つからない。
 * >
 * > **拾えないなら、置く場所を言ってもらって敷く。**
 *
 * **板の向きは箱の形から決める**——横に長ければ x 向き、奥に長ければ z 向き。
 */

import { BlockPermutation, BlockVolume, type Dimension, type Player, type Vector3 } from "@minecraft/server";

/** 飾りのゲート */
const DECOR = "pve_v3:portal";

/** 一度に置ける上限（**打ち間違いで world を潰さないため**） */
const MAX = 8000;

/**
 * 範囲に敷く。
 *
 * @param clear `true` なら**空気にする**（敷いたものを消す）
 */
export function place(dim: Dimension, from: Vector3, to: Vector3, by: Player, clear: boolean): void {
  const x1 = Math.floor(Math.min(from.x, to.x));
  const y1 = Math.floor(Math.min(from.y, to.y));
  const z1 = Math.floor(Math.min(from.z, to.z));
  const x2 = Math.floor(Math.max(from.x, to.x));
  const y2 = Math.floor(Math.max(from.y, to.y));
  const z2 = Math.floor(Math.max(from.z, to.z));
  const count = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1);
  if (count > MAX) {
    by.sendMessage(`§c広すぎる（${count} マス）。§7${MAX} マスまで`);
    return;
  }

  const volume = new BlockVolume({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 });
  try {
    if (clear) {
      dim.fillBlocks(volume, "minecraft:air");
      by.sendMessage(`§7${count} マスを空気にした`);
      return;
    }
    // **横に長ければ x 向き、奥に長ければ z 向き**
    const across = z2 - z1 > x2 - x1;
    dim.fillBlocks(volume, BlockPermutation.resolve(DECOR, { "pve_v3:across": across }));
    by.sendMessage(`§a${count}§7 マスに飾りのゲートを置いた（${across ? "z" : "x"} 向き）`);
  } catch (err) {
    by.sendMessage(`§c置けなかった: ${String(err)}`);
  }
}
