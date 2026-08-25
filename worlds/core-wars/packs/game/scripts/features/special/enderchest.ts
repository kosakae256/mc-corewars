/**
 * 敵陣ではエンダーチェストを開けない。
 *
 * 仕様は `docs/spec/12-shop.md` 5-B。
 *
 * ## なぜ
 *
 * エンダーチェストは**奪われない置き場所**（`docs/01-rules.md` 4-3）。
 *
 * 敵陣でも開けるなら、**攻め込んだまま補給し続けられる。**
 * 死んでも落とさない資源を、相手の拠点の真ん中で取り出せてしまう。
 *
 * **敵陣で使えるのは、持って入ったものだけ。**
 * 何を持って攻め込むかが、そのまま判断になる。
 *
 * ## 店とは扱いが違う
 *
 * | | 敵陣で |
 * | --- | --- |
 * | **ショップ** | **使える**（ただし手持ちだけで払う） |
 * | **エンダーチェスト** | **開けない** |
 *
 * 店は「そこへ行かないと買えない場所」なので、踏み込む理由になる。
 * エンダーチェストは**どこにでもある同じ箱**で、行く理由にならない。
 */

import { world } from "@minecraft/server";

import { BAR, bar } from "../../lib/fx.js";
import { inEnemyBase } from "../../lib/zone.js";

/** 開かせないもの */
const ENDER = "minecraft:ender_chest";

/**
 * 受け取りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function registerEnderGuard(): void {
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.block.typeId !== ENDER) return;
    if (!inEnemyBase(ev.player)) return;
    // **開く前に止める。** 開いてから閉じると、中身が一瞬見える
    ev.cancel = true;
    bar(ev.player, "§c敵陣ではエンダーチェストを開けません", BAR.notice, 40);
  });
}
