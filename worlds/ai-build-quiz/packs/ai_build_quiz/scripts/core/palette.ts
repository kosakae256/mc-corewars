/**
 * 置いてよいブロック（**許可リスト**）。`docs/spec/14-build.md` 4 章。
 *
 * 外から来た名前をそのまま id にしない（imp.md 8-1）。
 * 羊毛・コンクリート・テラコッタの各 16 色 ＋ `hardened_clay`（genlab の `palette_data.json` と同じ 49 種）。
 */

const COLORS = [
  "white",
  "light_gray",
  "gray",
  "black",
  "brown",
  "red",
  "orange",
  "yellow",
  "lime",
  "green",
  "cyan",
  "light_blue",
  "blue",
  "purple",
  "magenta",
  "pink",
] as const;

export const ALLOWED_BLOCKS: ReadonlySet<string> = new Set([
  ...COLORS.map((c) => `${c}_wool`),
  ...COLORS.map((c) => `${c}_concrete`),
  ...COLORS.map((c) => `${c}_terracotta`),
  "hardened_clay",
]);

export const AIR = "air";

/** palette を検証し、`minecraft:` 付きの id に写す。0 番は air でなければならない */
export function resolvePalette(names: readonly string[]): string[] {
  if (names[0] !== AIR) throw new Error(`palette の 0 番が air ではない: ${String(names[0])}`);
  if (names.length > 53) throw new Error(`palette が多すぎる: ${names.length}`);
  return names.map((n, i) => {
    if (i === 0) return "minecraft:air";
    if (!ALLOWED_BLOCKS.has(n)) throw new Error(`許可していないブロック: ${n}`);
    return `minecraft:${n}`;
  });
}
