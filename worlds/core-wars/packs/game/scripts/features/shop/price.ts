/**
 * 値段の編集。
 *
 * 仕様は `docs/spec/12-shop.md` 4章。
 *
 * ## ショップと同じ盤面を使う
 *
 * **普段見ている位置のまま直せる。**
 * 別の一覧を覚え直す必要が無いし、
 * 「どの行がどの通貨か」がそのまま編集画面でも通じる。
 *
 * ## 運営だけ
 *
 * 遊ぶ人が値段を変えられてはいけない。
 */

import { bar } from "../../lib/fx.js";
import {
  system,
  world,
  CommandPermissionLevel,
  CustomCommandStatus,
  type Player,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type CustomCommandRegistry,
} from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import {
  CATEGORY_NAME,
  CATEGORY_ORDER,
  CURRENCY_NAME_PLAIN,
  CURRENCY_ORDER,
  ROW_SIZE,
  gridOf,
  unitsOf,
  type Category,
  type ShopItem,
} from "../../lib/shop-items.js";
import {
  currencyOf,
  isChanged,
  priceOf,
  priceText,
  resetAllPrices,
  resetPrice,
  setCurrency,
  setPrice,
  totalOf,
} from "../../lib/shop-prices.js";
import { ChestFormData } from "../../vendor/chest-ui/forms.js";
import { CATEGORY_ICON, CHEST_SIZE, SLOT_BACK, iconOf } from "./index.js";

/** 種別を選ぶ */
function showCategories(player: Player, message?: string): void {
  const form = new ChestFormData(CHEST_SIZE).title("値段の編集");
  const start = ROW_SIZE * 2 + 1;
  CATEGORY_ORDER.forEach((c, i) => {
    const lore = message !== undefined && i === 0 ? [message] : [];
    form.button(start + i, `§f${CATEGORY_NAME[c]}`, lore, CATEGORY_ICON[c]);
  });
  // **全部戻す。** 触りすぎて分からなくなったときの逃げ道
  form.button(SLOT_BACK, "§c全部を初期値へ戻す", ["§7押すと確認が出ます"], "minecraft:barrier");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection === SLOT_BACK) {
        confirmResetAll(player);
        return;
      }
      const picked = CATEGORY_ORDER[res.selection - start];
      if (picked === undefined) return;
      showItems(player, picked);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** 品物を選ぶ。**並びはショップと同じ** */
function showItems(player: Player, category: Category): void {
  const grid = gridOf(category);
  const form = new ChestFormData(CHEST_SIZE).title(`値段の編集 - ${CATEGORY_NAME[category]}`);

  grid.forEach((it, slot) => {
    if (it === undefined) return;
    const now = priceOf(it);
    const units = unitsOf(it);
    // **編集するのは 1 個あたりの値段。** 総額は個数から決まる
    const lore = [`§7１個あたり  §f${CURRENCY_NAME_PLAIN[currencyOf(it)]} ${priceText(now)} 個`];
    if (units > 1) lore.push(`§7合計（${units} 個）  §f${totalOf(it)}`);
    // **初期値から変えたものに印を付ける。** どこを触ったか分かるように
    if (isChanged(it)) {
      lore.push(`§7初期値  §8${CURRENCY_NAME_PLAIN[it.currency]} ${priceText(it.price)} 個  §e(変更あり)`);
    }
    form.button(slot, `§f${it.label}`, lore, iconOf(it, undefined), it.give[0]?.amount ?? 1);
  });
  form.button(SLOT_BACK, "§7戻る", [], "minecraft:arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection === SLOT_BACK) {
        showCategories(player);
        return;
      }
      const picked = grid[res.selection];
      if (picked === undefined) return;
      editOne(player, category, picked);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * 1 つの値段と通貨を決める。
 *
 * **通貨も変えられる**（`docs/spec/12-shop.md` 5-A）。
 * 値段だけでは釣り合いを取りきれない——
 * 「鉄 60 個」より「金 8 個」のほうが早いことがある。
 */
function editOne(player: Player, category: Category, item: ShopItem): void {
  const now = priceOf(item);
  const cur = currencyOf(item);
  const names = CURRENCY_ORDER.map((c) => CURRENCY_NAME_PLAIN[c]);
  const at = Math.max(0, CURRENCY_ORDER.indexOf(cur));
  const back = `${CURRENCY_NAME_PLAIN[item.currency]} ${priceText(item.price)}`;

  new ModalFormData()
    .title(item.label)
    .dropdown("何で買うか", names, { defaultValueIndex: at })
    .textField(`値段（1 個あたり）\n§7空にすると初期値（${back}）に戻ります`, `${now}`, {
      defaultValue: `${priceText(now)}`,
    })
    .show(player)
    .then((res) => {
      if (res.canceled || res.formValues === undefined) {
        showItems(player, category);
        return;
      }
      const picked = CURRENCY_ORDER[Number(res.formValues[0] ?? at)] ?? cur;
      const raw = String(res.formValues[1] ?? "").trim();

      let msg: string;
      if (raw === "") {
        // **戻すのは値段も通貨も。** 「初期状態に戻す」操作を 2 つに分けない
        resetPrice(item.id);
        msg = `§7${item.label} を初期値（${back}）に戻しました`;
      } else if (setPrice(item.id, Number(raw))) {
        setCurrency(item.id, picked);
        msg = `§a${item.label} を ${CURRENCY_NAME_PLAIN[picked]} ${priceText(priceOf(item))} にしました`;
      } else {
        // **1 以上の数だけ。** 0 以下だとただで配れてしまう
        msg = "§c0 より大きい数を入れてください";
      }
      showItems(player, category);
      bar(player, msg);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** 全部戻す前に一度止める。**押し間違いで全部消えるのは痛い** */
function confirmResetAll(player: Player): void {
  new ModalFormData()
    .title("全部を初期値へ戻す")
    .textField("戻すなら「はい」と入れてください", "はい")
    .show(player)
    .then((res) => {
      if (res.canceled || res.formValues === undefined) {
        showCategories(player);
        return;
      }
      if (String(res.formValues[0] ?? "").trim() !== "はい") {
        showCategories(player, "§7戻しませんでした");
        return;
      }
      const n = resetAllPrices();
      showCategories(player, `§a${n} 件を初期値へ戻しました`);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e !== undefined && e.typeId === "minecraft:player" ? (e as Player) : undefined;
}

/** 運営の道具から開く。**コマンドを打たずに済ませる** */
export function openPriceEditor(player: Player): void {
  showCategories(player);
}

export function registerPriceCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:price",
      description: "ショップの値段を変える（運営のみ）",
      // **運営だけ。** 遊ぶ人が値段を変えられてはいけない
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      // **画面を出すのは world への操作。** 次の tick へ逃がす
      system.run(() => showCategories(player));
      return { status: CustomCommandStatus.Success };
    }
  );
  void world;
}
