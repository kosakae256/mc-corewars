/**
 * 札を弓に出す。
 *
 * 仕様は `docs/spec/20-enchant.md` 2-1。
 *
 * ## 持ち主に付くのに、見えるのは弓
 *
 * | | |
 * | --- | --- |
 * | 持ち主 | **プレイヤー**（`state/enchant.ts`） |
 * | 見せる場所 | **弓の説明欄** |
 * | **属性** | **出さない**——プレイヤーに付くもので、弓の性能ではない |
 *
 * ## 変わったときだけ書き換える
 *
 * **毎 tick 書くと、持っているアイテムが差し替わって連射が途切れる。**
 * だから**いまの説明欄と見比べて、違うときだけ**書き戻す。
 */

import { Player, type Container, type ItemStack } from "@minecraft/server";

import { roman } from "../../lib/enchants.js";
import { held } from "../../state/enchant.js";
import { BOW } from "../bow/index.js";

/**
 * 級ごとの色（`docs/spec/20-enchant.md` 2-1）。
 *
 * **印は ✦ で統一**——形で区別しない。**色だけで分ける**（2026-08-31 決定）。
 */
const MARK = {
  legend: { color: "§b", sign: "✦" },
  rare: { color: "§d", sign: "✦" },
} as const;

/** 説明欄を組み立てる。**空なら「無し」の 1 行** */
function loreOf(player: Player): string[] {
  const list = held(player);
  if (list.length === 0) return ["§8エンチャント無し"];

  // **legendary を上に**——ビルドの顔が先に目に入るように
  const sorted = [...list].sort((a, b) => (a.def.grade === b.def.grade ? 0 : a.def.grade === "legend" ? -1 : 1));
  return sorted.map((h) => {
    const m = MARK[h.def.grade];
    return `${m.color}${m.sign} ${h.def.name} ${roman(h.lv)}§8 ${h.def.text(h.lv)}`;
  });
}

/** 名前の色。**legendary を 1 枚でも持っていれば水色**、無ければピンク */
function nameOf(player: Player): string {
  return held(player).some((h) => h.def.grade === "legend") ? "§b弓" : "§d弓";
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/** その 1 本を書き換える。**変わっていなければ何もしない** */
function apply(container: Container, slot: number, item: ItemStack, lore: string[], name: string): void {
  if (same(item.getLore(), lore) && item.nameTag === name) return;
  try {
    item.setLore(lore);
    item.nameTag = name;
    container.setItem(slot, item);
  } catch {
    /* 消えている */
  }
}

/** その人の持ち物にある弓を、全部そろえる */
export function refresh(player: Player): void {
  let container: Container | undefined;
  try {
    container = player.getComponent("minecraft:inventory")?.container;
  } catch {
    return;
  }
  if (container === undefined) return;

  const lore = loreOf(player);
  const name = nameOf(player);
  for (let slot = 0; slot < container.size; slot++) {
    let item: ItemStack | undefined;
    try {
      item = container.getItem(slot);
    } catch {
      continue;
    }
    if (item?.typeId !== BOW) continue;
    apply(container, slot, item, lore, name);
  }
}
