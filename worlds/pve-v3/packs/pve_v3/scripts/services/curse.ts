/**
 * 呪いを引いて、積んで、見せる。
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md` 4 章。
 *
 * ```
 * ウェーブを倒し切った → n 個引く → 積む → 全員に見せる
 * ```
 *
 * > ### **引いたものは必ず見せる**（`16-enemy.md` 4 章）
 * >
 * > **見せないと理不尽にしか見えない。**
 *
 * **数え方は `core/curse.ts`（純粋）。ここは引いて、書いて、伝えるだけ。**
 */

import { world } from "@minecraft/server";

import { CURSE_NAME, draw, drawCount, multsOf, type CurseKind } from "../core/curse.js";
import { addCurse, clearCurse, curseCount } from "../state/curse.js";

/** 積み上がりを全部落とす。**試合を始めるとき** */
export function resetCurse(): void {
  clearCurse();
}

/** いまの倍率 */
export function curseMults(): ReturnType<typeof multsOf> {
  return multsOf(curseCount());
}

/**
 * そのウェーブぶんを引く。**倒し切ったときに 1 度だけ。**
 *
 * @returns 引いたもの（**同じものが並ぶこともある**）
 */
export function rollCurse(wave: number): CurseKind[] {
  const picks = draw(curseCount(), drawCount(wave), Math.random);
  if (picks.length === 0) return picks;
  addCurse(picks);
  tell(picks);
  return picks;
}

/** 引いたものを、全員に見せる */
function tell(picks: readonly CurseKind[]): void {
  // **同じものは数でまとめる**——「HP HP HP」と並べても読めない
  const n = new Map<CurseKind, number>();
  for (const k of picks) n.set(k, (n.get(k) ?? 0) + 1);
  const now = multsOf(curseCount());
  const line = [...n].map(([k, c]) => `§c${CURSE_NAME[k]}${c > 1 ? ` §f×${c}` : ""}`).join("§7 ／ ");
  const after =
    `§7いまの敵 §8HP §f×${now.hp.toFixed(2)} §8攻撃力 §f×${now.power.toFixed(2)} ` +
    `§8移動速度 §f×${now.speed.toFixed(2)} §8攻撃速度 §f×${now.haste.toFixed(2)}`;
  try {
    for (const p of world.getAllPlayers()) {
      p.sendMessage(`§4§l呪い §r${line}§7 が積まれた`);
      p.sendMessage(after);
    }
  } catch {
    /* 誰も居ない */
  }
}
