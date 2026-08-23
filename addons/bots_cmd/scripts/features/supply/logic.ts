/**
 * 補給の判定ロジック。純粋関数だけを置く。
 *
 * Minecraft の API に依存しないので、単体で検証できる
 * （docs/imp.md「要するに」3）。
 */

/**
 * 補充が必要かを判定する。
 *
 * @param currentTypeId いま該当スロットに入っているアイテムの ID。空なら `undefined`
 * @param currentAmount いまの個数
 * @param wantTypeId 入れておきたいアイテムの ID
 * @param threshold この個数を下回ったら補充する
 */
export function needsRefill(
  currentTypeId: string | undefined,
  currentAmount: number,
  wantTypeId: string,
  threshold: number
): boolean {
  // 別のアイテムが入っている、または空なら入れ替える
  if (currentTypeId !== wantTypeId) return true;
  return currentAmount < threshold;
}
