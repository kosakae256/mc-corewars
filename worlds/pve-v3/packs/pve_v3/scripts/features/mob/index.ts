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
import { ENEMIES } from "../../core/roster.js";
import type { EnemyDef } from "../../core/enemy.js";
import { hit } from "../../services/combat.js";
import { allEnemies } from "../../services/field.js";
import { stepSpawn } from "../../services/spawn.js";
import { subscribeMelee } from "../../services/melee.js";
import { boom, unswell, warn } from "../../services/fuse.js";
import { subscribeMobShot } from "../../services/mobshot.js";
import { subscribeFuse, subscribeTraits } from "../../services/traits.js";
import { applyHp } from "../../services/growth.js";
import { damage as cutHp, has, setup } from "../../state/hp.js";
import { KEYS } from "../../state/keys.js";
import { labelOf, setLabel } from "../../state/label.js";
import { migrateEnemyAi } from "../../services/enemy-ai-migration.js";
import { starLabel } from "../../core/star.js";

/** 実体。**ゾンビの見た目と動きをそのまま借りる**（`runtime_identifier`） */
export const MOB = "pve_v3:grunt";

/** 味方の的（`behavior_packs/pve_v3/entities/ally.json`） */
export const ALLY = "pve_v3:ally";

/** 味方の的の名前と HP */
export const ALLY_LABEL = "味方（確認用）";
export const ALLY_HP = 100;

/** モブの表示名。**名札に出る** */
export const MOB_LABEL = "ゾンビ";

/** モブの HP */
export const MOB_HP = 500;

/** モブの攻撃力 */
const MOB_ATTACK = 20;

/** 爆発が届く半径（マス）。**予告の間に歩いて出られる**（`16-enemy.md` 5-1） */
const BOOM_R = 4;

/** 押す強さの上限。**その敵が持っていればそちら** */
const BOOM_KB = 3.0;

/** **導火線が消えない距離の倍率。** バニラは 2.5 → 6（＝ 2.4 倍） */
const BOOM_KEEP = 2.4;

/** 上へ飛ばす強さ。**爆発だけの例外** */
const BOOM_UP = 0.55;

/** 殴る間隔（tick）。**1 秒** */
const SWING = 20;

/** 届く距離（マス） */
const REACH = 2.5;

/** 最後に殴った時刻 */
const swungAt = new Map<string, number>();

/** 湧かせる数の上限。**試作なので少なく** */
export const SPAWN_MAX = 20;

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
  // **戦場の箱で切らない**（`services/traits.ts` と同じ理由）——
  // **箱の外に置いた敵も、導火線は動くべき**
  for (const mob of allEnemies()) {
    try {
      // **種類ごとの値を、その個体から読む**（湧かせた側が置いている）
      const kind = mob.getDynamicProperty(KEYS.kind);
      const def = typeof kind === "string" ? ENEMIES[kind] : undefined;
      if (def !== undefined) {
        migrateEnemyAi(mob, def);
        const label = starLabel(def.name, def.star, def.color);
        if (labelOf(mob) !== label) setLabel(mob, label);
      }
      const atk = mob.getDynamicProperty(KEYS.atk);
      const power = typeof atk === "number" && atk > 0 ? atk : (def?.attack ?? MOB_ATTACK);
      // **その個体に入っている間隔を使う**（攻撃速度で縮んだ後の値。`services/spawn.ts`）
      const own = mob.getDynamicProperty(KEYS.swing);
      const swing = typeof own === "number" && own > 0 ? own : (def?.interval ?? SWING);
      const reach = def?.reach ?? REACH;

      if (!has(mob)) {
        setup(mob, def?.hp ?? MOB_HP);
        setLabel(mob, def === undefined ? MOB_LABEL : starLabel(def.name, def.star, def.color));
      }

      // > ### ここで見るのは**自爆だけ**（2026-09-08 に絞った）
      // >
      // > **殴りはバニラに任せた**（`services/melee.ts`）——振る動きと合わせるため。
      // > **撃つのは矢が当たったときに入る**（`services/mobshot.ts`）。
      // >
      // > **撃つ敵をここに残していたせいで、矢とは別に、射程に入っただけで削れていた。**
      // > **「何も見えないのに遠くから殴られる」の正体。**
      if (def?.kind !== "boom") continue;

      // > ### **導火線はバニラに任せた**（2026-09-08 に作り直した）
      // >
      // > **script で数えていたときは、近づいた瞬間に爆発していた**——**予告が無い。**
      // > **いまは `minecraft:target_nearby_sensor` が間合いを見て、
      // > `minecraft:explode` が 1.5 秒の待ちと膨らむ絵と音を出す**
      // > （`tools/pve3-newmob.mjs` の `fuseOf`）。
      // >
      // > **こちらは「火が点いた」合図を受けて、爆ぜる時刻を控えるだけ。**
      // > ### **導火線は呪いで縮まない**（2026-09-08 決定）
      // >
      // > **`KEYS.swing` は呪いで縮んだ値**（`services/spawn.ts`）。
      // > **爆発までの時間まで縮むと理不尽**なので、**素の `interval` を使う。**
      // > **JSON 側も段を作っていない**（`pve3-mobjson.mjs`）——**両方で揃える。**
      const fuse = def.interval;
      const lit = swungAt.get(mob.id);
      if (lit === undefined) continue;
      if (now - lit < fuse) {
        // > ### **膨らみだけに頼らない**（2026-09-08 追加）
        // >
        // > **膨らむ絵は `query.swell_amount` が動かす**——**engine 任せ。**
        // > **こちらでも音と粒を出して、火が点いていることを必ず見せる。**
        warn(mob, (now - lit) / fuse);
        continue;
      }
      boom(mob, power, def);
    } catch {
      /* 消えている */
    }
  }
}

/**
 * 満腹度を満タンに戻す。
 *
 * > ### **常に満タン**（2026-09-07 決定）
 * >
 * > **消耗は `entities/player.json` でゼロにした**が、**減った状態からは戻らない。**
 * > **入り直した人・設定を変える前から居た人**のために、ここで戻す。
 */
function fillFood(player: Player): void {
  try {
    const hunger = player.getComponent("minecraft:player.hunger");
    if (hunger !== undefined && hunger.currentValue < hunger.effectiveMax) {
      hunger.setCurrentValue(hunger.effectiveMax);
    }
    const sat = player.getComponent("minecraft:player.saturation");
    if (sat !== undefined && sat.currentValue < sat.effectiveMax) sat.setCurrentValue(sat.effectiveMax);
  } catch {
    /* 消えている */
  }
}

/** プレイヤーにも HP を持たせる。**まだ湧かせ方が無いので、ここで面倒を見る。** */
function tickPlayers(): void {
  for (const p of world.getAllPlayers()) {
    fillFood(p);
    try {
      applyHp(p);
    } catch {
      /* 消えている */
    }
  }
}

export const mob: Feature = {
  name: "mob",
  subscribe: () => {
    subscribeMelee();
    // **撃つ敵の矢を、自前の弾に差し替える**（`24-mob-howto.md` 10 章）
    subscribeMobShot();
    // **共通部品の旗を、部品へつなぐ**（`25-enemy-kit.md`）
    subscribeTraits();
    // **導火線の点火・消火を受ける**（`minecraft:target_nearby_sensor`）
    subscribeFuse((mob, on) => {
      if (on) {
        if (!swungAt.has(mob.id)) swungAt.set(mob.id, system.currentTick);
        return;
      }
      swungAt.delete(mob.id);
      // **火が消えたら、膨らみも戻す**
      unswell(mob);
    });
  },
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
