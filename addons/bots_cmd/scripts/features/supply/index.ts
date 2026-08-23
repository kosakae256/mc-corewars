/**
 * ボットへのブロック補給。
 *
 * 整地（穴埋め）にはブロックの在庫が要る。サバイバルでは実際にアイテムが
 * 必要なので、対象のプレイヤーに一定間隔で補充し続ける。
 *
 * ## 対象の決め方
 *
 * `SUPPLY_TAG` タグを持つプレイヤー、または `SUPPLY_NAMES` に載っている名前。
 * タグはボット召喚時に `tag <名前> add bot` で付ける想定だが、
 * 名前指定でも動くようにしてある（タグ付けを忘れても機能させるため）。
 *
 * ## リロード安全性
 *
 * この処理は **`system.runInterval` をトップレベルで登録する**。
 * トップレベルは early execution だが `system.runInterval` は許可されている。
 *
 * `/reload` で二重に登録される可能性があるため、**冪等な処理**にしてある。
 * 「不足していたら決まった個数に揃える」だけなので、
 * 2回走っても結果は変わらない（docs/research/02-hot-reload.md）。
 */
import { ItemStack, system, world, type Container, type Player } from "@minecraft/server";

import { needsRefill } from "./logic.js";

/** 補給対象を示すタグ */
const SUPPLY_TAG = "bot";

/** タグが無くても補給する名前。タグ付けを忘れたときの保険 */
const SUPPLY_NAMES: readonly string[] = [];

/** 配るアイテム */
const SUPPLY_ITEM = "minecraft:dirt";

/** 補充後の個数 */
const SUPPLY_AMOUNT = 64;

/** この個数を下回ったら補充する */
const REFILL_THRESHOLD = 16;

/** 補充を入れるホットバーのスロット（0〜8） */
const SUPPLY_SLOT = 0;

/** 補充の間隔（tick）。20 tick = 1秒 */
const INTERVAL_TICKS = 40;

function isSupplyTarget(player: Player): boolean {
  return player.hasTag(SUPPLY_TAG) || SUPPLY_NAMES.includes(player.name);
}

/**
 * 1人ぶんの補充。
 *
 * **冪等**にしてある（同じ状態で何度呼んでも結果が同じ）。
 * リロードでこの処理が二重登録されても壊れないようにするため。
 */
function refill(player: Player): void {
  const inventory = player.getComponent("minecraft:inventory");
  const container: Container | undefined = inventory?.container;
  if (!container) return;

  const current = container.getItem(SUPPLY_SLOT);
  if (!needsRefill(current?.typeId, current?.amount ?? 0, SUPPLY_ITEM, REFILL_THRESHOLD)) {
    return;
  }

  container.setItem(SUPPLY_SLOT, new ItemStack(SUPPLY_ITEM, SUPPLY_AMOUNT));
  // 置く操作は「手に持っているもの」が使われるので、持ち替えさせる
  player.selectedSlotIndex = SUPPLY_SLOT;
}

export function startSupplyLoop(): void {
  system.runInterval(() => {
    // world にアクセスするのは default execution の中なので問題ない
    for (const player of world.getAllPlayers()) {
      if (!isSupplyTarget(player)) continue;
      try {
        refill(player);
      } catch (e) {
        // 1人の失敗で全体を止めない。プレイヤーが抜けた直後などに起きうる
        console.warn(`[supply] ${player.name} への補給に失敗: ${String(e)}`);
      }
    }
  }, INTERVAL_TICKS);
}
