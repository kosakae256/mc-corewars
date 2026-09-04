/**
 * 属性。
 *
 * 仕様は `docs/spec/12-element.md`。
 *
 * ## ここがやること
 *
 * | | |
 * | --- | --- |
 * | **風の足の速さ** | バニラの「移動速度」効果で近似する |
 * | **属性値を触るコマンド** | `/pve:el <属性> <値>`（**試作用**） |
 * | **いまの状態を出す** | `/pve:build` |
 *
 * **火・雷・水・氷は数字を読むだけ**なので、ここには出てこない——
 * 威力は `lib/attack.ts`、防御は `features/damage/`、鈍化は `state/slow.ts`。
 *
 * > ### 買い方はまだ無い
 * >
 * > **本来はエメラルドで買う**（`docs/spec/12-element.md` 1-1）。
 * > ショップはウェーブと一緒に作るので、**いまはコマンドで置く。**
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
import * as el from "../../state/element.js";
import { held } from "../../state/enchant.js";
import { critMult, critRate, intervalRate } from "../../lib/attack.js";
import { roman } from "../../lib/enchants.js";
import * as st from "../../state/status.js";

/**
 * 風の足の速さ。**ビヘイビア側の「段」を切り替えるだけ。**
 *
 * 仕様は `docs/spec/12-element.md` 2-3、段の書き出しは `tools/pve2-player-move.py`。
 *
 * > ### マイクラの動きそのものは触らない（2026-08-31 決定）
 * >
 * > | 試したこと | 何が起きたか |
 * > | --- | --- |
 * > | バニラの「移動速度」効果 | **20％ 刻み**でしか刻めない |
 * > | 属性を毎 tick 書く | **スプリントの切り替わりで engine と取り合い**、速さが波打つ |
 * > | 毎 tick 押し出す | **ジャンプの挙動まで変わった** |
 * >
 * > **素の速さをビヘイビアで差し替え、あとは engine に任せる。**
 * > スプリントの ×1.3 もジャンプも、**バニラの計算がそのまま働く。**
 *
 * ```
 * 倍率 ＝ 風の倍率 × 一時的な倍率（烈風・追い風の尾）
 *   ↓ 0.05 刻みに丸める
 * pve_v2:spd_<段> を投げる   ← **変わったときだけ**
 * ```
 */

/** 段の刻みと範囲（`tools/pve2-player-move.py` と揃える） */
const SPD_STEP = 0.05;
const SPD_LOW = 1.0;
const SPD_HIGH = 3.0;

/** いま入れてある段。**メモリだけ**（`/reload` で消えてよい） */
const spdOf = new Map<string, number>();

function applyWind(player: Player, now: number): void {
  // **移動は加算**（2026-08-31 決定）——風 ＋100％ と烈風 ＋40％ なら ＋140％。
  // **掛け算にすると重ねたときに伸びすぎる**（乗算にするのは攻撃速度だけ）。
  const raw = 1 + (el.windSpeed(player) - 1) + (st.speedOf(player.id, now) - 1);
  const mult = Math.max(SPD_LOW, Math.min(SPD_HIGH, raw));
  const step = Math.round(mult / SPD_STEP) * SPD_STEP;
  if (spdOf.get(player.id) === step) return;
  spdOf.set(player.id, step);
  try {
    player.triggerEvent(`pve_v2:spd_${Math.round(step * 100)}`);
  } catch {
    /* 定義が読み込まれていない */
  }
}

/** 5 tick ごとに見る。**変わったときだけイベントを投げる** */
function tick(now: number): void {
  for (const player of world.getAllPlayers()) applyWind(player, now);
}

function elCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:el",
      description: "属性値を置く（試作）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [
        { name: "属性", type: CustomCommandParamType.String },
        { name: "値", type: CustomCommandParamType.Integer },
      ],
    },
    (origin: CustomCommandOrigin, name: string, value: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const target = el.toElement(name);
      if (target === undefined) {
        return { status: CustomCommandStatus.Failure, message: "属性は 火 / 雷 / 風 / 水 / 氷" };
      }
      const player = e;
      system.run(() => {
        const set = el.set(player, target, value);
        player.sendMessage(`§b${el.EL_NAME[target]}§7 を §f${set}§7 にした（上限 ${el.EL_MAX}）`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/** いまのビルドを出す。**数字が合わないときに最初に見る場所** */
function buildCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:build",
      description: "いまの属性とエンチャントを出す",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        const values = el.all(player);
        const line = el.ELEMENTS.map((k) => `${el.EL_NAME[k]}${values[k]}`).join(" ");
        const list = held(player);
        const cards = list.length === 0 ? "§8無し" : list.map((h) => `§f${h.def.name} ${roman(h.lv)}`).join("§7 / ");
        player.sendMessage("§7──── §fビルド §7────");
        player.sendMessage(`§7属性 §f${line}§8（合計 ${el.total(player)}）`);
        player.sendMessage(`§7札 ${cards}`);
        player.sendMessage(
          `§7クリ §f${Math.round(critRate(player) * 100)}％ ×${critMult(player).toFixed(1)}` +
            `§7 ／ 間隔 §f${(intervalRate(player) * 0.5).toFixed(2)} 秒`
        );
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * 移動速度の属性が**本当に保つのか**を測る（確認用）。
 *
 * ```
 * /pve:spd 0.2
 * ```
 *
 * **書いた直後・1 tick 後・5 tick 後・20 tick 後**の値を出す。
 * **戻されるなら、どのくらいで戻るかが分かる。**
 */
function spdCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:spd",
      description: "移動速度の属性を書いて、保つか測る（確認用）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "値", type: CustomCommandParamType.Float }],
    },
    (origin: CustomCommandOrigin, value: number): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        try {
          const move = player.getComponent("minecraft:movement");
          if (move === undefined) {
            player.sendMessage("§c移動速度の属性が読めない");
            return;
          }
          const ok = move.setCurrentValue(value);
          player.sendMessage(
            `§7素 §f${move.defaultValue.toFixed(3)}§7 / 上限 §f${move.effectiveMax.toFixed(3)}§7 / 書けたか §f${String(ok)}`
          );
          for (const wait of [0, 1, 5, 20]) {
            system.runTimeout(() => {
              try {
                const m = player.getComponent("minecraft:movement");
                player.sendMessage(`§7${wait} tick 後 §f${(m?.currentValue ?? -1).toFixed(3)}`);
              } catch {
                /* 消えている */
              }
            }, wait);
          }
        } catch (err) {
          player.sendMessage(`§c${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const element: Feature = {
  name: "element",
  tick: { every: 5, run: tick },
  commands: [elCommand, buildCommand, spdCommand],
};
