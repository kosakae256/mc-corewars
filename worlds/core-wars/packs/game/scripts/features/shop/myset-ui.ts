/**
 * マイセットの画面と、まとめ買い。
 *
 * 仕様は `docs/spec/17-myset.md`。
 *
 * ## 払う元が 2 つある
 *
 * **持ち物とエンダーチェストの両方から払う。**
 *
 * エンダーチェストは奪われない金庫（`docs/01-rules.md` 4-3）。
 * そこに貯めた資源を使うために、いちいち取り出すのは無駄な手間。
 *
 * ## 足りないときは買えるところまで
 *
 * **全部買えないなら何も買わない**のは不便。
 * 安いものから順に、**払える限り買う。**
 */

import { ItemStack, system, type Container, type Player } from "@minecraft/server";

import {
  CURRENCY_NAME_PLAIN,
  CURRENCY_ORDER,
  ROW_SIZE,
  SHOP_ITEMS,
  gridOf,
  shopItem,
  type Category,
  type Currency,
  type ShopItem,
} from "../../lib/shop-items.js";
import { currencyOf, totalOf } from "../../lib/shop-prices.js";
// **払う元は 1 箇所に集めてある**（docs/spec/12-shop.md 4-B）
import { have, pay, purseOf, type Purse } from "../../lib/purse.js";
import { teamOf } from "../../lib/match-state.js";
import { MYSET_MAX, isEmpty, myset, mysets, setMyset, totalCount, type MySet } from "../../lib/myset.js";
import { wearBest } from "../../lib/armor.js";
import { ChestFormData } from "../../vendor/chest-ui/forms.js";
import { CATEGORY_ICON, CHEST_SIZE, SLOT_BACK, iconOf } from "./index.js";
import { CATEGORY_NAME, CATEGORY_ORDER } from "../../lib/shop-items.js";

/** マイセットの合計値段。**通貨ごとに分けて返す** */
export function setCost(set: MySet): Partial<Record<Currency, number>> {
  const out: Partial<Record<Currency, number>> = {};
  for (const [id, n] of Object.entries(set)) {
    const item = shopItem(id);
    if (item === undefined) continue;
    const cost = totalOf(item) * n;
    const cur = currencyOf(item);
    out[cur] = (out[cur] ?? 0) + cost;
  }
  return out;
}

/**
 * 買うのに足りないぶん。**通貨ごとに。空なら買える。**
 *
 * **押す前に分かっている必要がある**（`docs/spec/17-myset.md` 3-1）。
 * 押してから「足りません」と言うのでは、押した人は買えたと思っている。
 */
export function shortfall(player: Player, set: MySet): Partial<Record<Currency, number>> {
  const purse = purseOf(player);
  const cost = setCost(set);
  const out: Partial<Record<Currency, number>> = {};
  for (const c of CURRENCY_ORDER) {
    const need = cost[c] ?? 0;
    if (need === 0) continue;
    const lack = need - have(purse, c);
    if (lack > 0) out[c] = lack;
  }
  return out;
}

/** 足りないぶんを 1 行にする */
function shortLine(short: Partial<Record<Currency, number>>): string {
  const parts = CURRENCY_ORDER.filter((c) => (short[c] ?? 0) > 0).map(
    (c) => `${CURRENCY_NAME_PLAIN[c]} ${short[c] ?? 0}`
  );
  return `§c足りない: §f${parts.join("  ")}`;
}

/** 合計を 1 行にする。**画面の上段に出す** */
export function costLine(set: MySet): string {
  const cost = setCost(set);
  const parts = CURRENCY_ORDER.filter((c) => (cost[c] ?? 0) > 0).map(
    (c) => `${CURRENCY_NAME_PLAIN[c]} ${cost[c] ?? 0}`
  );
  return parts.length === 0 ? "§7まだ何も入っていません" : `§f${parts.join("  ")}`;
}

