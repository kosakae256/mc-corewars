/**
 * ロールを選ぶ盤面。**チェストの見た目で出す。**
 *
 * 仕様は `worlds/pve-v3/docs/01-roles.md`。
 *
 * | | |
 * | --- | --- |
 * | **大きさ** | **27（縦 3 × 横 9）** |
 * | **持ち物欄** | 出さない（`vendor/chest-ui/constants.js`） |
 * | **並び** | 真ん中の段に 6 つ。**選べないものは灰色** |
 */

import type { Player } from "@minecraft/server";

import { ROLES, ROLE_ORDER, type RoleId } from "../../core/roles.js";
import { roleOf, setRole } from "../../state/role.js";
// **持ってきた道具**（`worlds/core-wars` から）。型は `forms.d.ts`
import { ChestFormData } from "../../vendor/chest-ui/forms.js";

/** 並べ始める枠。**真ん中の段の左から 2 つ目** */
const FIRST_SLOT = 10;

/** 閉じる枠 */
const CLOSE_SLOT = 22;

/** 枠の番号 → ロール */
function roleAtSlot(slot: number): RoleId | undefined {
  const index = slot - FIRST_SLOT;
  if (index < 0 || index >= ROLE_ORDER.length) return undefined;
  return ROLE_ORDER[index];
}

/** 盤面を出す */
export function openRoleBoard(player: Player): void {
  const now = roleOf(player);
  const form = new ChestFormData("27").title("§8職業を選ぶ");

  for (let i = 0; i < ROLE_ORDER.length; i++) {
    const id = ROLE_ORDER[i];
    if (id === undefined) continue;
    const def = ROLES[id];
    const chosen = id === now;
    const head = `${chosen ? "§a▶ " : def.ready ? "§f" : "§8"}${def.name}`;
    const lore = [`§7${def.summary}`, "", ...def.lore];
    if (chosen) lore.push("", "§aいま選んでいる");
    form.button(FIRST_SLOT + i, head, lore, def.icon, 1, 0, chosen);
  }
  form.button(CLOSE_SLOT, "§7閉じる", [], "minecraft:barrier");

  form
    .show(player)
    .then((res: { canceled?: boolean; selection?: number }) => {
      if (res.canceled === true || res.selection === undefined) return;
      if (res.selection === CLOSE_SLOT) return;
      const id = roleAtSlot(res.selection);
      if (id === undefined) return;
      const def = ROLES[id];
      if (!def.ready) {
        player.sendMessage(`§c${def.name} §7はまだ作っていない §8（左クリックの仕組みが要る）`);
        player.playSound("note.bass", { volume: 0.5, pitch: 0.7 });
        return;
      }
      setRole(player, id);
      player.sendMessage(`§7職業を §f${def.name}§7 にした`);
      player.playSound("random.levelup", { volume: 0.5, pitch: 1.2 });
    })
    .catch((err: unknown) => {
      console.warn(`[role] ${String(err)}`);
    });
}
