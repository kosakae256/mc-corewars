/** 自分のHP欄の文字列。通信の接頭辞と表示の組み立てを一か所に置く（spec/39）。 */

export const HP_HUD_PREFIX = "pve3:hp:";
export const MONEY_HUD_PREFIX = "pve3:money:";

/** ロケールやIntlの有無に依存せず、所持数を3桁ずつ区切る。 */
export function moneyHudText(amount: number, now: number, max: number): string {
  const value = Number.isFinite(amount) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(amount))) : 0;
  const { hp, cap } = hpValues(now, max);
  const filled = hp > 0 && cap > 0 ? Math.max(1, Math.round((hp / cap) * 96)) : 0;
  // UIでは数値計算せず、塗り幅に対応する透過画像を選ぶ。欄長10文字は保つ。
  const frame = `f${String(filled).padStart(2, "0")}_______`;
  const text = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const font = text.length <= 7 ? "K" : text.length <= 10 ? "L" : text.length <= 14 ? "M" : "N";
  return `${MONEY_HUD_PREFIX}${frame}${font}:§a${text}`;
}

function hpValues(now: number, max: number): { hp: number; cap: number } {
  const cap = Number.isFinite(max) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(max))) : 0;
  const hp = Number.isFinite(now) ? Math.round(Math.max(0, Math.min(now, cap))) : 0;
  return { hp, cap };
}

/** 中央の数字は直接表示する。残量データの抽出には依存させない。 */
export function hpHudText(now: number, max: number): string {
  const { hp, cap } = hpValues(now, max);
  return `${HP_HUD_PREFIX}§f${hp}/${cap}`;
}
