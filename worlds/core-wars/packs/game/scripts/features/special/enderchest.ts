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

import { system, world } from "@minecraft/server";

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
    const player = ev.player;
    if (!inEnemyBase(player)) return;
    // **開く前に止める。** 開いてから閉じると、中身が一瞬見える
    ev.cancel = true;

    // ---- **知らせるのは次の tick**（2026-08-26 修正）
    //
    // before イベントの中は restricted execution で、**画面に書けない**
    //（`docs/imp.md` 5.1）。
    //
    // `bar` は例外を握り潰すので、**何も出ないまま黙って弾かれていた。**
    // 「押しても何も起きない」は、壊れているのと区別が付かない
    system.run(() => {
      bar(player, "§c敵陣のエンダーチェストは使えません", BAR.important, 60);
    });
  });
}
