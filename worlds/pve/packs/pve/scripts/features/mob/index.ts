/**
 * モブ。
 *
 * 仕様は `docs/spec/10-damage.md` 2 章。
 *
 * **いまはゾンビ 1 種だけ。** ウェーブも湧かせ方も、まだ決まっていない
 *（`docs/01-rules.md` 1 章）。
 *
 * | | |
 * | --- | --- |
 * | HP | **200**（独自。バニラの体力は使わない） |
 * | 攻撃力 | **20** |
 * | 殴る間隔 | 1 秒 |
 * | 届く距離 | 2.5 マス |
 */

import {
  CommandPermissionLevel,
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
import { hit } from "../damage/index.js";
import { has, max, setup } from "../../state/hp.js";
import { setLabel } from "../../state/label.js";

/** 実体。**ゾンビの見た目と動きをそのまま借りる**（`runtime_identifier`） */
export const MOB = "pve:grunt";

/** モブの表示名。**名札に出る**（`docs/spec/15-hud.md` 3 章） */
const MOB_LABEL = "グラント";

/** モブの HP */
const MOB_HP = 200;

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
        const d = Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
        if (d > REACH) continue;
        swungAt.set(mob.id, now);
        // **殴りも同じ 1 本道を通る**（`docs/spec/10-damage.md` 4 章）
        hit({ target: p, attack: MOB_ATTACK });
        break;
      }
    } catch {
      /* 消えている */
    }
  }
}

/**
 * プレイヤーにも HP を持たせる。**まだ湧かせ方が無いので、ここで面倒を見る。**
 *
 * **10000**（2026-08-29）。**確かめている間だけの値**——
 * 48 本の弓とエンチャントを試すのに、200 では**すぐ倒れて確認にならない。**
 * **ウェーブの仕組みを作るときに 200 へ戻す**（`docs/spec/10-damage.md` 2 章）。
 */
const PLAYER_HP = 10000;

function tickPlayers(): void {
  for (const p of world.getAllPlayers()) {
    try {
      // **上限が変わったら付け直す**（値を変えて `/reload` しても効くように）
      if (!has(p) || (max(p) ?? 0) !== PLAYER_HP) setup(p, PLAYER_HP);
    } catch {
      /* 消えている */
    }
  }
}

function spawnCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:spawn",
      description: "モブを湧かせる（試用）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        const at = player.location;
        let n = 0;
        let why = "";
        for (let i = 0; i < 5 && mobs().length < SPAWN_MAX; i++) {
          const a = (i / 5) * Math.PI * 2;
          try {
            const mob = player.dimension.spawnEntity(MOB, {
              x: at.x + Math.cos(a) * 4,
              y: at.y + 1,
              z: at.z + Math.sin(a) * 4,
            });
            setup(mob, MOB_HP);
            setLabel(mob, MOB_LABEL);
            n++;
          } catch (err) {
            // **黙って諦めない**（`docs/imp.md` の考え方）。
            // 湧かないときに、**定義が読めていないのか、場所が悪いのか**が分からない
            why = String(err);
          }
        }
        player.sendMessage(n > 0 ? `§7${n} 体湧かせた` : `§c湧かせられなかった §8${why}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const mob: Feature = {
  name: "mob",
  commands: [spawnCommand],
  tick: {
    // **4 tick に 1 回で足りる。** 殴る間隔は 1 秒
    every: 4,
    run: (now) => {
      tickPlayers();
      tick(now);
    },
  },
};
