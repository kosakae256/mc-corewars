/**
 * ステータスの本。**持つと説明欄に出るだけ。**
 *
 * 仕様は `docs/spec/12-element.md` 3-1。
 *
 * ## 開かせない
 *
 * **画面を出すと、遊びが止まる。**
 * **弓と同じで、手に持って（あるいは合わせて）見えれば十分。**
 *
 * | 出すもの | どこから |
 * | --- | --- |
 * | **HP** | `state/hp.ts` |
 * | **クリティカル率・倍率** | `lib/attack.ts` |
 * | **属性値 5 つ** | `state/element.ts` |
 * | 撃つ間隔 | `lib/attack.ts` |
 *
 * **エンチャントは出さない**——**あれは弓の説明欄**（`features/enchant/view.ts`）。
 *
 * **中身が変わったときだけ書き換える**（毎 tick 書くと持ち物が差し替わる）。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  ItemStack,
  Player,
  system,
  world,
  type Container,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { critMult, critRate, intervalRate } from "../../lib/attack.js";
import * as el from "../../state/element.js";
import { current as hpNow, max as hpMax } from "../../state/hp.js";

/** 本の識別子（`behavior_packs/pve_v2/items/sheet.json`） */
export const SHEET = "pve_v2:sheet";

/** 属性ごとの色。**見分けが付くように** */
const COLOR: Record<el.Element, string> = {
  fire: "§c",
  thunder: "§e",
  wind: "§a",
  water: "§9",
  ice: "§b",
};

function lineOf(player: Player): string[] {
  const now = Math.round(hpNow(player) ?? 0);
  const cap = Math.round(hpMax(player) ?? 0);
  const rate = Math.round(critRate(player) * 100);
  const mult = critMult(player).toFixed(1);
  const gap = (intervalRate(player, system.currentTick) * 0.5).toFixed(2);

  const elements = el.ELEMENTS.map((k) => {
    const v = el.get(player, k);
    const color = v > 0 ? COLOR[k] : "§8";
    return `${color}${el.EL_NAME[k]} ${String(v).padStart(2, " ")}`;
  });

  return [
    `§7HP §f${now} §8/ ${cap}`,
    `§7クリ §f${rate}％ §8× §f${mult}`,
    `§7間隔 §f${gap} 秒`,
    "§8────────",
    elements.slice(0, 3).join("§8 / "),
    elements.slice(3).join("§8 / "),
    `§8合計 ${el.total(player)} §8/ ${el.EL_MAX * 5}`,
  ];
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

/** 持ち物の本をそろえる。**変わっていなければ何もしない** */
export function refresh(player: Player): void {
  let container: Container | undefined;
  try {
    container = player.getComponent("minecraft:inventory")?.container;
  } catch {
    return;
  }
  if (container === undefined) return;

  const lore = lineOf(player);
  for (let slot = 0; slot < container.size; slot++) {
    let item: ItemStack | undefined;
    try {
      item = container.getItem(slot);
    } catch {
      continue;
    }
    if (item?.typeId !== SHEET) continue;
    if (same(item.getLore(), lore)) continue;
    try {
      item.setLore(lore);
      container.setItem(slot, item);
    } catch {
      /* 消えている */
    }
  }
}

function tick(): void {
  for (const player of world.getAllPlayers()) refresh(player);
}

function sheetCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:sheet",
      description: "ステータスの本を配る",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        try {
          player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(SHEET, 1));
          refresh(player);
          player.sendMessage("§7ステータスの本を配った");
        } catch (err) {
          player.sendMessage(`§c配れなかった §8${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const sheet: Feature = {
  name: "sheet",
  tick: { every: 20, run: tick },
  commands: [sheetCommand],
};
