/**
 * エンチャント。
 *
 * 仕様は `docs/spec/20-enchant.md`。
 *
 * ## ここがやること
 *
 * | | |
 * | --- | --- |
 * | 付ける・外す | `/pve:ench <名前> <段>`（**0 で外す**） |
 * | 一覧を見る | `/pve:enchs` |
 * | 全部外す | `/pve:ench clear 0` |
 *
 * **効き方はここには無い**——威力は `lib/attack.ts`、間隔は `features/bow/`。
 * **札が増えても、触る場所が散らからないように。**
 *
 * > ### 本来は「ウェーブを越えると 3 択」
 * >
 * > 提示の仕組みはウェーブと一緒に作る（`docs/spec/20-enchant.md` 1 章）。
 * > **いまはコマンドで直接付ける**——**1 枚ずつ確かめながら作るため。**
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
import { ENCHANTS, find, roman } from "../../lib/enchants.js";
import { fx } from "../../lib/fx.js";
import { clear, held, lv, setLv } from "../../state/enchant.js";
import { heal } from "../../state/hp.js";
import { onHit } from "../damage/index.js";
import { registerOnHit } from "./onhit.js";
import { refresh } from "./view.js";

/**
 * 当たったときに効くもの。
 *
 * **通常攻撃だけ**（`kind: "base"`）——特殊攻撃からは呼ばれない。
 * **回復が範囲攻撃の数だけ増えるのを防ぐ**（`docs/spec/20-enchant.md`）。
 */
function subscribe(): void {
  // **札の中身**（燃やす・爆ぜる・落とす…）は `onhit.ts`
  registerOnHit();

  onHit((info) => {
    const by = info.by;
    if (by === undefined) return;

    // ---- 吸収。**強すぎると壊れるので控えめ**（段 3 で 1.5％）
    //
    // **1 未満でも捨てない**（2026-08-31）——**HP は小数のまま持つ。**
    // 40 ダメージ × 段 1 なら 0.2。**切り捨てると「効いていない」ように見える。**
    const leech = lv(by, "leech");
    if (leech > 0) {
      const back = info.dealt * 0.005 * leech;
      if (back > 0) {
        heal(by, back);
        // **光らせるのは 1 以上のときだけ**（毎発光ると鬱陶しい）
        if (back >= 1) fx("leech", by.dimension, by.location);
      }
    }
  });
}

function enchCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:ench",
      description: "エンチャントを付ける（0 で外す・clear で全部外す）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [
        { name: "名前", type: CustomCommandParamType.String },
        { name: "段", type: CustomCommandParamType.Integer },
      ],
    },
    (origin: CustomCommandOrigin, name: string, level: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;

      if (name === "clear") {
        system.run(() => {
          clear(player);
          refresh(player);
          player.sendMessage("§7札を全部外した");
        });
        return { status: CustomCommandStatus.Success };
      }

      const def = find(name);
      if (def === undefined) {
        return { status: CustomCommandStatus.Failure, message: "そんな札は無い（/pve:enchs で一覧）" };
      }
      system.run(() => {
        const lv = setLv(player, def, level);
        refresh(player);
        if (lv === 0) {
          player.sendMessage(`§7${def.name} を外した`);
          return;
        }
        player.sendMessage(`§f${def.name} ${roman(lv)}§7 — ${def.text(lv)}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function listCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:enchs",
      description: "エンチャントの一覧を出す",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        const mine = new Map(held(player).map((h) => [h.def.id, h.lv]));
        player.sendMessage("§7──── §f札の一覧 §7────");
        for (const def of ENCHANTS) {
          const lv = mine.get(def.id) ?? 0;
          const color = def.grade === "legend" ? "§6" : "§b";
          const now = lv > 0 ? `§a${roman(lv)}` : "§8—";
          player.sendMessage(`${color}${def.name}§7 (${def.id}) 段1〜${def.max} ${now}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * 持ち物の弓に、いまの札を出す。
 *
 * **違うときだけ書き換わる**（`view.ts`）——毎回書くと連射が途切れる。
 */
function tick(): void {
  for (const player of world.getAllPlayers()) refresh(player);
}

export const enchant: Feature = {
  name: "enchant",
  subscribe,
  tick: { every: 20, run: tick },
  commands: [enchCommand, listCommand],
};
