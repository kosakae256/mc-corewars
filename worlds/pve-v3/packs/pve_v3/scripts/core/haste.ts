/**
 * 攻撃速度の段。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 3 章。
 *
 * > ### なぜ段なのか
 * >
 * > **`melee_box_attack` の `cooldown_time` は、実行中に書き換えられない。**
 * > **段ごとの部品を実体に持たせ、湧いた瞬間に切り替える**しかない。
 *
 * > ### **刻みは「割合」で取る**（2026-09-08 決定）
 * >
 * > **×1.0 と ×1.05 の差は分かるが、×6.0 と ×6.05 は分からない。**
 * > **等間隔ではなく 5 % ずつ**にすれば、**どこでもずれは 2.5 % 以内**に収まる。
 * > **前は 6 段しかなく、×1.7 が ×1.5 に落ちていた（12 % のずれ）。**
 */

/** 1 段あたりの伸び。**5 %** */
export const HASTE_STEP = 1.05;

/**
 * **部品を用意する上限。**
 *
 * > ### 呪いの上限（×3）より広く作る
 * >
 * > **上限なしの遊び方を足すかもしれない**（2026-09-08）。
 * > **段は作っておくだけならただ同然。** 足りないと、そこで頭打ちになる。
 */
export const HASTE_TOP = 7;

/** 段の一覧（**倍率**）。`1.05^n` で `HASTE_TOP` を超えない所まで */
export const HASTE_TIERS: readonly number[] = build();

function build(): number[] {
  const out: number[] = [];
  for (let v = 1; v <= HASTE_TOP * HASTE_STEP; v *= HASTE_STEP) out.push(v);
  return out;
}

/** その段の合図に使う整数（**倍率の 100 倍**） */
export function hasteName(mult: number): number {
  return Math.round(mult * 100);
}

/**
 * その倍率に**いちばん近い段**（`hasteName` と同じ整数で返す）。
 *
 * > ### 近さは「割合」で見る
 * >
 * > **×1.0 と ×1.1 の差**と**×6.0 と ×6.1 の差**は、同じ 0.1 でも意味が違う。
 * > **比で見る**ので、どの高さでも同じだけ正確になる。
 */
export function hasteTier(mult: number): number {
  const want = Math.log(Math.max(0.01, mult));
  let best = HASTE_TIERS[0] ?? 1;
  for (const t of HASTE_TIERS) {
    if (Math.abs(Math.log(t) - want) < Math.abs(Math.log(best) - want)) best = t;
  }
  return hasteName(best);
}
