/**
 * ステータス強化。
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md`。
 *
 * | | |
 * | --- | --- |
 * | **買う** | `/pve:buy <ステータス> [回数]` |
 * | **見る** | `/pve:stats` |
 * | **配る**（試作） | `/pve:emerald <値>` |
 *
 * **ショップはまだ無い**——休憩所ができるまではコマンドで代用する
 *（`docs/spec/13-flow.md`）。
 *
 * ## 毎周期やること
 *
 * **足の速さを効かせ直す**（`services/growth.ts` の `applySpeed`）。
 * **買った瞬間だけでなく毎周期見る**——`/reload` や入り直しで
 * ビヘイビアの段が外れても、次の周期で戻る（`docs/imp.md` 10-7）。
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

import type { Feature } from "../../types.js";
import { STATS, STAT_KEYS, isMaxed, nextCost, toStatKey, type StatKey } from "../../core/growth.js";
import { addEmerald, emeraldOf, levelOf } from "../../state/growth.js";
import { applySpeed, buy, valueOf } from "../../services/growth.js";

/** 一度に買える上限。**打ち間違いで財布が消えないように** */
const BUY_MAX = 40;

/** 見せるときの書き方。**桁は `core/growth.ts` に合わせる** */
function show(key: StatKey, value: number): string {
  return value.toFixed(STATS[key].digits);
}

/** いまの強化を出す */
function statsCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:stats",
      description: "いまのステータスと値段を出す",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        player.sendMessage("§7──── §fステータス §7────");
        for (const key of STAT_KEYS) {
          const lv = levelOf(player, key);
          const def = STATS[key];
          const price = nextCost(key, lv);
          const tail = price === undefined ? "§8上限" : `§7次 §f${price}§7 エメラルド`;
          player.sendMessage(
            `§7${def.label} §f${show(key, valueOf(player, key))}` + ` §8(${lv}/${def.maxLevel})§7 ${tail}`
          );
        }
        player.sendMessage(`§7エメラルド §a${emeraldOf(player)}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * 買う。
 *
 * ```
 * /pve:buy 攻撃力        1 回
 * /pve:buy power 10      10 回（足りるところまで）
 * ```
 */
function buyCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:buy",
      description: "ステータスを買う（hp / speed / haste / power）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "ステータス", type: CustomCommandParamType.String }],
      optionalParameters: [{ name: "回数", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, name: string, times?: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const key = toStatKey(name);
      if (key === undefined) {
        return {
          status: CustomCommandStatus.Failure,
          message: "hp / speed / haste / power のどれか",
        };
      }
      const player = e;
      const want = times !== undefined && times > 0 ? Math.min(BUY_MAX, Math.round(times)) : 1;
      system.run(() => {
        const before = levelOf(player, key);
        const r = buy(player, key, want);
        if (r.bought === 0) {
          const why = isMaxed(key, before) ? "上限に達している" : "エメラルドが足りない";
          player.sendMessage(`§c買えなかった §8${why}`);
          return;
        }
        player.sendMessage(
          `§7${STATS[key].label} §f${show(key, r.value)}§7 §8(${r.level}/${STATS[key].maxLevel})` +
            ` §7— §a-${r.spent}§7 エメラルド（残り §a${r.left}§7）`
        );
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * エメラルドを配る（試作）。
 *
 * **入手条件（キル／アシスト／ウェーブクリア）はまだ決まっていない**
 *（`docs/spec/15-growth.md` 6 章）。**それまでの代用。**
 */
function emeraldCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:emerald",
      description: "エメラルドを足す（試作。負を渡せば引く）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "値", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, value: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        const left = addEmerald(player, Math.round(value));
        player.sendMessage(`§7エメラルド §a${left}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/** 足の速さを効かせ直す */
function tick(): void {
  for (const player of world.getAllPlayers()) applySpeed(player);
}

export const growth: Feature = {
  name: "growth",
  commands: [statsCommand, buyCommand, emeraldCommand],
  tick: {
    // **5 tick に 1 回で足りる。** 買った直後に反映されればよい
    every: 5,
    run: tick,
  },
};
