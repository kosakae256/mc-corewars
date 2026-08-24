/**
 * ショップ。
 *
 * 仕様は `docs/spec/12-shop.md`、品揃えは `lib/shop-items.ts`。
 *
 * ## 支払いは持ち物から
 *
 * **通貨は持ち物にあるアイテムそのもの。** スコアボードで数を持たない。
 *
 * 落としても、奪われても、そのまま反映される。
 * 死んで落とした資源を相手が拾えば、相手が買える。
 * `docs/01-rules.md` の「アイテムは落ちる」と噛み合う。
 *
 * ## 見た目はチェスト
 *
 * `vendor/chest-ui` に任せる（`docs/spec/12-shop.md` 3-3）。
 * **通貨ごとに横一列**なので、値段が縦に揃う。
 */

import {
  ItemStack,
  system,
  world,
  Player,
  CommandPermissionLevel,
  CustomCommandStatus,
  type Container,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type CustomCommandRegistry,
} from "@minecraft/server";
import { ChestFormData } from "../../vendor/chest-ui/forms.js";

import {
  CATEGORY_NAME,
  CATEGORY_ORDER,
  CURRENCY_ITEM,
  CURRENCY_NAME,
  CURRENCY_NAME_PLAIN,
  ROW_SIZE,
  gridOf,
  unitsOf,
  type Category,
  type Currency,
  type ShopItem,
} from "../../lib/shop-items.js";
import { isRunning, teamOf, type Team } from "../../lib/match-state.js";
import { priceOf } from "../../lib/shop-prices.js";

/**
 * チームの色に置き換えるブロック。
 *
 * **羊毛と天然石と合成鋼は、チームによって色が違う。**
 * 品揃えには代表を 1 つ書いておき、渡すときに差し替える。
 * 品揃えを 2 倍に増やさずに済む。
 */
const TEAM_BLOCK: Readonly<Record<string, Readonly<Record<Team, string>>>> = {
  "minecraft:white_wool": { blue: "minecraft:blue_wool", red: "minecraft:red_wool" },
  "minecraft:prismarine": { blue: "minecraft:prismarine", red: "minecraft:prismarine_bricks" },
  "minecraft:raw_iron_block": { blue: "minecraft:raw_iron_block", red: "minecraft:raw_copper_block" },
};

function teamVariant(item: string, team: Team | undefined): string {
  if (team === undefined) return item;
  return TEAM_BLOCK[item]?.[team] ?? item;
}

// ---------------------------------------------------------------- 通貨
/** 持ち物にある通貨の数を数える */
function countCurrency(container: Container, currency: Currency): number {
  const want = CURRENCY_ITEM[currency];
  let n = 0;
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it?.typeId === want) n += it.amount;
  }
  return n;
}

/**
 * 支払う。
 *
 * **足りているか確かめてから呼ぶこと。** 途中で足りなくなると half-paid になる。
 */
function payCurrency(container: Container, currency: Currency, amount: number): void {
  const want = CURRENCY_ITEM[currency];
  let left = amount;
  for (let i = 0; i < container.size && left > 0; i++) {
    const it = container.getItem(i);
    if (it?.typeId !== want) continue;
    const take = Math.min(it.amount, left);
    left -= take;
    if (it.amount === take) container.setItem(i, undefined);
    else {
      it.amount -= take;
      container.setItem(i, it);
    }
  }
}

/** 持ち物に空きがあるか */
function hasRoom(container: Container, need: number): boolean {
  let free = 0;
  for (let i = 0; i < container.size; i++) {
    if (container.getItem(i) === undefined) free++;
  }
  return free >= need;
}

// ---------------------------------------------------------------- 購入
function buy(player: Player, item: ShopItem): string {
  const inv = player.getComponent("minecraft:inventory");
  const container = inv?.container;
  if (container === undefined) return "§c持ち物を読めません";

  // **1 個あたりの値段 x 個数。** まとめ買いで安くしない
  const price = priceOf(item) * unitsOf(item);
  const have = countCurrency(container, item.currency);
  if (have < price) {
    // **何が何個足りないかまで言う。** 「買えません」だけだと理由が分からない
    return `§c${CURRENCY_NAME[item.currency]}§c が ${price - have} 足りません（${have}/${price}）`;
  }

  // **いっぱいなら買わせない。** 足元に落とすと事故で失う
  if (!hasRoom(container, item.give.length)) {
    return "§c持ち物がいっぱいです";
  }

  payCurrency(container, item.currency, price);
  const team = teamOf(player);
  for (const g of item.give) {
    if (g.data === undefined) {
      container.addItem(new ItemStack(teamVariant(g.item, team), g.amount));
      continue;
    }
    // **データ値の要るものはコマンドで渡す。**
    // ポーションは全部 `minecraft:potion` で、効果はデータ値で分かれる。
    // スクリプトから作る手段がこの版には無い
    try {
      player.runCommand(`give @s ${g.item} ${g.amount} ${g.data}`);
    } catch {
      return "§c渡せませんでした";
    }
  }
  player.playSound("random.orb", { location: player.location });
  return `§a${item.label} を買いました`;
}

// ---------------------------------------------------------------- 画面

/**
 * 盤面の型。
 *
 * **5 行 x 9 マス。** 上の 4 行が通貨ごとの品揃え、
 * 一番下の行が操作（戻るなど）。
 *
 * 型を変えるときは `resource_packs/game/ui/_global_variables.json` の
 * `$disable_45_slots_layout` も合わせること。**片方だけ変えると出ない。**
 */
