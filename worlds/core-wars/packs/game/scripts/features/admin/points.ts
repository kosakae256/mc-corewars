/**
 * 点を配る・取り上げる。
 *
 * 仕様は `docs/spec/24-role.md` 3-2-A、`docs/spec/19-admin-menu.md` 6-B。
 *
 * ## なぜ要るのか
 *
 * **1 試合で入る点は数点しかない。**
 * 250 点のロールを確かめるのに、**何十試合も回すことになる。**
 *
 * > 配れないと、**作ったものを誰も見られないまま**になる。
 *
 * ## 黙って増減させない
 *
 * **もらった側にも出す。**
 * 点は本人のものなので、**変わったことを本人が知らないのはおかしい。**
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Player,
} from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { givePoints, pointsOf } from "../../lib/roles.js";
import { isOp } from "../../lib/op.js";

/** 打ち込む欄の説明 */
const HINT = "正の数で足す / 負の数で取り上げる";

/**
 * 点を配る画面。
 *
 * @param targetId 渡す相手。**省くと全員**
 * @param back 閉じたあとに戻る先
 */
export function showPoints(admin: Player, targetId: string | undefined, back: (p: Player) => void): void {
  if (!isOp(admin)) return;

  const target = targetId === undefined ? undefined : world.getAllPlayers().find((p) => p.id === targetId);
  if (targetId !== undefined && target === undefined) {
    admin.sendMessage("§7その人はもう居ません");
    back(admin);
    return;
  }

  const who = target === undefined ? "全員" : target.name;
  const now = target === undefined ? undefined : pointsOf(target);

  new ModalFormData()
    .title(`ポイント  §7${who}`)
    .textField(now === undefined ? `${who}に渡す点\n§7${HINT}` : `いま §e${now}P§r\n§7${HINT}`, "例: 500", {
      defaultValue: "500",
    })
    .submitButton("渡す")
    .show(admin)
    .then((res) => {
      if (res.canceled || res.formValues === undefined) {
        back(admin);
        return;
      }
      const raw = res.formValues[0];
      const n = typeof raw === "string" ? Number.parseInt(raw.trim(), 10) : Number.NaN;
      if (!Number.isFinite(n) || n === 0) {
        admin.sendMessage("§c数を入れてください");
        back(admin);
        return;
      }
      apply(admin, target, n);
      back(admin);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** 実際に渡す */
function apply(admin: Player, target: Player | undefined, n: number): void {
  const list = target === undefined ? world.getAllPlayers() : [target];
  for (const p of list) {
    const left = givePoints(p, n);
    // **本人にも出す。** 黙って増減させない
    p.sendMessage(n > 0 ? `§aポイント +${n} §7(いま ${left}P)` : `§cポイント ${n} §7(いま ${left}P)`);
  }
  const who = target === undefined ? `${list.length} 人` : target.name;
  admin.sendMessage(n > 0 ? `§f${who} に §e${n}P§f を渡した` : `§f${who} から §e${-n}P§f を取り上げた`);
}

/**
 * コマンドからも渡せるようにする。
 *
 * **画面を開かずに済む。** 名前を省くと**全員**。
 *
 * `system.beforeEvents.startup` の中から呼ぶこと。
 */
export function registerPointsCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:points",
      description: "ロールの点を渡す。負の数で取り上げる（運営のみ）",
      permissionLevel: CommandPermissionLevel.Admin,
      mandatoryParameters: [{ name: "点", type: CustomCommandParamType.Integer }],
      optionalParameters: [{ name: "名前", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, n: number, name?: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      const admin = e?.typeId === "minecraft:player" ? (e as Player) : undefined;
      if (admin === undefined) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      if (n === 0) return { status: CustomCommandStatus.Failure, message: "0 では何も変わらない" };

      system.run(() => {
        if (name === undefined) {
          apply(admin, undefined, n);
          return;
        }
        const want = name.trim().toLowerCase();
        const target = world.getAllPlayers().find((p) => p.name.toLowerCase() === want);
        if (target === undefined) {
          admin.sendMessage(`§c「${name}」が見つかりません`);
          return;
        }
        apply(admin, target, n);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
