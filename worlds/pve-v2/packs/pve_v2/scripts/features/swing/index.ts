/**
 * 腕の振りを拾えるか確かめる係。**確認用。**
 *
 * > ### 左クリックでスキルを撃てるか？
 * >
 * > Script API v2 に **`world.afterEvents.playerSwingStart`** がある。
 * > **振った理由（`swingSource`）まで分かる**——
 * > `Attack`（何も無い所を殴る／敵を殴る）・`Mine`・`Build`・`Interact`・`UseItem` ほか。
 * >
 * > **これが空振りでも飛ぶなら、左クリック＝スキルにできる。**
 *
 * ```
 * /pve:swing     入／切
 * ```
 *
 * 入れている間、**振るたびに**画面下に理由が出て、**目の前に粒が出る。**
 * **中身ができたら消してよい**（確認のためだけの機能）。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  EntitySwingSource,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import type { Feature } from "../../types.js";

/** 見ている人（**入れた人だけ**） */
const watching = new Set<string>();

/** 何回振ったか（理由ごと） */
const counted = new Map<string, number>();

function subscribe(): void {
  world.afterEvents.playerSwingStart.subscribe((ev) => {
    const player = ev.player;
    if (!watching.has(player.id)) return;

    const why = ev.swingSource;
    const key = `${player.id}/${why}`;
    const n = (counted.get(key) ?? 0) + 1;
    counted.set(key, n);

    const held = ev.heldItemStack?.typeId ?? "手ぶら";
    // **攻撃だけ色を変える**（見分けやすいように）
    const color = why === EntitySwingSource.Attack ? "§a" : "§7";
    player.onScreenDisplay.setActionBar(`${color}${why}§7 × ${n}  §8${held}`);

    // **目の前に印を出す**（本当に振った瞬間か、目で見て分かるように）
    try {
      const at = player.getHeadLocation();
      const dir = player.getViewDirection();
      player.dimension.spawnParticle(why === EntitySwingSource.Attack ? "pve_v2:glow_thunder" : "pve_v2:glow_water", {
        x: at.x + dir.x * 1.4,
        y: at.y + dir.y * 1.4,
        z: at.z + dir.z * 1.4,
      });
      player.playSound("random.orb", { volume: 0.4, pitch: why === EntitySwingSource.Attack ? 1.6 : 1.0 });
    } catch {
      /* 消えている */
    }
  });
}

function command(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:swing",
      description: "腕の振りを拾えるか確かめる（入／切）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        if (watching.delete(player.id)) {
          player.sendMessage("§7腕の振りを見るのをやめた");
          return;
        }
        watching.add(player.id);
        player.sendMessage("§a腕の振りを見る§7：左クリック（空振りでも）で理由が出るか確かめる");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const swing: Feature = {
  name: "swing",
  subscribe,
  commands: [command],
};
