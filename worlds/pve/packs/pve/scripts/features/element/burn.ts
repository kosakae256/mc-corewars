/**
 * 炎の蓄積。**1 秒おきに 5 回、それで終わり。**
 *
 * 仕様は `docs/spec/17-element.md` 3-3。
 *
 * ```
 * 当てた 1 発（与ダメ D）→ 蓄積 1 つ
 *   1 秒後  D × 15%
 *   …
 *   5 秒後  D × 15%   ← ここでこの蓄積は消える（合計 75%）
 * ```
 *
 * ## 時計は相手ごとに 1 つ（2026-08-29）
 *
 * **蓄積ごとに時計を持たせない。**
 *
 * | | |
 * | --- | --- |
 * | **初めて燃えた時** | そこから **20 tick おき**の時計が回り始める |
 * | 途中で足された蓄積 | **同じ時計に乗る**（次の鐘で 1 回目） |
 * | 鐘が鳴ったら | **燃えている蓄積を全部足して、1 回だけ削る** |
 * | 全部燃え尽きたら | **時計も止まる**（次に燃えたとき、また 20 tick 後から） |
 *
 * > **蓄積ごとに削ると、数字が散らばって読めない。**
 * > **1 秒に 1 つだけ**出るようにする（`docs/spec/15-hud.md` 4-1）。
 *
 * ## 覚え方
 *
 * **メモリだけ。** `/reload` で消えてよい——燃えは**5 秒で消えるもの。**
 */

import type { Entity } from "@minecraft/server";

/** 何 tick おきに焼くか。**1 秒** */
export const BURN_INTERVAL = 20;

/** 何回で燃え尽きるか */
export const BURN_TIMES = 5;

/** 1 回で焼く割合（与ダメに対する）。**75% ÷ 5 回** */
export const BURN_BITE = 0.15;

/** 燃えている相手 1 体 */
interface Burning {
  readonly entity: Entity;
  /** 次に焼く時刻（tick）。**相手ごとに 1 つ** */
  next: number;
  /** 燃えている蓄積（1 回ぶんの量と、残り回数） */
  stacks: { bite: number; left: number }[];
}

/** 燃えている相手。**id → 状態** */
const burning = new Map<string, Burning>();

/** 蓄積を 1 つ足す。**当てるたびに 1 つ増える** */
export function addBurn(entity: Entity, dealt: number, now: number): void {
  const bite = dealt * BURN_BITE;
  if (!(bite > 0)) return;
  let id: string;
  try {
    id = entity.id;
  } catch {
    return;
  }
  const found = burning.get(id);
  if (found === undefined) {
    // **初めて燃えた。** ここから時計が回り始める
    burning.set(id, { entity, next: now + BURN_INTERVAL, stacks: [{ bite, left: BURN_TIMES }] });
    return;
  }
  // **時計はそのまま。** 次の鐘で 1 回目が入る
  found.stacks.push({ bite, left: BURN_TIMES });
}

/**
 * 鐘が鳴った相手を返す。**1 体につき 1 つ、合計した量で。**
 *
 * 燃え尽きた蓄積はここで捨てる。
 */
export function dueBurns(now: number): { entity: Entity; bite: number }[] {
  const out: { entity: Entity; bite: number }[] = [];
  for (const [id, b] of burning) {
    if (now < b.next) continue;
    b.next = now + BURN_INTERVAL;

    let sum = 0;
    for (const s of b.stacks) {
      sum += s.bite;
      s.left -= 1;
    }
    // **5 回焼いた蓄積は無かったことになる**
    b.stacks = b.stacks.filter((s) => s.left > 0);
    if (b.stacks.length === 0) burning.delete(id);
    if (sum > 0) out.push({ entity: b.entity, bite: sum });
  }
  return out;
}

/** いま燃えている相手。**炎を出し続けるために要る**（`docs/spec/17-element.md` 5-4） */
export function burningEntities(): Entity[] {
  return [...burning.values()].map((b) => b.entity);
}
