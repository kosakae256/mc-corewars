/**
 * 多数決。**純粋。何も import しない。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 3-2。
 *
 * > ### 切り出した理由
 * >
 * > **`@minecraft/server` に触れない形にして、テストで固める**
 * > （`core/grid.ts` と同じ理由）。
 */

/**
 * いちばん票の多いものを選ぶ。**同数なら、その中から引く。**
 *
 * **誰も入れていなければ全部 0 票**——そのまま「同数」として引く。
 *
 * @param roll 0〜1 を返すもの（テストでは決め打ちにする）
 */
export function winner(votes: readonly number[], roll: () => number): number {
  let best = -1;
  const tied: number[] = [];
  for (let i = 0; i < votes.length; i++) {
    const n = votes[i] ?? 0;
    if (n > best) {
      best = n;
      tied.length = 0;
      tied.push(i);
    } else if (n === best) {
      tied.push(i);
    }
  }
  return tied[Math.min(tied.length - 1, Math.floor(roll() * tied.length))] ?? 0;
}
