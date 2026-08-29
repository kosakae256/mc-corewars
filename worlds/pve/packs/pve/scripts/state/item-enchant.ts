/**
 * その 1 本に付いたエンチャント。
 *
 * 仕様は `docs/spec/20-enchants.md` 4 章。
 *
 * ## 属性と同じ持ち方
 *
 * **アイテムの動的プロパティ**（`docs/spec/17-element.md` 1 章）。
 * **持ち替えても、落としても、その 1 本に付いて回る。**
 *
 * ```
 * power:3,pierce:1
 * ```
 *
 * **名前と段を `:` で繋ぎ、`,` で並べる。**
 * 同じ名前は 1 つだけ——**段が上がるだけ**（同 1 章）。
 */

import type { ItemStack } from "@minecraft/server";

import { KEYS } from "./keys.js";
import { ENCHANT_LIST, type EnchantKey } from "../features/bow/enchants/list.js";

/** 付いているエンチャント 1 つ */
export interface Enchant {
  readonly key: EnchantKey;
  /** 段（1〜上限） */
  readonly level: number;
}

/** その名前は在るか */
export function isEnchantKey(value: string): value is EnchantKey {
  return ENCHANT_LIST.some((e) => e.key === value);
}

/** 段の上限。**知らない名前なら 1** */
export function maxLevel(key: EnchantKey): number {
  return ENCHANT_LIST.find((e) => e.key === key)?.max ?? 1;
}

/** 保存した形から戻す。**知らない名前と、外れた段は捨てる** */
export function unpackEnchants(value: unknown): Enchant[] {
  if (typeof value !== "string" || value.length === 0) return [];
  const out: Enchant[] = [];
  for (const part of value.split(",")) {
    const [key, lv] = part.split(":");
    if (key === undefined || !isEnchantKey(key)) continue;
    const level = Math.max(1, Math.min(maxLevel(key), Number(lv ?? 1)));
    if (!Number.isFinite(level)) continue;
    if (out.some((e) => e.key === key)) continue;
    out.push({ key, level });
  }
  return out;
}

/** 保存する形 */
export function packEnchants(list: readonly Enchant[]): string {
  return list.map((e) => `${e.key}:${e.level}`).join(",");
}

/** その 1 本に付いているもの */
export function enchantsOf(item: ItemStack | undefined): Enchant[] {
  if (item === undefined) return [];
  try {
    return unpackEnchants(item.getDynamicProperty(KEYS.enchants));
  } catch {
    return [];
  }
}

/**
 * 書き込む。
 *
 * **見た目（説明欄）は作らない**——それは `features/item/view.ts` の仕事
 *（`docs/spec/18-item-view.md` 4 章）。**書いたら、あちらを呼ぶ。**
 */
export function setEnchants(item: ItemStack, list: readonly Enchant[]): void {
  try {
    item.setDynamicProperty(KEYS.enchants, list.length === 0 ? undefined : packEnchants(list));
  } catch {
    /* 使えない持ち物 */
  }
}

/**
 * 1 つ足す／段を変える／外す。
 *
 * @param level 0 なら**外す**
 */
export function withEnchant(list: readonly Enchant[], key: EnchantKey, level: number): Enchant[] {
  const rest = list.filter((e) => e.key !== key);
  if (level <= 0) return rest;
  return [...rest, { key, level: Math.max(1, Math.min(maxLevel(key), Math.floor(level))) }];
}

/** その段。**付いていなければ 0** */
export function levelOf(list: readonly Enchant[], key: EnchantKey): number {
  return list.find((e) => e.key === key)?.level ?? 0;
}
