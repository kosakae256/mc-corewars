/**
 * **何をいくつ出すか。** **純粋**（`docs/spec/16-enemy.md` 3 章）。
 *
 * ```
 * 出したい数 ＝ 固定数 ＋ 人数 × 1 人あたりの数
 * 上限       ＝ min(100, 40 ＋ 10 × wave)
 * 実際に出る数 ＝ min(出したい数, 上限)
 * 丸め係数   ＝ 出したい数 ÷ 実際に出る数
 * ```
 *
 * **`core/enemy.ts` から切り出した**（2026-09-10）——**1 ファイル 300 行の上限に収めるため。**
 */

import type { EnemyDef, LegionDef } from "./enemy.js";

/** 出す中身 */
export interface Plan {
  /** 出す数（実際に出る数） */
  readonly count: number;
  /** **上限に当たったぶんを HP に詰め替える係数** */
  readonly pack: number;
  /** 何をいくつ出すか */
  readonly picks: readonly { readonly enemy: EnemyDef; readonly count: number }[];
}

/**
 * 数の人数倍率。**人数 × 0.5 ＋ 0.5**（`16-enemy.md` 3-1）。
 *
 * | 人数 | 1 | 2 | 4 | 10 |
 * | --- | --- | --- | --- | --- |
 * | 倍率 | 1.0 | 1.5 | 2.5 | **5.5** |
 */
export function countScale(players: number): number {
  return Math.max(1, players) * 0.5 + 0.5;
}

/** そのウェーブで出せる上限。**min(100, 40 ＋ 10 × wave)** */
export function capOf(wave: number): number {
  return Math.min(100, 40 + 10 * wave);
}

/**
 * 出す中身を決める。
 *
 * @param players 参加人数
 * @param wave いまのウェーブ
 */
export function planOf(
  legion: LegionDef,
  players: number,
  wave: number,
  table: Readonly<Record<string, EnemyDef>>,
  roll: () => number = Math.random
): Plan {
  // > ### **(初期数 ＋ wave で増える数) × 人数倍率**（`16-enemy.md` 3-1）
  // >
  // > **v2 と同じ形**。**v3 で軍団ごとの基礎数に移したとき、wave の項が落ちていた**
  // > （2026-09-10 に戻した）。
  const want = Math.ceil((legion.fixed + legion.perWave * (Math.max(1, wave) - 1)) * countScale(players));
  const cap = capOf(wave);
  const count = Math.min(want, cap);
  const pack = count > 0 ? want / count : 1;

  // > ### **確率で 1 体ずつ引く**（2026-09-10）
  // >
  // > **比率で割り振ると、毎回きっちり同じ顔ぶれになる。**
  // > **10 体なら 10 回引く**——**少数だと偏る。それでよい。**
  const found = new Map<string, number>();
  const total = legion.mix.reduce((sum, m) => sum + Math.max(0, m.weight), 0);
  for (let i = 0; i < count && total > 0; i++) {
    let point = roll() * total;
    let chosen = legion.mix[legion.mix.length - 1]?.enemy;
    for (const m of legion.mix) {
      point -= Math.max(0, m.weight);
      if (point < 0) {
        chosen = m.enemy;
        break;
      }
    }
    if (chosen === undefined) continue;
    found.set(chosen, (found.get(chosen) ?? 0) + 1);
  }

  const picks: { enemy: EnemyDef; count: number }[] = [];
  for (const [id, n] of found) {
    const def = table[id];
    if (def !== undefined && n > 0) picks.push({ enemy: def, count: n });
  }
  return { count, pack, picks };
}