// ---------------------------------------------------------------- 買う
/**
 * マイセットを買う。
 *
 * **全部揃わないなら 1 つも買わない**（`docs/spec/17-myset.md` 1-2）。
 *
 * 以前は安いものから払える限り買っていたが、**中途半端に買われるほうが困る。**
 * マイセットは「この装備で前線へ戻る」という単位なので、
 * **半分だけ買えても戦えず、買い直す元手だけが減る。**
 */
export function buyMyset(player: Player, index: number): string {
  const set = myset(player, index);
  if (isEmpty(set)) return "§7そのマイセットは空です";

  const purse = purseOf(player);
  if (purse.bag === undefined) return "§c持ち物を読めません";

  // **払えるかを先に確かめる。** 途中で足りなくなる買い方をしない
  const short = shortfall(player, set);
  if (CURRENCY_ORDER.some((c) => (short[c] ?? 0) > 0)) return shortLine(short);

  const team = teamOf(player);

  const wanted: { item: ShopItem; count: number; unit: number }[] = [];
  for (const [id, n] of Object.entries(set)) {
    const item = shopItem(id);
    if (item === undefined) continue;
    wanted.push({ item, count: n, unit: totalOf(item) });
  }
  // **払えることは確かめてある。** ここから先は全部買える
  let bought = 0;
  for (const w of wanted) {
    for (let k = 0; k < w.count; k++) {
      pay(purse, currencyOf(w.item), w.unit);
      for (const g of w.item.give) {
        const id = team === undefined ? g.item : variant(g.item, team);
        try {
          purse.bag.addItem(new ItemStack(id, g.amount));
        } catch {
          /* 入らなかった */
        }
      }
      bought++;
    }
  }

  // **防具は自動で着る**（docs/spec/17-myset.md 4章）
  system.run(() => wearBest(player));

  return `§a${bought} 点を購入`;
}

/** チームの色に差し替える。**ショップと同じ規則** */
function variant(item: string, team: "red" | "blue"): string {
  const map: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    "minecraft:white_wool": { blue: "minecraft:blue_wool", red: "minecraft:red_wool" },
    "minecraft:prismarine": { blue: "minecraft:prismarine", red: "minecraft:prismarine_bricks" },
    "minecraft:raw_iron_block": { blue: "minecraft:raw_iron_block", red: "minecraft:raw_copper_block" },
  };
  return map[item]?.[team] ?? item;
}

// ---------------------------------------------------------------- 画面
/**
 * 画面を閉じたときの戻り先。
 *
 * **店員から開いたときはショップへ戻す**（`docs/spec/17-myset.md` 2章）。
 * 看板から開いたときは戻る先が無いので、渡さなければ何もしない。
 */
export type Back = (player: Player) => void;

/**
 * マイセットの一覧。
 *
 * @param canBuy ロビーでは false。**登録だけできる**
 * @param onBack 「戻る」を押したときの行き先
 */