export const CHEST_SIZE = "45";

/** 操作の行の先頭のマス。**品揃えの次の行** */
const NAV_ROW = ROW_SIZE * 4;

/** 戻るのマス。**操作の行の真ん中** */
export const SLOT_BACK = NAV_ROW + 4;

/** 種別の絵。**押す前に何の棚か分かるように** */
export const CATEGORY_ICON: Readonly<Record<Category, string>> = {
  block: "minecraft:white_wool",
  weapon: "textures/items/iron_sword",
  armor: "minecraft:iron_chestplate",
  tool: "minecraft:iron_pickaxe",
  potion: "minecraft:potion",
  special: "minecraft:ender_pearl",
};

/**
 * 盤面に出す絵を決める。
 *
 * **専用のアイテム（`game:`）は名前では出ない**ので、指定があればそちらを使う。
 * 値段の編集画面（`price.ts`）からも同じものを使う。
 */
export function iconOf(item: ShopItem, team: Team | undefined): string {
  return item.icon ?? teamVariant(item.give[0]?.item ?? "minecraft:barrier", team);
}

/**
 * 種別を選ぶ画面。
 *
 * **真ん中の行に横並びで置く。** 6 つしかないので、
 * 盤面の中央に寄せたほうが目が迷わない。
 */
function showCategories(player: Player, message?: string): void {
  const team = teamOf(player);
  const form = new ChestFormData(CHEST_SIZE).title("ショップ");

  // 真ん中の行（3 行目）の、左右に 1 マスずつ余裕を持たせた位置
  const start = ROW_SIZE * 2 + 1;
  CATEGORY_ORDER.forEach((c, i) => {
    const lore = message !== undefined && i === 0 ? [message] : [];
    form.button(start + i, `§f${CATEGORY_NAME[c]}`, lore, teamVariant(CATEGORY_ICON[c], team));
  });

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      const picked = CATEGORY_ORDER[res.selection - start];
      // **棚以外を押したときは何もしない。** 持ち物の欄も押せてしまう
      if (picked === undefined) return;
      showItems(player, picked);
    })
    .catch(() => {
      /* 画面を出せなかった。何もしない */
    });
}

/**
 * 品揃えを見せる画面。
 *
 * **通貨ごとに横一列。** 空きマスは空けたままにする
 *（`docs/spec/12-shop.md` 3-3）。
 */
function showItems(player: Player, category: Category): void {
  const grid = gridOf(category);
  const team = teamOf(player);
  const inv = player.getComponent("minecraft:inventory");
  const container = inv?.container;

  const form = new ChestFormData(CHEST_SIZE).title(`ショップ - ${CATEGORY_NAME[category]}`);

  grid.forEach((it, slot) => {
    if (it === undefined) return;
    const have = container === undefined ? 0 : countCurrency(container, it.currency);
    const units = unitsOf(it);
    const unit = priceOf(it);
    const price = unit * units;
    const lore: string[] = [];
    // **性能を先に出す。** 何を買うかは、まず性能で決める
    if (it.damage !== undefined) lore.push(`§7攻撃力  §f${it.damage}`);
    // **値段は色で買えるかどうかも示す。**
    // 手持ちの数を別の行に出すと、行が増える割に読み取ることが増えない
    lore.push(`§7値段  ${have >= price ? "§a" : "§c"}${CURRENCY_NAME_PLAIN[it.currency]} ${price} 個`);
    // **まとめ買いでも単価は同じ。** 得だと誤解させないよう、単価も出す
    if (units > 1) lore.push(`§81 個あたり ${unit}`);
    const first = it.give[0];
    form.button(slot, `§f${it.label}`, lore, iconOf(it, team), first?.amount ?? 1);
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
      // **空きマスや持ち物の欄を押しても何も起きない**
      if (picked === undefined) return;
      const msg = buy(player, picked);
      // **買ったあとも同じ棚へ戻る。** 続けて買えるほうが自然
      showItems(player, category);
      player.onScreenDisplay.setActionBar(msg);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * ショップを開ける状態か。
 *
 * **開ける条件は 3 つ**（`docs/spec/12-shop.md` 5章）。
 * ここで見るのはそのうち 2 つ。
 * 残りの「自チームの店員か」は店員側でしか分からないので、
 * `features/shop/keeper.ts` が見る。
 *
 * @returns 開けないなら理由、開けるなら `undefined`
 */
export function shopBlockedReason(player: Player): string | undefined {
  // **試合中しか買えない。** 開始前に装備が揃ってしまう
  if (!isRunning()) return "§c試合中しか買えません";
  // **所属が無いと、渡すブロックの色が決まらない。**
  // 来られない想定だが、静かに壊れてほしくない
  if (teamOf(player) === undefined) return "§cチームに参加していません";
  return undefined;
}

/** ショップを開く。**開けるかどうかは呼ぶ前に見ること** */
export function openShop(player: Player): void {
  showCategories(player);
}

// ---------------------------------------------------------------- 登録
function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerShopCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:shop",
      description: "ショップを開く",
      // **誰でも使える。** 遊ぶ人が使うものなので運営専用にしない
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      // **画面を出すのは world への操作。** 次の tick へ逃がす。
      // **コマンドからでも条件は同じ**（docs/spec/12-shop.md 5章）。
      // ここだけ素通りできると、抜け道になる
      system.run(() => {
        const blocked = shopBlockedReason(player);
        if (blocked !== undefined) {
          player.onScreenDisplay.setActionBar(blocked);
          return;
        }
        openShop(player);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
  void world;
}
