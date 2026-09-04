/**
 * ショップの画面。
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md`。
 *
 * ```
 * 売り子を右クリック
 *   └ ショップ  … 4 本を一覧 → 選ぶと本数の画面
 *   └ 1 本売り  … いきなり本数の画面
 * ```
 *
 * **買えるのは休憩所に居るときだけ**（`docs/spec/17-state.md` 3 章）。
 */

import type { Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { STATS, isMaxed, nextCost, type StatKey } from "../../core/growth.js";
import { VENDORS, type VendorKind } from "../../core/shop.js";
import { emeraldOf, levelOf } from "../../state/growth.js";
import { buy, valueOf } from "../../services/growth.js";

/** 一度に買える本数の選択肢 */
const LOTS: readonly number[] = [1, 5, 40];

function show(key: StatKey, value: number): string {
  return value.toFixed(STATS[key].digits);
}

/** その 1 本の、いまの様子 */
function line(player: Player, key: StatKey): string {
  const lv = levelOf(player, key);
  const price = nextCost(key, lv);
  const tail = price === undefined ? "§8上限" : `§7次 §a${price}`;
  return `§f${STATS[key].label} §7${show(key, valueOf(player, key))} §8(${lv}/${STATS[key].maxLevel})  ${tail}`;
}

/** 本数を選ぶ画面 */
async function askAmount(player: Player, key: StatKey): Promise<void> {
  const form = new ActionFormData()
    .title(`${STATS[key].label} の強化`)
    .body(`${line(player, key)}\n§7手持ち §a${emeraldOf(player)}`);
  for (const n of LOTS) form.button(`§f${n} 回買う`);
  form.button("§8やめる");

  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  const times = LOTS[res.selection];
  if (times === undefined) return;

  const before = levelOf(player, key);
  const r = buy(player, key, times);
  if (r.bought === 0) {
    const why = isMaxed(key, before) ? "上限に達している" : "エメラルドが足りない";
    player.sendMessage(`§c買えなかった §8${why}`);
    return;
  }
  player.playSound("random.orb", { volume: 0.5, pitch: 1.2 });
  player.sendMessage(
    `§7${STATS[key].label} §f${show(key, r.value)}§7 §8(${r.level}/${STATS[key].maxLevel})` +
      ` §7— §a-${r.spent}§7（残り §a${r.left}§7）`
  );
}

/** 4 本を一覧にする画面 */
async function askStat(player: Player): Promise<void> {
  const keys = VENDORS.filter((v): v is StatKey => v !== "shop" && v !== "role");
  const form = new ActionFormData().title("ショップ（仮）").body(`§7手持ち §a${emeraldOf(player)}§7 エメラルド`);
  for (const key of keys) form.button(line(player, key));
  form.button("§8やめる");

  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  const key = keys[res.selection];
  if (key === undefined) return;
  await askAmount(player, key);
}

/** 売り子を開く。**職業の村人はここではない**（`features/role/`） */
export function openVendor(player: Player, kind: VendorKind): void {
  if (kind === "role") return;
  const run = kind === "shop" ? askStat(player) : askAmount(player, kind);
  run.catch((err: unknown) => {
    console.warn(`[shop] ${String(err)}`);
  });
}