export function showMysets(player: Player, canBuy: boolean, message?: string, onBack?: Back): void {
  const list = mysets(player);
  const form = new ChestFormData(CHEST_SIZE).title(canBuy ? "マイセット" : "マイセット（登録）");

  // **買えないセットは押せない**（docs/spec/17-myset.md 3-1）。
  // どれが買えるかは、押す前に見て分かる必要がある
  const blocked = new Set<number>();

  list.forEach((set, i) => {
    const slot = ROW_SIZE * 2 + 2 + i * 2;
    const empty = isEmpty(set);
    const short = canBuy && !empty ? shortfall(player, set) : {};
    const poor = CURRENCY_ORDER.some((c) => (short[c] ?? 0) > 0);
    if (empty || poor) blocked.add(slot);

    const lore = [costLine(set)];
    if (message !== undefined && i === 0) lore.push(message);
    lore.push(empty ? "§8未登録" : `§7${totalCount(set)} 点`);
    if (poor) lore.push(shortLine(short));
    lore.push(poor ? "§8買えません" : canBuy ? "§e押すと購入" : "§e押すと編集");

    form.button(slot, `§f${i + 1} 番`, lore, empty || poor ? "minecraft:barrier" : "minecraft:chest");
  });

  // **編集は別の入口。** 買うつもりで押して中身が変わると事故になる
  if (canBuy) form.button(ROW_SIZE * 4 + 2, "§e編集する", [], "minecraft:writable_book");
  form.button(SLOT_BACK, "§7戻る", [], "minecraft:arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection === SLOT_BACK) {
        onBack?.(player);
        return;
      }
      if (canBuy && res.selection === ROW_SIZE * 4 + 2) {
        showMysets(player, false, undefined, onBack);
        return;
      }
      const idx = list.findIndex((_s, i) => ROW_SIZE * 2 + 2 + i * 2 === res.selection);
      if (idx < 0) return;
      if (canBuy) {
        // **押せないものを押されたら、理由を出し直すだけ**
        if (blocked.has(res.selection)) {
          const set = list[idx];
          const msg = isEmpty(set) ? "§7そのマイセットは空です" : shortLine(shortfall(player, set));
          showMysets(player, true, msg, onBack);
          return;
        }
        const msg = buyMyset(player, idx);
        showMysets(player, true, msg, onBack);
      } else {
        editSet(player, idx, onBack);
      }
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** 編集する。種別を選ぶ */
function editSet(player: Player, index: number, onBack?: Back): void {
  const set = myset(player, index);
  const form = new ChestFormData(CHEST_SIZE).title(`マイセット ${index + 1} 番`);

  // **合計を上段に常に出す**（docs/spec/17-myset.md 3-1）
  form.button(4, "§f現在の合計", [costLine(set)], "minecraft:gold_ingot");

  const start = ROW_SIZE * 2 + 1;
  CATEGORY_ORDER.forEach((c, i) => {
    form.button(start + i, `§f${CATEGORY_NAME[c]}`, [], CATEGORY_ICON[c]);
  });
  form.button(ROW_SIZE * 4 + 1, "§c全部消す", [], "minecraft:barrier");
  form.button(SLOT_BACK, "§7戻る", [], "minecraft:arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection === SLOT_BACK) {
        showMysets(player, false, undefined, onBack);
        return;
      }
      if (res.selection === ROW_SIZE * 4 + 1) {
        setMyset(player, index, {});
        editSet(player, index, onBack);
        return;
      }
      const cat = CATEGORY_ORDER[res.selection - start];
      if (cat === undefined) return;
      editCategory(player, index, cat, onBack);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** 種別の中で個数を足す／引く */
function editCategory(player: Player, index: number, category: Category, onBack?: Back): void {
  const set = myset(player, index);
  const grid = gridOf(category);
  const team = teamOf(player);
  const form = new ChestFormData(CHEST_SIZE).title(`${CATEGORY_NAME[category]}（${index + 1} 番）`);

  form.button(4, "§f現在の合計", [costLine(set)], "minecraft:gold_ingot");

  grid.forEach((it, slot) => {
    if (it === undefined) return;
    const n = set[it.id] ?? 0;
    const lore = [
      `§7値段  §f${CURRENCY_NAME_PLAIN[currencyOf(it)]} ${totalOf(it)}`,
      n > 0 ? `§a入れている  ${n} 個` : "§8入れていない",
      "§e押すと +1（9 で 0 に戻る）",
    ];
    form.button(slot, `§f${it.label}`, lore, iconOf(it, team), Math.max(1, n));
  });
  form.button(SLOT_BACK, "§7戻る", [], "minecraft:arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection === SLOT_BACK) {
        editSet(player, index, onBack);
        return;
      }
      const picked = grid[res.selection];
      if (picked === undefined) return;
      // **押すたびに 1 つ増える。** 9 を超えたら 0 に戻る。
      // 減らす手段を別に作るより、1 つの操作で回すほうが分かりやすい
      const next = ((set[picked.id] ?? 0) + 1) % 10;
      const updated: MySet = { ...set };
      if (next === 0) delete updated[picked.id];
      else updated[picked.id] = next;
      setMyset(player, index, updated);
      editCategory(player, index, category, onBack);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

void SHOP_ITEMS;
void MYSET_MAX;
