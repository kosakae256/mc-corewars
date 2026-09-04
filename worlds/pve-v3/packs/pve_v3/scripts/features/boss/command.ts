/**
 * 飛竜を呼ぶ・切り替える・確かめる。**運営の道具。**
 *
 * ```
 * /pve:boss [HP] [呪い]  いま見ている先に呼ぶ（**素なら HP 6000・倍速**）
 * /pve:bossfly       飛ぶ / 降りるを切り替える
 * /pve:bossacts      攻撃表を出す
 * /pve:bosscurse <倍率>  **呪い**（速さの倍率）を掛ける。2 で倍速
 * ```
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

import type { CommandDef } from "../../types.js";
import { ACTS } from "../../core/boss.js";
import { setup } from "../../state/hp.js";
import { setHaste } from "./curse.js";
import { setLabel } from "../../state/label.js";
import { BOSS_CURSE, BOSS_HP, bosses, LABEL, WYVERN } from "./index.js";

function spawnCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:boss",
      description: "飛竜を呼ぶ（試作）",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [
        { name: "HP", type: CustomCommandParamType.Integer },
        { name: "呪い", type: CustomCommandParamType.Float },
      ],
    },
    (origin: CustomCommandOrigin, hp?: number, curse?: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      const life = hp !== undefined && hp > 0 ? Math.round(hp) : BOSS_HP;
      system.run(() => {
        try {
          const at = player.location;
          const v = player.getViewDirection();
          const len = Math.hypot(v.x, v.z) || 1;
          const boss = player.dimension.spawnEntity(WYVERN, {
            x: at.x + (v.x / len) * 10,
            y: at.y + 1,
            z: at.z + (v.z / len) * 10,
          });
          setup(boss, life);
          setLabel(boss, LABEL);
          const k = curse !== undefined && curse > 0 ? curse : BOSS_CURSE;
          if (k !== 1) setHaste(boss, k);
          player.sendMessage(`§7飛竜を呼んだ §8HP ${life}${k === 1 ? "" : ` ／ 呪い ×${k}`}`);
        } catch (err) {
          player.sendMessage(`§c呼べなかった §8${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function flyCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:bossfly",
      description: "飛竜の飛行を切り替える（試作）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        let n = 0;
        for (const boss of bosses()) {
          try {
            const flying = boss.getProperty("pve_v3:fly") === true;
            boss.triggerEvent(flying ? "pve_v3:land" : "pve_v3:takeoff");
            n++;
          } catch {
            /* 消えている */
          }
        }
        player.sendMessage(n > 0 ? `§7${n} 体を切り替えた` : "§c飛竜が居ない");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * **呪い**（速さの倍率）を掛ける。
 *
 * > ### 攻撃速度も移動速度も、**倍率 1 つ**で動かす
 * >
 * > 溜め・本体・当たる瞬間・冷め・突進の押し・飛行の押し・弾の速さ・
 * > **見た目の早回し**まで、**同じ数を掛ける。**
 */
function curseCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:bosscurse",
      description: "飛竜に呪い（速さの倍率）を掛ける",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "倍率", type: CustomCommandParamType.Float }],
    },
    (origin: CustomCommandOrigin, rate: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        let n = 0;
        for (const boss of bosses()) {
          setHaste(boss, rate);
          n++;
        }
        player.sendMessage(n > 0 ? `§7${n} 体に呪い §f×${rate}` : "§c飛竜が居ない");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/** 攻撃の一覧を出す（確認用） */
function listCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:bossacts",
      description: "飛竜の攻撃表を出す",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        player.sendMessage("§7──── §f飛竜の攻撃 §7────");
        for (const a of ACTS) {
          const times = a.shoot !== undefined ? 3 : Math.max(1, a.hitAt.length);
          player.sendMessage(
            `§f${a.name} §7間合い §f${a.min}〜${a.max}§7 ／ 溜め §f${(a.windup / 20).toFixed(1)} 秒` +
              `§7 ／ 威力 §f${a.damage}§7 ×${times} ／ 冷め §f${(a.cool / 20).toFixed(1)} 秒`
          );
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const commands: readonly CommandDef[] = [spawnCommand, flyCommand, curseCommand, listCommand];
