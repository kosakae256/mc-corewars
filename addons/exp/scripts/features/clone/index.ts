/**
 * 分身機能の配線。
 *
 * 仕様: docs/spec/05-exp-clone.md
 */
import { world } from "@minecraft/server";

import { CLONE_ITEM } from "./config.js";
import { spawnClone, enableClonePopping, dumpSkins } from "./clone.js";
import { enableEquip } from "./equip.js";
import { enableQuiet } from "./quiet.js";

/** 分身機能を有効にする */
export function enableClone(): void {
  // 通知の抑止は、分身を出すより先に用意しておく
  enableQuiet();

  // 参加者の左端に発動アイテムを持たせ続ける
  enableEquip();

  // 殴られたら消える
  enableClonePopping();

  // 発動。**コマンドではなくアイテムにする。**
  // コマンドの新規登録はサーバー再起動が要るが、
  // イベント購読なら /reload だけで反映される
  world.afterEvents.itemUse.subscribe((event) => {
    if (event.itemStack.typeId !== CLONE_ITEM) return;

    // スニークしながらなら、分身を出さずにスキン情報だけ見る（調査用）
    if (event.source.isSneaking) {
      dumpSkins();
      return;
    }
    spawnClone(event.source);
  });
}
