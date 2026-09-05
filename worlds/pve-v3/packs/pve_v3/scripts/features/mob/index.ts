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
import { mobCommands } from "./command.js";
import { ENEMIES } from "../../core/enemy.js";
import { hit } from "../../services/combat.js";
import { enemies } from "../../services/field.js";
import { stepSpawn } from "../../services/spawn.js";
import { maxHpOf } from "../../services/growth.js";
import { damage as cutHp, has, max, setMax, setup } from "../../state/hp.js";
import { KEYS } from "../../state/keys.js";
import { setLabel } from "../../state/label.js";

/** 実体。**ゾンビの見た目と動きをそのまま借りる**（`runtime_identifier`） */
export const MOB = "pve_v3:grunt";

/** 味方の的（`behavior_packs/pve_v3/entities/ally.json`） */
export const ALLY = "pve_v3:ally";

/** 味方の的の名前と HP */
export const ALLY_LABEL = "味方（確認用）";
export const ALLY_HP = 100;

/** モブの表示名。**名札に出る** */
export const MOB_LABEL = "グラント";

/** モブの HP */
export const MOB_HP = 500;

/** モブの攻撃力 */
const MOB_ATTACK = 20;

/** 殴る間隔（tick）。**1 秒** */
const SWING = 20;

/** 届く距離（マス） */
const REACH = 2.5;

/** 最後に殴った時刻 */
const swungAt = new Map<string, number>();

/** 湧かせる数の上限。**試作なので少なく** */
export const SPAWN_MAX = 20;

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
  // **積んである敵を少しずつ出す**（`services/spawn.ts`）
  stepSpawn(now);

  const players = world.getAllPlayers();
  for (const mob of enemies()) {
    try {
      // **種類ごとの値を、その個体から読む**（湧かせた側が置いている）
      const kind = mob.getDynamicProperty(KEYS.kind);
      const def = typeof kind === "string" ? ENEMIES[kind] : undefined;
      const atk = mob.getDynamicProperty(KEYS.atk);
      const power = typeof atk === "number" && atk > 0 ? atk : (def?.attack ?? MOB_ATTACK);
      const swing = def?.interval ?? SWING;
      const reach = def?.reach ?? REACH;

      if (!has(mob)) {
        setup(mob, def?.hp ?? MOB_HP);
        setLabel(mob, def === undefined ? MOB_LABEL : `§c${def.name}`);
      }

      const last = swungAt.get(mob.id) ?? 0;
      if (now - last < swing) continue;

      const at = mob.location;
      for (const p of players) {
        if (!has(p)) continue;
        const range = Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
        if (range > reach) continue;
        swungAt.set(mob.id, now);
        // **殴りも撃つのも、同じ 1 本道を通る**
        hit({ target: p, attack: power });
        // **自爆は当てたら消える**
        if (def?.kind === "boom") {
          boom(mob, power);
          break;
        }
        break;
      }
    } catch {
      /* 消えている */
    }
  }
}

/** 自爆。**地形は壊さない**（`16-enemy.md` 5-1） */
function boom(mob: Entity, power: number): void {
  try {
    const at = mob.location;
    mob.dimension.spawnParticle("minecraft:large_explosion", at);
    mob.dimension.playSound("random.explode", at, { volume: 1.2 });
    for (const p of world.getAllPlayers()) {
      if (!has(p)) continue;
      const d = Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
      if (d > 4) continue;
      if (d > 2) hit({ target: p, attack: Math.round(power * 0.5) });
    }
    mob.remove();
  } catch {
    /* もう居ない */
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

export const mob: Feature = {
  name: "mob",
  commands: mobCommands,
  tick: {
    // **4 tick に 1 回で足りる。** 殴る間隔は 1 秒
    every: 4,
    run: (now) => {
      tickPlayers();
      tick(now);
    },
  },
};
