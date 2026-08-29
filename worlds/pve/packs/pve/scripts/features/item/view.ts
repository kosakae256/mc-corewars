/**
 * 武器の名前と説明欄を作り直す。
 *
 * 仕様は `docs/spec/18-item-view.md`。
 *
 * ## 組み立ては 1 か所
 *
 * **名前も説明欄も、同じ関数が作り直す**——
 * **片方だけ古い**が起きない（属性を付けたのに説明欄が前のまま、など）。
 *
 * ## 一覧の引き方
 *
 * **武器の中身は職業ごとの一覧**（`docs/spec/11-structure.md` 2-1）。
 * ここは**識別子から引くだけ。** 職業が増えたら `LISTS` に 1 行足す。
 */

import type { ItemStack } from "@minecraft/server";

import { ELEMENT_INFO, elementIcon, sortElements, type Element } from "../../lib/element.js";
import { loreLines } from "../../lib/lore.js";
import { rarityColor, type Rarity } from "../../lib/rarity.js";
import { FULL_CHARGE_TICKS } from "../../lib/charge.js";
import { elementsOf } from "../../state/item-element.js";
import { enchantsOf } from "../../state/item-enchant.js";
import { ENCHANT_LIST } from "../bow/enchants/list.js";
import { BOWS } from "../bow/weapons.js";

/** 説明欄に要る分だけ。**職業ごとの一覧から、この形に写す** */
interface WeaponInfo {
  readonly label: string;
  readonly base: number;
  readonly rarity: Rarity;
  readonly fullTicks: number;
  readonly effect?: string;
  readonly about?: string;
}

/** 引ける一覧。**職業が増えたらここに足す** */
const LISTS: readonly (readonly { item: string; info: WeaponInfo }[])[] = [
  BOWS.map((b) => ({
    item: b.item,
    info: {
      label: b.label,
      base: b.base,
      rarity: b.rarity,
      fullTicks: b.fullTicks ?? FULL_CHARGE_TICKS,
      effect: b.effect,
      about: b.about,
    },
  })),
];

/** その識別子の武器。**知らないものは undefined** */
export function weaponInfo(typeId: string): WeaponInfo | undefined {
  for (const list of LISTS) {
    const found = list.find((x) => x.item === typeId);
    if (found !== undefined) return found.info;
  }
  return undefined;
}

/** ローマ数字（段。**5 までしか要らない**） */
const ROMAN = ["I", "II", "III", "IV", "V"] as const;

/**
 * 説明欄に出すエンチャントの行（`docs/spec/20-enchants.md` 1 章）。
 *
 * ```
 * ✦ 強撃 III
 * ```
 */
function enchantLines(item: ItemStack): string[] {
  const have = enchantsOf(item);
  if (have.length === 0) return [];
  const out: string[] = [];
  for (const info of ENCHANT_LIST) {
    const found = have.find((e) => e.key === info.key);
    if (found === undefined) continue;
    const grade = info.max > 1 ? ` ${ROMAN[Math.min(5, found.level) - 1] ?? found.level}` : "";
    out.push(`${info.label}${grade}`);
  }
  return out;
}

/** 属性の 1 行（`§b🜄 水  §c🜂 火`） */
function elementRow(list: readonly Element[]): string | undefined {
  if (list.length === 0) return undefined;
  return sortElements(list)
    .map((e) => `${elementIcon(e)} ${ELEMENT_INFO[e].color}${ELEMENT_INFO[e].label}`)
    .join("  ");
}

/**
 * 名前と説明欄を作り直す。
 *
 * **属性を変えたとき・配ったときに呼ぶ**（`docs/spec/18-item-view.md` 4 章）。
 */
export function refreshItem(item: ItemStack): void {
  const info = weaponInfo(item.typeId);
  if (info === undefined) return;
  const elements = elementsOf(item);

  try {
    // **名前はレア度の色だけ**（2026-08-29 変更）。
    //
    // 属性の印は**説明欄に出る**ので、名前に重ねると**同じことを 2 回**言うことになる
    item.nameTag = `${rarityColor(info.rarity)}${info.label}`;
    item.setLore(
      loreLines({
        rarity: info.rarity,
        attack: info.base,
        fullTicks: info.fullTicks,
        elements: elementRow(elements),
        effect: info.effect,
        about: info.about,
        // **付いている順ではなく、一覧の順に並べる**（毎回同じ並びにする）
        enchants: enchantLines(item),
      })
    );
  } catch {
    /* 使えない持ち物 */
  }
}
