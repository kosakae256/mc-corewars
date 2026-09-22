/**
 * ノックバックの決め方。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 4 章。
 *
 * ```
 * 押す強さ ＝ その攻撃の強さ × (1 − 受け手の軽減)
 * ```
 *
 * > ### **攻撃ごとに変えられる。受け手ごとに減らせる**
 * >
 * > **モブの攻撃によって、押す強さは違ってよい。**
 * > **モーション強化で「ノックバック軽減 30%」を付ける**——そういう作りにしておく。
 *
 * > ### **上へは飛ばさない**（2026-09-08 決定）
 * >
 * > **浮くと、着地するまで動けない。**
 * > **上向きの値は持てる**が、**既定は 0。** 使うのは「打ち上げる技」を作るときだけ。
 */

/** 何も言われなければ、この強さで押す */
export const KNOCK_H = 0.9;

/** 上へ飛ばす既定。**0 ＝ 浮かせない** */
export const KNOCK_UP = 0;

/** 軽減の上限。**完全に無効にはしない**（当たった手応えは残す） */
export const RESIST_CAP = 0.9;

/**
 * **実際に押す強さ。**
 *
 * @param power その攻撃の強さ（省略なら `KNOCK_H`）
 * @param resist 受け手の軽減（0〜1）
 */
export function knockPower(power: number | undefined, resist: number): number {
  const base = power === undefined ? KNOCK_H : Math.max(0, power);
  const cut = Math.min(RESIST_CAP, Math.max(0, resist));
  return base * (1 - cut);
}
