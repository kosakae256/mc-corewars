/**
 * ロール管理の画面。**使えるロールを絞る。**
 *
 * 仕様は `docs/spec/19-admin-menu.md` 10 章。
 *
 * ## なぜ要るのか
 *
 * **壊れているロールが見つかったとき、直すまで待てない。**
 *
 * 買った人から取り上げられないので、止められないと**使われ続ける。**
 * **点は返さない。** 止めるのは「使えるかどうか」だけ。
 *
 * ## 中身を知らない
 *
 * **並べるのは `lib/roles.ts` の一覧そのまま。**
 * ロールを足せば**そのまま並ぶ。**
 */

import { world, type Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import {
  KIND_COLOR,
  ROLES,
  ROLE_ORDER,
  disabledRoles,
  enableAllRoles,
  roleEnabled,
  roleOf,
  setRoleEnabled,
} from "../../lib/roles.js";
import { evictRole } from "../role/change.js";

/** いまそのロールで居る人の数。**止めると何人動くかを先に見せる** */
function usersOf(id: (typeof ROLE_ORDER)[number]): number {
  let n = 0;
  for (const p of world.getAllPlayers()) if (roleOf(p).id === id) n += 1;
  return n;
}

/**
 * ロール管理を開く。
 *
 * @param back 「戻る」で帰る先
 */
export function showRoleAdmin(player: Player, back: (p: Player) => void): void {
  const off = disabledRoles();

  const form = new ActionFormData()
    .title("ロール管理")
    .body(
      off.size === 0
        ? "§f全部のロールが使えます\n§f押すと、そのロールを止められます"
        : `§c使用停止  §f${off.size} 個\n§f押すと切り替わります`
    );

  for (const id of ROLE_ORDER) {
    const role = ROLES[id];
    const on = roleEnabled(id);
    const users = usersOf(id);
    // ---- **Swift は切れない**（戻す先だから）
    //
    // ボタンは並べたままにする。**抜くと番号がずれて、押す場所が変わる**
    const state = id === "swift" ? "§7常に使える" : on ? "§a使用可" : "§c使用停止";
    const who = users > 0 ? `  §e${users}人が使用中` : "";
    form.button(`${KIND_COLOR[role.kind]}${role.name}\n${state}${who}`, role.icon);
  }

  form.button("§a全部使えるようにする", "textures/items/emerald");
  form.button("§e戻る", "textures/items/arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      const i = res.selection;

      // ---- 戻る
      if (i === ROLE_ORDER.length + 1) {
        back(player);
        return;
      }

      // ---- 全部使えるようにする
      if (i === ROLE_ORDER.length) {
        enableAllRoles();
        player.sendMessage("§a全部のロールを使えるようにした");
        showRoleAdmin(player, back);
        return;
      }

      const id = ROLE_ORDER[i];
      if (id === undefined) return;

      if (id === "swift") {
        player.sendMessage("§7Swift は止められません（戻す先なので）");
        showRoleAdmin(player, back);
        return;
      }

      const next = !roleEnabled(id);
      setRoleEnabled(id, next);

      if (next) {
        player.sendMessage(`§a${ROLES[id].name} を使えるようにした`);
      } else {
        // **止めた瞬間に、そのロールで居る人を戻す。** 倒さない
        const moved = evictRole(id);
        player.sendMessage(
          `§c${ROLES[id].name} を使用停止にした` + (moved > 0 ? `§7（${moved} 人を Swift に戻した）` : "")
        );
      }
      showRoleAdmin(player, back);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}
