/**
 * 弓（Archer）。
 *
 * 仕様は `docs/spec/10-bow.md`。
 *
 * ## 銃のように撃つ（2026-08-30 決定）
 *
 * ```
 * 右クリック ──▶ すぐ 1 発
 *                └ 0.5 秒たつまで、次は撃てない
 *                   押しっぱなしなら、空いた瞬間にまた 1 発
 * ```
 *
 * | | |
 * | --- | --- |
 * | ため | **無い**（押した瞬間に出る） |
 * | 間隔 | **10 tick（0.5 秒）** |
 * | 押しっぱなし | **撃ち続ける**（間隔は同じ） |
 *
 * **「引く」は見せない**——見せる間が無い。
 */

import { system, world, type ItemStack, type Player } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { intervalRate } from "../../lib/attack.js";
import { shoot, stepBullets } from "./shoot.js";

/** 弓の識別子 */
export const BOW = "pve_v2:bow";

/** 素の間隔（tick）。**0.5 秒**（`docs/spec/10-bow.md` 1 章） */
const COOLDOWN = 10;

/**
 * その人のいまの間隔。
 *
 * **風・速射・追い風で縮む**（`lib/attack.ts`）。**乗算の別枠**
 *（`docs/spec/11-damage.md` 1 章）——％の袋には入れない。
 */
function cooldownOf(player: Player, now: number): number {
  // **丸めない。** 10 tick の −15％ は 8.5 tick——
  // **整数に丸めると 1 tick の差に潰れて、効いていないように見える。**
  //
  // **いまの時刻を渡す**のも大事（雷速・烈風は「直後だけ」効くため）。
  return Math.max(2, COOLDOWN * intervalRate(player, now));
}

/** 最後に撃った時刻。**メモリだけ。** `/reload` で消えてよい */
const firedAt = new Map<string, number>();

/** いま押している人。**離すまで撃ち続ける** */
const holding = new Set<string>();

/** その人が持っているのは弓か */
function heldBow(player: Player): ItemStack | undefined {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    const item = c?.getItem(player.selectedSlotIndex);
    return item?.typeId === BOW ? item : undefined;
  } catch {
    return undefined;
  }
}

/** 撃てるなら撃つ。**撃ったら true** */
function tryFire(player: Player, now: number): boolean {
  const last = firedAt.get(player.id);
  if (last !== undefined && now - last < cooldownOf(player, now)) return false;
  const item = heldBow(player);
  if (item === undefined) return false;
  firedAt.set(player.id, now);
  shoot(player);
  return true;
}

function subscribe(): void {
  // ---- 押した。**その場で 1 発**
  world.afterEvents.itemStartUse.subscribe((ev) => {
    if (ev.itemStack?.typeId !== BOW) return;
    holding.add(ev.source.id);
    tryFire(ev.source, system.currentTick);
  });

  // ---- 離した
  world.afterEvents.itemStopUse.subscribe((ev) => {
    if (ev.itemStack?.typeId !== BOW) return;
    holding.delete(ev.source.id);
  });
  world.afterEvents.itemReleaseUse.subscribe((ev) => {
    if (ev.itemStack?.typeId !== BOW) return;
    holding.delete(ev.source.id);
  });
}

/**
 * 押しっぱなしの人を撃たせる。
 *
 * **覚えているものではなく、いま持っているものを見る**（`docs/imp.md` 10-7）——
 * `/reload` や持ち替えで記録がずれても、次の周期で戻る。
 */
function tick(now: number): void {
  // **飛んでいる弾を進める**（撃っていない間も動く）
  stepBullets(now);

  if (holding.size === 0) return;
  for (const id of holding) {
    const player = world.getAllPlayers().find((p) => p.id === id);
    if (player === undefined) {
      holding.delete(id);
      continue;
    }
    if (heldBow(player) === undefined) {
      holding.delete(id);
      continue;
    }
    tryFire(player, now);
  }
}

export const bow: Feature = {
  name: "bow",
  subscribe,
  tick: { every: 1, run: tick },
};
