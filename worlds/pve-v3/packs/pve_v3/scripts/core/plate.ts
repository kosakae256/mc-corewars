/**
 * 名札の組み立て。**Minecraft API に触らない。**
 *
 * 仕様は `docs/spec/12-hud.md` 3 章。
 *
 * ```
 * グラント             ← 名前
 * §a|||||||§0|||||||   ← HP バー
 * §7HP §f120§7/200     ← HP の数値（デバッグ）
 * ```
 *
 * ## 空の行は出さない
 *
 * **出すと塊が縦に伸びて、隣のモブと混ざる**（`docs/spec/12-hud.md` 1-1）。
 */

/** 名札に積むもの。**無いものは出ない** */
export interface PlateParts {
  readonly name: string;
  readonly bar: string;
  /** HP の数値 */
  readonly hp?: string;
}

/** 名札 1 つぶんの文字列 */
export function plateText(parts: PlateParts): string {
  return [parts.name, parts.bar, parts.hp]
    .filter((line): line is string => line !== undefined && line.length > 0)
    .join("\n");
}
