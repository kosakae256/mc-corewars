/**
 * 参加者の左端に、発動アイテムを常に持たせる（spec 05 の 2-1）。
 *
 * ## 捨てられなくする
 *
 * `ItemLockMode.slot` を使う。公式の説明は
 * *"The item cannot be moved from its slot, dropped or crafted with."*
 * スロットから動かせず、捨てられず、クラフトにも使えない。
 *
 * それでも無くなることはある（死亡・別の手段）ので、定期的に確認して置き直す。
 */
import {
  EntityComponentTypes,
  ItemLockMode,
  ItemStack,
  system,
  world,
  type Player,
} from "@minecraft/server";

import { CLONE_ITEM, CLONE_ITEM_NAME, CLONE_SLOT, EQUIP_INTERVAL } from "./config.js";

/** 発動アイテムを1つ作る */
function makeItem(): ItemStack {
  const stack = new ItemStack(CLONE_ITEM, 1);
  stack.nameTag = CLONE_ITEM_NAME;
  // スロットから動かせない・捨てられない
  stack.lockMode = ItemLockMode.slot;
  // 死んでも失わない
  stack.keepOnDeath = true;
  return stack;
}

/** その人の左端が発動アイテムでなければ置き直す */
function ensureFor(player: Player): void {
  try {
    const inventory = player.getComponent(EntityComponentTypes.Inventory);
    const container = inventory?.container;
    if (!container) return;

    const current = container.getItem(CLONE_SLOT);
    if (current?.typeId === CLONE_ITEM) return;

    // **左端に既に何かある場合は上書きになる。**
    // 実験用アドオンなので、そこは割り切る
    container.setItem(CLONE_SLOT, makeItem());
  } catch {
    // 読めない状態のプレイヤーは次の周期で拾う
  }
}

let runId: number | undefined;

/** 全員に持たせ続ける。何度呼んでもタイマーは1本 */
export function enableEquip(): void {
  // 入ってきた人にはすぐ渡す
  world.afterEvents.playerSpawn.subscribe((event) => {
    ensureFor(event.player);
  });

  if (runId !== undefined) return;
  runId = system.runInterval(() => {
    for (const player of world.getAllPlayers()) ensureFor(player);
  }, EQUIP_INTERVAL);
}
