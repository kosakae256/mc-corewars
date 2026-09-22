/**
 * **線に当たった相手から、実際に当てる相手を選ぶ。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 8 章。
 *
 * | | |
 * | --- | --- |
 * | **貫通する**（チェンバー） | **線の上に居る全員。** 手前から順に |
 * | **貫通しない**（カウボーイ） | **いちばん手前の 1 人だけ** |
 *
 * > ### **なぜ core に置くのか**（2026-09-10）
 * >
 * > **「貫通しているか」を、ゲームを起動せずに確かめられるようにするため。**
 * > **`services/beam.ts` は `@minecraft/server` を掴む**ので、テストから読めない。
 * > **選び方だけを純粋な関数にして、`npm test` に見張らせる。**
 */

/** 線に当たったもの。`at` は**線の始まりからの距離**（マス） */
export interface OnLine {
  readonly at: number;
}

/**
 * **当てる相手を選ぶ。**
 *
 * @param found 線に当たったもの（**順不同でよい**）
 * @param pierce **貫通するか**
 */
export function pierced<T extends OnLine>(found: readonly T[], pierce: boolean): readonly T[] {
  // **手前から順に**——**貫通しないときに「いちばん手前」を選べるようにする**
  const line = [...found].sort((a, b) => a.at - b.at);
  return pierce ? line : line.slice(0, 1);
}
