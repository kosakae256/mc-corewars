/**
 * 弓（Archer）。
 *
 * ## 銃のように撃つ
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
 * | 間隔 | **10 tick（0.5 秒）÷ 攻撃速度** |
 * | 押しっぱなし | **撃ち続ける** |
 *
 * **「引く」は見せない**——見せる間が無い。
 *
 * ## 間隔は「割り算」ではなく「溜め」で作る
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md` 3 章。
 *
 * ```
 * 毎 tick   溜め ＝ min(溜め ＋ 攻撃速度, 10)
 * 撃てる    溜め ≧ 10
 * 撃ったら  溜め ← 溜め − 10
 * ```
 *
 * > ### tick は整数なので、素直に割ると刻みが潰れる
 * >
 * > **10 ÷ 1.05 ＝ 9.52 → 丸めると 10 のまま。**
 * > **1 回目の強化で何も起きない。**
 * > **溜めなら平均で正しく縮む**——9 tick と 10 tick が交互に来る。
 *
 * **溜めは 10 で頭打ち**——**撃たずに待って連射を貯める、ができない。**
 */

import { system, world, type ItemStack, type Player } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { hasteOf } from "../../services/growth.js";
import { shoot, stepBullets } from "./shoot.js";

/** 弓の識別子 */
export const BOW = "pve_v3:bow";

/** 溜め切りの値（tick）。**攻撃速度 1.0 なら 10 tick ＝ 0.5 秒** */
const COOLDOWN = 10;

/** いまの溜め。**メモリだけ。** `/reload` で消えてよい */
const charge = new Map<string, number>();

/** その人の溜め。**知らない人は満タン**——持ち替えた直後に 1 発出るように */
function chargeOf(id: string): number {
  return charge.get(id) ?? COOLDOWN;
}

/** 溜める。**上限は COOLDOWN**（貯め込めない） */
function fill(player: Player): void {
  charge.set(player.id, Math.min(COOLDOWN, chargeOf(player.id) + hasteOf(player)));
}

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
function tryFire(player: Player): boolean {
  if (chargeOf(player.id) < COOLDOWN) return false;
  if (heldBow(player) === undefined) return false;
  charge.set(player.id, chargeOf(player.id) - COOLDOWN);
  shoot(player);
  return true;
}

function subscribe(): void {
  // ---- 押した。**その場で 1 発**
  world.afterEvents.itemStartUse.subscribe((ev) => {
    if (ev.itemStack?.typeId !== BOW) return;
    holding.add(ev.source.id);
    tryFire(ev.source);
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

  // **溜めは全員ぶん進める**——押していない間も溜まる
  for (const p of world.getAllPlayers()) fill(p);

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
    tryFire(player);
  }
}

export const bow: Feature = {
  name: "bow",
  subscribe,
  tick: { every: 1, run: tick },
};
