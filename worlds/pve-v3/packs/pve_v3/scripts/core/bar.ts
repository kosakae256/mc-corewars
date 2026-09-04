/**
 * 目盛りの帯。**Minecraft API に触らない。**
 *
 * 仕様は `docs/spec/12-hud.md` 3-1。
 *
 * ```
 * §a|||||||||||||§0|||||||
 * ```
 *
 * **HP は 3 桁ある。** 数字だけでは、減ったことが目に入らない。
 * **帯は「どれだけ残っているか」を、読まずに伝える。**
 */

/** 目盛り 1 つぶんの字。**細い字を使う**（太いと塊に見える） */
const MARK = "|";

/** 減った所の色。**黒**（背景を暗くして、残りだけが目に入る） */
const EMPTY = "§0";

/**
 * 残りの色。**25% ごとに変える**（`docs/spec/12-hud.md` 3-1）。
 *
 * **色は 16 色しか無い。** なめらかには変えられないので、**4 段**にする。
 */
const COLORS: readonly { readonly over: number; readonly color: string }[] = [
  { over: 0.75, color: "§a" }, // 緑
  { over: 0.5, color: "§e" }, // 黄
  { over: 0.25, color: "§6" }, // 橙
  { over: 0, color: "§c" }, // 赤
];

/** 帯の長さ（目盛りの数）。**20 本＝5% きざみ** */
export const SEGMENTS = 20;

/** その割合のときの色 */
export function barColor(rate: number): string {
  for (const c of COLORS) {
    if (rate > c.over) return c.color;
  }
  return "§c";
}

/**
 * 帯 1 本。
 *
 * **0 でも空の帯を返す**（消さない）。消えると「表示が壊れた」ように見える。
 *
 * @param segments 目盛りの数。**短く出したいときだけ変える**
 */
export function bar(now: number, max: number, segments: number = SEGMENTS): string {
  const n = Math.max(1, Math.round(segments));
  if (!Number.isFinite(now) || !Number.isFinite(max) || max <= 0) {
    return EMPTY + MARK.repeat(n);
  }
  const rate = Math.max(0, Math.min(1, now / max));
  // **残っていれば必ず 1 目盛り出す。** 0 と「わずかに残っている」を見分けるため
  const filled = now > 0 ? Math.max(1, Math.round(rate * n)) : 0;
  return barColor(rate) + MARK.repeat(filled) + EMPTY + MARK.repeat(n - filled);
}

/** 「いま/最大」の数字。**帯だけでは細かい差が読めない** */
export function hpNumber(now: number, max: number): string {
  return `§f${Math.round(Math.max(0, now))}§7/${Math.round(max)}`;
}
