/**
 * 休憩所の門 3 つ。**次の 3 戦の相手を選ぶ。純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 3-2。
 *
 * ```
 * 門 1: ★1 ゾンビ → ★1 スケルトン → ★3 略奪者
 * 門 2: ★1 クリーパー → ★3 略奪者 → ★1 ゾンビ
 * 門 3: …
 * ```
 *
 * **多数決。** 同数なら、その中からランダム（仮）。
 */

import { LEGIONS, type LegionDef } from "./enemy.js";
import { RUN_LENGTH } from "./state.js";
export { winner } from "./tally.js";

/** 門 1 つぶん。**3 戦ぶんの敵グループ** */
export type Offer = readonly string[];

/** 門の数 */
export const GATES = 3;

/** その候補の★の平均（板に出す／モブの色になる） */
export function averageStar(offer: Offer): number {
  if (offer.length === 0) return 1;
  let sum = 0;
  for (const id of offer) sum += LEGIONS[id]?.star ?? 1;
  return sum / offer.length;
}

/**
 * ★の平均の色。**重いほど赤い**（`13-flow.md` 3-2）。
 *
 * | 平均 | 色 |
 * | --- | --- |
 * | 〜1.5 | §a 緑 |
 * | 〜2.5 | §e 黄 |
 * | 〜3.5 | §6 橙 |
 * | 〜4.5 | §c 赤 |
 * | それ以上 | §4 暗い赤 |
 */
export function starColor(avg: number): string {
  if (avg < 1.5) return "§a";
  if (avg < 2.5) return "§e";
  if (avg < 3.5) return "§6";
  if (avg < 4.5) return "§c";
  return "§4";
}

/** 板に出す名前の字数。**はみ出すと板が伸びて崩れる**（`13-flow.md` 3-2） */
const NAME_LEN = 14;

/** 決まった字数に切る／伸ばす */
function fit(text: string): string {
  return text.length > NAME_LEN ? `${text.slice(0, NAME_LEN - 1)}…` : text.padEnd(NAME_LEN, " ");
}

/** 板の 1 行（1 戦ぶん） */
export function lineOf(id: string): string {
  const def: LegionDef | undefined = LEGIONS[id];
  if (def === undefined) return `§8?   ${fit(id)}`;
  return `§e★${def.star}  §f${fit(def.name)}`;
}

/**
 * 候補を引く。
 *
 * **同じ敵グループが並ぶこともある**——まだ 4 つしか無いため（`16-enemy.md` 6 章）。
 *
 * @param roll 0〜1 を返すもの（テストでは決め打ちにする）
 */
export function drawOffers(roll: () => number): readonly Offer[] {
  const ids = Object.keys(LEGIONS);
  const pick = (): string => ids[Math.min(ids.length - 1, Math.floor(roll() * ids.length))] ?? "zombie";
  const out: Offer[] = [];
  for (let g = 0; g < GATES; g++) {
    const run: string[] = [];
    for (let i = 0; i < RUN_LENGTH; i++) run.push(pick());
    out.push(run);
  }
  return out;
}
