/**
 * 武器 1 本に付いた属性。
 *
 * 仕様は `docs/spec/17-element.md` 1 章・5-1。
 *
 * ## 「その 1 本」に付く
 *
 * **同じ種類の弓でも、別の 1 本には付かない。**
 * アイテムの動的プロパティに書くので、**持ち替えても付いて回る。**
 *
 * > 落ちているアイテムや、チェストの中でも同じものが保たれる。
 * > **種類（typeId）に付けてはいけない**——全部の弓に付いてしまう。
 */

import type { ItemStack } from "@minecraft/server";

import { KEYS } from "./keys.js";
import { packElements, unpackElements, type Element } from "../lib/element.js";

/** その 1 本に付いている属性 */
export function elementsOf(item: ItemStack | undefined): Element[] {
  if (item === undefined) return [];
  try {
    return unpackElements(item.getDynamicProperty(KEYS.elements));
  } catch {
    return [];
  }
}

/**
 * 属性を書き込む。
 *
 * **見た目（名前・説明欄）は作らない**——それは `features/item/view.ts` の仕事
 *（`docs/spec/18-item-view.md` 4 章）。**書いたら、あちらを呼ぶ。**
 */
export function setElements(item: ItemStack, list: readonly Element[]): void {
  try {
    item.setDynamicProperty(KEYS.elements, list.length === 0 ? undefined : packElements(list));
  } catch {
    /* 使えない持ち物 */
  }
}
