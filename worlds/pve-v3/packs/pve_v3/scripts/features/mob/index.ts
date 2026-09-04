/**
 * モブ。**確認用。**
 *
 * **いまはゾンビ 1 種だけ。** ウェーブも湧かせ方も、まだ決まっていない。
 *
 * | | |
 * | --- | --- |
 * | HP | **500**（独自。バニラの体力は使わない） |
 * | 攻撃力 | **20** |
 * | 殴る間隔 | 1 秒 |
 * | 届く距離 | 2.5 マス |
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
  type Entity,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { hit } from "../../services/combat.js";
import { maxHpOf } from "../../services/growth.js";
import { damage as cutHp, has, max, setMax, setup } from "../../state/hp.js";
import { KEYS } from "../../state/keys.js";
import { setLabel } from "../../state/label.js";

/** 実体。**ゾンビの見た目と動きをそのまま借りる**（`runtime_identifier`） */
export const MOB = "pve_v3:grunt";

/** 味方の的（`behavior_packs/pve_v3/entities/ally.json`） */
const ALLY = "pve_v3:ally";

/** 味方の的の名前と HP */
const ALLY_LABEL = "味方（確認用）";
const ALLY_HP = 100;

/** モブの表示名。**名札に出る** */
const MOB_LABEL = "グラント";

/** モブの HP */
const MOB_HP = 500;

/** モブの攻撃力 */
const MOB_ATTACK = 20;

/** 殴る間隔（tick）。**1 秒** */
const SWING = 20;

/** 届く距離（マス） */
const REACH = 2.5;

/** 最後に殴った時刻 */
const swungAt = new Map<string, number>();

/** 湧かせる数の上限。**試作なので少なく** */
const SPAWN_MAX = 20;

/**
 * その人の最大 HP。
 *
 * **買った HP 強化が既定**（`services/growth.ts`。初期 100・1 回 ＋50）。
 * **`/pve:hp` で置いた値があれば、そちらを優先する**——確認用の上書き。
 */
function baseHp(player: Player): number {
  try {
    const v = player.getDynamicProperty(KEYS.hpBase);
    if (typeof v === "number" && v > 0) return v;
  } catch {
    /* 消えている */
  }
  return maxHpOf(player);
}

function mobs(): Entity[] {
  try {
    return world.getDimension("overworld").getEntities({ type: MOB });
  } catch {
    return [];
  }
}

/**
 * 毎周期。
 *
 * | | |
 * | --- | --- |
 * | HP を持っていない実体 | **持たせる**（湧いた直後） |
 * | 近くに人が居る | **殴る** |
 *
 * **覚えるより、あるべき姿へ寄せる**（`docs/imp.md` 10-7）。
 * `/reload` で記録が消えても、次の周期で戻る。
 */
function tick(now: number): void {
  const players = world.getAllPlayers();
  for (const mob of mobs()) {
    try {
      if (!has(mob)) {
        setup(mob, MOB_HP);
        setLabel(mob, MOB_LABEL);
      }

      const last = swungAt.get(mob.id) ?? 0;
      if (now - last < SWING) continue;

      const at = mob.location;
      for (const p of players) {
        if (!has(p)) continue;
        const range = Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
        if (range > REACH) continue;
        swungAt.set(mob.id, now);
        // **殴りも同じ 1 本道を通る**
        hit({ target: p, attack: MOB_ATTACK });
        break;
      }
    } catch {
      /* 消えている */
    }
  }
}

/** プレイヤーにも HP を持たせる。**まだ湧かせ方が無いので、ここで面倒を見る。** */
function tickPlayers(): void {
  for (const p of world.getAllPlayers()) {
    try {
      // **上限が変わったら付け直す**（値を変えて `/reload` しても効くように）
      const cap = baseHp(p);
      if (!has(p)) {
        setup(p, cap);
      } else if ((max(p) ?? 0) !== cap) {
        // **満タンに戻さない**——上限だけ入れ替える
        setMax(p, cap);
      }
    } catch {
      /* 消えている */
    }
  }
}

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

export const mob: Feature = {
  name: "mob",
  commands: [spawnCommand, allyCommand, hpCommand],
  tick: {
    // **4 tick に 1 回で足りる。** 殴る間隔は 1 秒
    every: 4,
    run: (now) => {
      tickPlayers();
      tick(now);
    },
  },
};
