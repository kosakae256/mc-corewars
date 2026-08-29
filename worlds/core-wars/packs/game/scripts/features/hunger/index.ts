/**
 * 満腹度を減らさない。
 *
 * 仕様は `docs/01-rules.md` 3-B。
 *
 * ## なぜ
 *
 * **食料の管理はこのゲームの遊びではない。**
 *
 * コアを削り、資源を取り、立体機動で動き回る——
 * そこに「腹が減るから食べる」を足しても、
 * **手を止める理由が 1 つ増えるだけ。**
 *
 * ## 自然回復は止めない
 *
 * 満腹度を消費して体力が戻る仕組みは**残す。**
 * 戦闘の合間に体力が戻らないと、**一度削られたら下がり続ける**だけになる。
 *
 * **満タンに保てば、回復は常に働く。**
 * 仕組みはそのままで、**消費した分をこちらが埋める。**
 *
 * ## 消耗も戻す
 *
 * 満腹度は**消耗（exhaustion）が溜まると 1 段減る**という作りになっている。
 * 減ってから戻すと、**目盛りが一瞬揺れる。**
 *
 * 消耗そのものを 0 に戻せば、**減る前に止まる。**
 */

import { system, world, type Player } from "@minecraft/server";

import { isSpectating } from "../death/index.js";

/**
 * 見張る間隔（tick）。**1 秒。**
 *
 * 消耗が 4 溜まって初めて満腹度が 1 減る作りなので、
 * **毎 tick 見る必要が無い。** 1 秒あれば減る前に戻せる。
 */
const INTERVAL = 20;

/** その人の満腹度を満たす */
function feed(player: Player): void {
  try {
    // ---- **消耗を先に消す。** 減る前に止める
    const exhaustion = player.getComponent("minecraft:player.exhaustion");
    if (exhaustion !== undefined && exhaustion.currentValue > 0) {
      exhaustion.setCurrentValue(0);
    }

    // ---- 満腹度
    const hunger = player.getComponent("minecraft:player.hunger");
    if (hunger !== undefined && hunger.currentValue < hunger.effectiveMax) {
      hunger.resetToMaxValue();
    }

    // ---- **隠れている側の目盛りも満たす**
    //
    // 自然回復は満腹度ではなく**飽和度（saturation）**を先に食う。
    // ここが空だと、満腹度が満タンでも回復が鈍る
    const saturation = player.getComponent("minecraft:player.saturation");
    if (saturation !== undefined && saturation.currentValue < saturation.effectiveMax) {
      saturation.resetToMaxValue();
    }
  } catch {
    /* 消えている */
  }
}

/**
 * 自然回復を、もう 1 本ぶん足す間隔（tick）。**0.5 秒。**
 *
 * 仕様は `docs/01-rules.md` 3-B。
 *
 * ## なぜ足すのか
 *
 * 自然回復そのものは**バニラの仕組み**（飽和度を食って戻る）で、
 * **速さをこちらから設定する口が無い。**
 *
 * **止められないなら、同じ量をもう 1 本流す。**
 * バニラと同じ間隔・同じ量を足せば、**結果として倍の速さ**になる。
 */
const HEAL_INTERVAL = 10;

/** 1 回に戻す量。**バニラの自然回復と同じ 1** */
const HEAL_AMOUNT = 1;

/**
 * 1 段ぶん戻す。
 *
 * **上限は超えない。** 増えている分（吸収）まで押し上げない。
 * **倒れている人には触らない**——復活のときに満タンで戻る。
 */
function heal(player: Player): void {
  try {
    if (isSpectating(player)) return;
    const h = player.getComponent("minecraft:health");
    if (h === undefined) return;
    if (h.currentValue >= h.effectiveMax) return;
    h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + HEAL_AMOUNT));
  } catch {
    /* 消えている */
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 *
 * **試合中かどうかで分けない。**
 * ロビーで腹が減る理由も無い（`docs/01-rules.md` 3-B）。
 */
export function startHunger(): void {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) feed(player);
  }, INTERVAL);

  // **自然回復をもう 1 本**（2026-08-28 追加）。合わせて倍の速さになる
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) heal(player);
  }, HEAL_INTERVAL);
}
