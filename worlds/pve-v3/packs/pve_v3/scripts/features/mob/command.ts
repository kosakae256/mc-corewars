/**
 * モブまわりのコマンド。**確かめるための道具。**
 *
 * ```
 * /pve:hp            自分の HP を見る
 * /pve:ally          味方の的を出す
 * /pve:spawn [数]    確認用のモブを出す
 * ```
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import type { CommandDef } from "../../types.js";
import { maxHpOf } from "../../services/growth.js";
import { current, damage as cutHp, has, max, setup } from "../../state/hp.js";
import { KEYS } from "../../state/keys.js";
import { setLabel } from "../../state/label.js";
import { enemies as mobs } from "../../services/field.js";
import { ALLY, ALLY_HP, ALLY_LABEL, MOB, MOB_HP, MOB_LABEL, SPAWN_MAX } from "./index.js";

/**
 * 最大 HP を置く（試作）。
 *
 * ```
 * /pve:hp 500
 * ```
 */
function hpCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:hp",
      description: "最大 HP を置く（試作）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "値", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, value: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      const want = Math.max(1, Math.min(1000, Math.round(value)));
      system.run(() => {
        try {
          player.setDynamicProperty(KEYS.hpBase, want);
          player.sendMessage(`§7最大 HP を §f${want}§7 にした`);
        } catch (err) {
          player.sendMessage(`§c${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * 味方の的を置く（確認用）。
 *
 * ```
 * /pve:ally        1 体
 * /pve:ally 3      3 体
 * ```
 *
 * **HP を半分にして**出す——回復が入ったかどうかが見えるように。
 * **矢は素通りする**（`features/bow/shoot.ts` の `isAlly`）。
 */
function allyCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:ally",
      description: "味方の的を置く（確認用・HP 半分）",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "数", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, count?: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      const many = count !== undefined && count > 0 ? Math.min(5, Math.round(count)) : 1;
      system.run(() => {
        const at = player.location;
        let n = 0;
        let why = "";
        for (let i = 0; i < many; i++) {
          const a = (i / many) * Math.PI * 2;
          try {
            const ally = player.dimension.spawnEntity(ALLY, {
              x: at.x + Math.cos(a) * 3,
              y: at.y + 1,
              z: at.z + Math.sin(a) * 3,
            });
            setup(ally, ALLY_HP);
            // **半分減らしておく**
            cutHp(ally, ALLY_HP / 2);
            setLabel(ally, ALLY_LABEL);
            n++;
          } catch (err) {
            why = String(err);
          }
        }
        player.sendMessage(
          n > 0 ? `§7味方を ${n} 体置いた §8HP ${ALLY_HP / 2} / ${ALLY_HP}` : `§c置けなかった §8${why}`
        );
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function spawnCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:spawn",
      description: "モブを湧かせる（試用。HP と数を指定できる）",
      permissionLevel: CommandPermissionLevel.Any,
      // **省略できる**——`/pve:spawn` だけで既定の HP・5 体
      optionalParameters: [
        { name: "HP", type: CustomCommandParamType.Integer },
        { name: "数", type: CustomCommandParamType.Integer },
      ],
    },
    (origin: CustomCommandOrigin, hp?: number, count?: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      // **1 以上に収める**（0 や負を渡されても壊れないように）
      const life = hp !== undefined && hp > 0 ? Math.round(hp) : MOB_HP;
      const many = count !== undefined && count > 0 ? Math.min(SPAWN_MAX, Math.round(count)) : 5;
      system.run(() => {
        const at = player.location;
        let n = 0;
        let why = "";
        for (let i = 0; i < many && mobs().length < SPAWN_MAX; i++) {
          const a = (i / many) * Math.PI * 2;
          try {
            const mob = player.dimension.spawnEntity(MOB, {
              x: at.x + Math.cos(a) * 4,
              y: at.y + 1,
              z: at.z + Math.sin(a) * 4,
            });
            setup(mob, life);
            setLabel(mob, MOB_LABEL);
            n++;
          } catch (err) {
            // **黙って諦めない**——湧かないときに、
            // **定義が読めていないのか、場所が悪いのか**が分からない
            why = String(err);
          }
        }
        player.sendMessage(n > 0 ? `§7${n} 体湧かせた §8HP ${life}` : `§c湧かせられなかった §8${why}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const mobCommands: readonly CommandDef[] = [hpCommand, allyCommand, spawnCommand];
