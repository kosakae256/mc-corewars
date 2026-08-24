/**
 * 支給品を配る。
 *
 * 仕様は `docs/spec/11-match.md` 5-3。
 *
 * ## なぜ独自アイテムなのか
 *
 * バニラの木の剣だと**耐久度が減って壊れる。** 試合中に丸腰になる。
 * 攻撃力も調整できない。
 *
 * `game:starter_sword` は耐久度を持たない。**壊れない。**
 *
 * ## 鍵は付けない
 *
 * **普通のアイテムとして扱う。** 捨てられるし、並べ替えられる。
 *
 * 枠に固定すると持ち替えも並べ替えもできず、遊びにくい。
 * 失っても**次の配布で戻ってくる**ので、固定する必要が無い。
 */

import { ItemStack, type Player } from "@minecraft/server";

/**
 * 支給するもの。
 *
 * **どちらも壊れない。** 試合中に失っても、次の配布で戻ってくる。
 *
 * ワイヤーは `docs/spec/13-grapple.md`。
 */
const SUPPLIES = [
  { item: "game:starter_sword", slot: 0 },
  { item: "game:grapple", slot: 1 },
] as const;

/**
 * 支給品を配る。
 *
 * **開始時・途中参加時・リスポーン時**に呼ぶ（`docs/spec/11-match.md` 5-3）。
 *
 * 既に持っているなら何もしない。**呼びすぎても増えない。**
 */
export function giveLoadout(player: Player): void {
  const inv = player.getComponent("minecraft:inventory");
  if (inv === undefined) return;
  const container = inv.container;
  if (container === undefined) return;

  // **既に持っているものを先に数える。**
  // 持ち物のどこにあってもよい。決まった枠へ戻すと、並べ替えた意味が無くなる
  const held = new Set<string>();
  for (let i = 0; i < container.size; i++) {
    const id = container.getItem(i)?.typeId;
    if (id !== undefined) held.add(id);
  }

  for (const s of SUPPLIES) {
    if (held.has(s.item)) continue;
    // 決まった枠が空いていればそこへ。埋まっていれば空きへ
    if (container.getItem(s.slot) === undefined) container.setItem(s.slot, new ItemStack(s.item, 1));
    else container.addItem(new ItemStack(s.item, 1));
  }
}

/**
 * 持ち物とエンダーチェストを空にして、支給品だけにする。
 *
 * **後片付けで使う**（`docs/spec/11-match.md` 4章）。
 *
 * ## エンダーチェストはプレイヤー側にある
 *
 * 中身は**ブロックではなくプレイヤーに紐づく。**
 * 拠点のエンダーチェストを空にしても消えない。
 *
 * `minecraft:ender_inventory` から触れる。
 * これが無いと、前の試合の資源を持ち越せてしまう。
 */
export function resetInventory(player: Player): void {
  const inv = player.getComponent("minecraft:inventory");
  const container = inv?.container;
  if (container !== undefined) container.clearAll();

  const ender = player.getComponent("minecraft:ender_inventory");
  const box = ender?.container;
  if (box !== undefined) box.clearAll();

  giveLoadout(player);
}
