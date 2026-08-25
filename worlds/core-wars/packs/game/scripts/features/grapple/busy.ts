/**
 * どちらの装置を使っているか。
 *
 * 仕様は `docs/spec/21-grapple-v2.md` 5章。
 *
 * ## なぜ分けて置くのか
 *
 * **ガスの回復を止める判断は 1 箇所でないと食い違う。**
 *
 * v1 は「自分のワイヤーが無ければ回復させる」と書いてある。
 * v2 が別の場所にワイヤーを持っていると、
 * **v2 で飛んでいる間も v1 が回復させてしまう。**
 *
 * ここは**何も import しない。** 両方から見に来られるようにするため。
 */

/** ワイヤーを使っている最中の人。**刺しているだけの間も含む** */
const busy = new Set<string>();

/** ワイヤーを離れてから、まだ着地していない人 */
const flying = new Set<string>();

/** 使い始め／使い終わり */
export function setBusy(playerId: string, on: boolean): void {
  if (on) busy.add(playerId);
  else busy.delete(playerId);
}

/** いま使っているか */
export function isBusy(playerId: string): boolean {
  return busy.has(playerId);
}

/** ワイヤーを離れた。**着地するまでガスは戻らない** */
export function markFlying(playerId: string): void {
  flying.add(playerId);
}

/** 着地した */
export function land(playerId: string): void {
  flying.delete(playerId);
}

/** まだ浮いているか */
export function isFlying(playerId: string): boolean {
  return flying.has(playerId);
}
