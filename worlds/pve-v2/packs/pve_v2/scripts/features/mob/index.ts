/**
 * モブ。
 *
 * 仕様は `docs/spec/11-damage.md` 2 章。
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
import { hit } from "../damage/index.js";
import { damage as cutHp, has, max, setMax, setup } from "../../state/hp.js";
import { KEYS } from "../../state/keys.js";
import { ratio as slowRatio } from "../../state/slow.js";
import { isFrozen } from "../../state/status.js";
import { hpBonus } from "../../lib/mitigate.js";
import { setLabel } from "../../state/label.js";
import { SLOW_CAP, SLOW_EFF, setLimits } from "../../state/slow.js";

/** 実体。**ゾンビの見た目と動きをそのまま借りる**（`runtime_identifier`） */
export const MOB = "pve_v2:grunt";

/**
 * その人が買った最大 HP。**既定は 100**（`docs/00-concept.md` 8 章）。
 *
 * **ショップができたら、ここに書き込むだけ**で繋がる。
 */
function baseHp(player: Player): number {
  try {
    const v = player.getDynamicProperty(KEYS.hpBase);
    return typeof v === "number" && v > 0 ? v : PLAYER_HP;
  } catch {
    return PLAYER_HP;
  }
}

/** 味方の的（`behavior_packs/pve_v2/entities/ally.json`） */
const ALLY = "pve_v2:ally";

/** 味方の的の名前と HP */
const ALLY_LABEL = "味方（確認用）";
const ALLY_HP = 100;

/** モブの表示名。**名札に出る**（`docs/spec/12-hud.md` 3 章） */
const MOB_LABEL = "グラント";

/**
 * モブの HP。
 *
 * **仮召喚は 10000**（2026-08-31）——**札の効き方を落ち着いて見るため。**
 * 本番の値はウェーブと一緒に決める（`docs/spec/20-enchant.md` 6 章）。
 */
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
        setLimits(mob, SLOW_CAP, SLOW_EFF);
        setLabel(mob, MOB_LABEL);
      }

      // ---- 鈍化と凍結（`docs/spec/12-element.md` 2-5）
      //
      // **足だけでなく、殴る間隔も伸びる**——効果では刻めないので、ここで見る。
      // **凍っている間は殴らない。**
      if (isFrozen(mob.id, now)) continue;
      const d = slowRatio(mob, now);

      const last = swungAt.get(mob.id) ?? 0;
      if (now - last < SWING * (1 + 0.3 * d)) continue;

      const at = mob.location;
      for (const p of players) {
        if (!has(p)) continue;
        const range = Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
        if (range > REACH) continue;
        swungAt.set(mob.id, now);
        // **殴りも同じ 1 本道を通る**（`docs/spec/11-damage.md` 4 章）
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
 * **ウェーブの仕組みを作るときに 200 へ戻す**（`docs/spec/11-damage.md` 2 章）。
 */
const PLAYER_HP = 100;

function tickPlayers(): void {
  for (const p of world.getAllPlayers()) {
    try {
      // **上限が変わったら付け直す**（値を変えて `/reload` しても効くように）
      // **最大 HP ＝ 買った値 × 札の伸び**（深水・円環。`lib/mitigate.ts`）
      const cap = Math.round(baseHp(p) * hpBonus(p));
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
 * 味方の的を置く（確認用）。
 *
 * ```
 * /pve:ally        1 体
 * /pve:ally 3      3 体
 * ```
 *
 * **回復の札を確かめるため**に、**HP を半分にして**出す
 *（恵みの雨・癒しの雨脚・自然回復）。
 * **矢は素通りし、範囲攻撃も当たらない**（`lib/special.ts` の `isAlly`）。
 */
/**
 * 買った最大 HP を置く（試作）。
 *
 * ```
 * /pve:hp 500
 * ```
 *
 * **本来はショップで買う**（`docs/spec/12-element.md` 1-1 の値段）。
 * **札の伸び（深水・円環）はこの値に掛かる。**
 */
function hpCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:hp",
      description: "買った最大 HP を置く（試作）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "値", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, value: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      const want = Math.max(1, Math.min(500, Math.round(value)));
      system.run(() => {
        try {
          player.setDynamicProperty(KEYS.hpBase, want);
          player.sendMessage(`§7買った最大 HP を §f${want}§7 にした（札の伸びはこの上に乗る）`);
        } catch (err) {
          player.sendMessage(`§c${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

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
            // **半分減らしておく**——回復が入ったかどうかが見えるように
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
            // **鈍化の上限はモブごとに持つ**（`docs/spec/12-element.md` 2-5）
            setLimits(mob, SLOW_CAP, SLOW_EFF);
            setLabel(mob, MOB_LABEL);
            n++;
          } catch (err) {
            // **黙って諦めない**（`docs/imp.md` の考え方）。
            // 湧かないときに、**定義が読めていないのか、場所が悪いのか**が分からない
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
