/**
 * ★の色。
 *
 * 仕様は `docs/spec/10-implementation.md` 8-2。
 *
 * ## なぜ色を分けるのか
 *
 * > ### **名前だけでは、強さが読めない**
 * >
 * > **「将軍ゾンビ」と「衛兵ゾンビ」が同じ赤で並ぶ。**
 * > **どちらを先に処理すべきかが、名前を読まないと分からない。**
 *
 * **色は名前より先に目に入る。** 見た瞬間に格が分かるようにする。
 *
 * ## ★5 は**その敵ごと**に色を持つ

**★1〜★4 は格の色**——同じ★なら同じ色。**★5 だけは 1 体ずつ違う色**を持つ
（`EnemyDef.color`）。**★5 は数が少なく、1 体ずつが顔になる。**

**太字は ★5 全部に付く。** 色が違っても、**★5 だということは共通で分かる。**
 */

/** ★1〜★4 の色。**灰 → 緑 → 水 → 紫**（薄い順） */
const COLOR: Readonly<Record<number, string>> = {
  1: "§7",
  2: "§a",
  3: "§b",
  4: "§d",
};

/** ★5 で色を書き忘れたとき */
const TOP = "§6";

/** ★が無いときの色 */
const NONE = "§c";

/**
 * ★の色を付けた名前。
 *
 * > ### **色記号は書式を打ち消す**
 * >
 * > **`§l`（太字）より先に色を書く。** 逆にすると太字が消える。
 *
 * @param name そのままの名前
 * @param star ★の数。**無ければ既定の赤**
 * @param color **★5 のときの固有色**（`EnemyDef.color`）
 */
export function starLabel(name: string, star: number | undefined, color?: string): string {
  if (star === undefined) return NONE + name;
  if (star >= 5) return `${color ?? TOP}§l[★${star}] ${name}`;
  return `${COLOR[star] ?? NONE}[★${star}] ${name}`;
}
