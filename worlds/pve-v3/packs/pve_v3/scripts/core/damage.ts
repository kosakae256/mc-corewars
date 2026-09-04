/**
 * ダメージの計算。**Minecraft API に触らない。**
 *
 * 仕様は `docs/01-rules.md` 2 章・3-5。
 *
 * ## 式は 1 つだけ
 *
 * ```
 * 削る HP = 最終攻撃力 × (1 − 防御率)
 * ```
 *
 * | | |
 * | --- | --- |
 * | **最終攻撃力** | バフを全部乗せ**終えた**値。ここへ来る前に確定している |
 * | **防御率** | **−100〜100 の %。** 0 で素通り、100 で完全カット、**負で増える** |
 *
 * **軽減はこの 1 段だけ。** 防具も耐性も無い（`docs/01-rules.md` 3-5）。
 */

/**
 * 防御率の下限・上限（%）。
 *
 * **下限は 0 ではなく −100。**
 *
 * > **負の防御率は「受けるダメージが増える」という意味**
 * >（`docs/spec/11-damage.md` 3 章、`docs/spec/10-bow.md` 3-4）。
 * > 属性の水がこれを作る。
 *
 * **0 で止めていたので、水がまったく効いていなかった**（2026-08-29 に直した）。
 */
const DEF_MIN = -100;
const DEF_MAX = 100;

/** 防御率を −100〜100 に収める。**読めない値は 0**（素通り） */
export function clampDefense(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.max(DEF_MIN, Math.min(DEF_MAX, percent));
}

/**
 * 削る HP。
 *
 * @param attack 最終攻撃力
 * @param defensePercent 防御率（0〜100 の %）
 */
export function finalDamage(attack: number, defensePercent = 0): number {
  if (!Number.isFinite(attack) || attack <= 0) return 0;
  const cut = clampDefense(defensePercent) / 100;
  return attack * (1 - cut);
}
