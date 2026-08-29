/**
 * 手に持っているものにエンチャントを付ける。**試験用。**
 *
 * 仕様は `docs/spec/20-enchants.md` 5 章。
 *
 * ```
 * /pve:ench power 3      強撃 III を付ける
 * /pve:ench spread       段を書かなければ 1
 * /pve:ench power 0      その 1 つを外す
 * /pve:ench clear        全部外す
 * /pve:ench list         付けられる名前を並べる
 * ```
 *
 * **拾ったときに付く仕組みはまだ無い**（同 7 章）。
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import { enchantsOf, isEnchantKey, maxLevel, setEnchants, withEnchant } from "../../../state/item-enchant.js";
import { refreshItem } from "../../item/view.js";
import { ENCHANT_LIST } from "./list.js";

/** 付けられる名前を並べる。**段の上限も一緒に** */
function listAll(player: Player): void {
  const common = ENCHANT_LIST.filter((e) => e.scope === "common");
  const bow = ENCHANT_LIST.filter((e) => e.scope === "bow");
  const show = (e: (typeof ENCHANT_LIST)[number]): string => `§f${e.key}§8(${e.label}/1-${e.max})`;
  player.sendMessage(`§7共通: ${common.map(show).join(" ")}`);
  player.sendMessage(`§7弓: ${bow.map(show).join(" ")}`);
}

export function enchantCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:ench",
      description: "手に持っている武器にエンチャントを付ける（試用）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "名前", type: CustomCommandParamType.String }],
      optionalParameters: [{ name: "段", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, name: string, level?: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      const word = name.toLowerCase();

      if (word === "list") {
        system.run(() => listAll(player));
        return { status: CustomCommandStatus.Success };
      }
      if (word !== "clear" && !isEnchantKey(word)) {
        return {
          status: CustomCommandStatus.Failure,
          message: "その名前は無い（/pve:ench list で一覧）",
        };
      }

      system.run(() => {
        const container = player.getComponent("minecraft:inventory")?.container;
        const item = container?.getItem(player.selectedSlotIndex);
        if (container === undefined || item === undefined) {
          player.sendMessage("§c手に何も持っていない");
          return;
        }

        const now = enchantsOf(item);
        if (word === "clear") {
          setEnchants(item, []);
        } else if (isEnchantKey(word)) {
          // **段を書かなければ 1。** 上限は一覧が持っている
          const want = level ?? 1;
          setEnchants(item, withEnchant(now, word, want));
        }

        // **名前と説明欄は 1 か所で作る**（`docs/spec/18-item-view.md` 4 章）
        refreshItem(item);
        container.setItem(player.selectedSlotIndex, item);

        const after = enchantsOf(item);
        const shown =
          after.length === 0
            ? "なし"
            : after
                .map((x) => {
                  const info = ENCHANT_LIST.find((i) => i.key === x.key);
                  return `${info?.label ?? x.key}${(info?.max ?? 1) > 1 ? ` ${x.level}` : ""}`;
                })
                .join("・");
        player.sendMessage(`§7エンチャント: §f${shown}`);
        if (isEnchantKey(word) && (level ?? 1) > maxLevel(word)) {
          player.sendMessage(`§8（${word} の上限は ${maxLevel(word)}）`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
