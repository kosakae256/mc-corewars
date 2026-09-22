/**
 * **状態異常。** **殴られた人・浴びた人に付く。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 5 章。
 *
 * | | 誰が使うか | 中身 |
 * | --- | --- | --- |
 * | **鈍足** | 冷気（★2） | **バニラの効果**（`slowness`）をそのまま付ける |
 * | **毒** | 劇薬（★3） | **最大 HP の割合**を、時間をかけて削る（バニラの毒は使わない） |
 *
 * ## なぜ毒はバニラを使わないのか
 *
 * > ### **こちらの HP はバニラの体力ではない**（`24-mob-howto.md` 4 章）
 * >
 * > **バニラの毒はバニラの体力を削る。** **こちらの HP には効かない。**
 * > **自分で刻む。**
 */

import { Player, world } from "@minecraft/server";

import { AILMENT } from "../core/tuning.js";
import { hit } from "./combat.js";
import { has, max as maxHp } from "../state/hp.js";

/** 鈍足を付ける。**書かなかった値は既定** */
export function slow(target: Player, amp?: number, ticks?: number): void {
  try {
    // > ### **モヤは出さない**（2026-09-08 決定）
    // >
    // > **効果の粒が画面いっぱいに出て、敵が見えなくなる。**
    // > **`/effect give @s slowness <秒> <強さ> true` の `true` と同じ。**
    target.addEffect("slowness", ticks ?? AILMENT.slowTicks, {
      amplifier: amp ?? AILMENT.slowAmp,
      showParticles: false,
    });
  } catch {
    /* 消えている */
  }
}

/** 掛かっている毒 */
interface Poison {
  /** 残り（tick） */
  left: number;
  /** 1 回で削る量 */
  readonly each: number;
  readonly gap: number;
}

const poisons = new Map<string, Poison>();

/**
 * 毒を付ける。
 *
 * > ### **重ねずに、時間を戻す**（`07-enemy-plan.md` 劇薬）
 * >
 * > **もう一度受けると、残り時間が最初に戻る。** **削る量は積み上がらない。**
 *
 * @param pct 合計で削る割合（最大 HP の %）。**書かなければ既定**
 */
export function poison(target: Player, pct?: number, ticks?: number, gap?: number): void {
  const cap = maxHp(target) ?? 0;
  if (cap <= 0) return;
  const life = ticks ?? AILMENT.poisonTicks;
  const step = gap ?? AILMENT.poisonGap;
  const times = Math.max(1, Math.floor(life / step));
  const total = (cap * (pct ?? AILMENT.poisonPct)) / 100;
  poisons.set(target.id, { left: life, each: Math.max(1, Math.round(total / times)), gap: step });
}

/** 毒を刻む。**毎 tick** */
export function stepAilments(now: number): void {
  if (poisons.size === 0) return;
  for (const [id, p] of [...poisons]) {
    // > ### **削る前に刻む**（**踏んだ**・2026-09-09）
    // >
    // > **先に 1 減らしてから見ていたので、最初の 1 回が抜けていた。**
    // > **「5 秒かけて 5 回」と決めたのに 4 回しか入らない。**
    const due = p.left % p.gap === 0;
    p.left -= 1;
    if (p.left <= 0) poisons.delete(id);
    if (!due) continue;
    try {
      const target = idToPlayer(id);
      if (target === undefined || !has(target)) {
        poisons.delete(id);
        continue;
      }
      hit({ target, attack: p.each, kind: "extra" });
    } catch {
      poisons.delete(id);
    }
  }
  void now;
}

/** id からその人を引く */
function idToPlayer(id: string): Player | undefined {
  try {
    const e = world.getEntity(id);
    return e instanceof Player ? e : undefined;
  } catch {
    return undefined;
  }
}
