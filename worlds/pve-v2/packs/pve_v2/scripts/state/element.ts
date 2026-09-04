/**
 * 属性値。**プレイヤーが持つ。**
 *
 * 仕様は `docs/spec/12-element.md`。
 *
 * ## 5 つの数字がすべて
 *
 * | 属性 | 何に効くか | 1 点あたり | 20 点で |
 * | --- | --- | --- | --- |
 * | **雷** | クリティカル率 | ＋2.5％ | 率 ＋50％ |
 * | **火** | 通常攻撃の威力 | ＋2.5％ | ＋50％ |
 * | **風** | 足の速さ | 速さ ＋5％ | ＋100％ |
 * | **水** | 防御 | 2.5％ カット | 50％ カット |
 * | **氷** | 鈍化の蓄積 | 蓄積率 ＋5％ | 蓄積率 100％ |
 *
 * **火と氷の与ダメ増は「加算の袋」に入る**（`docs/spec/11-damage.md` 1 章）。
 * **雷は率だけ**——倍率はエンチャント「会心強化」でしか伸びない。
 */

import type { Player } from "@minecraft/server";

import { elementKey } from "./keys.js";

/** 属性の並び。**表示もこの順** */
export const ELEMENTS = ["fire", "thunder", "wind", "water", "ice"] as const;

export type Element = (typeof ELEMENTS)[number];

/** 属性値の上限（`docs/spec/12-element.md` 1 章） */
export const EL_MAX = 20;

/** 表示名 */
export const EL_NAME: Record<Element, string> = {
  fire: "火",
  thunder: "雷",
  wind: "風",
  water: "水",
  ice: "氷",
};

/** 日本語からも引けるようにする。**コマンドで `/pve:el 火 10` と打ちたい** */
export function toElement(word: string): Element | undefined {
  const hit = ELEMENTS.find((e) => e === word || EL_NAME[e] === word);
  return hit;
}

/** その人の属性値（0〜20） */
export function get(player: Player, el: Element): number {
  try {
    const v = player.getDynamicProperty(elementKey(el));
    return typeof v === "number" ? clamp(v) : 0;
  } catch {
    return 0;
  }
}

/** 置く。**0〜20 に収める** */
export function set(player: Player, el: Element, value: number): number {
  const next = clamp(value);
  try {
    player.setDynamicProperty(elementKey(el), next);
  } catch {
    /* 消えている */
  }
  return next;
}

/** 全部 */
export function all(player: Player): Record<Element, number> {
  return {
    fire: get(player, "fire"),
    thunder: get(player, "thunder"),
    wind: get(player, "wind"),
    water: get(player, "water"),
    ice: get(player, "ice"),
  };
}

/** 合計 */
export function total(player: Player): number {
  return ELEMENTS.reduce((sum, el) => sum + get(player, el), 0);
}

/** 平均（0〜20）。**5 属性平均の札が見る値** */
export function average(player: Player): number {
  return total(player) / ELEMENTS.length;
}

/** `x`（0.00〜1.00）。**式はこれを掛ける**（`docs/spec/12-element.md` 1 章） */
export function ratio(player: Player, el: Element): number {
  return get(player, el) / EL_MAX;
}

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(EL_MAX, Math.round(v)));
}

// ---------------------------------------------------------------- 効き方
//
// **1 点あたりの値はここだけ。** 仕様を変えたらここを直す

/** 火——通常攻撃の威力。**加算の袋に入れる値**（20 点で 0.50） */
export function fireAdd(player: Player): number {
  return 0.025 * get(player, "fire");
}

/** 雷——クリティカル率（0〜0.5） */
export function thunderCrit(player: Player): number {
  return 0.025 * get(player, "thunder");
}

/** 風——足の速さ（1.0〜2.0） */
export function windSpeed(player: Player): number {
  return 1 + 0.05 * get(player, "wind");
}

/**
 * 風——撃つ間隔。**属性では変えない**（2026-08-31 決定）。
 *
 * **攻撃速度はエンチャントの担当**（速射・追い風・矢継ぎ早・雷速）。
 * **属性は足の速さだけ**にして、役割を分ける。
 */
export function windInterval(_player: Player): number {
  return 1;
}

/** 水——防御率（％。0〜50）。**`lib/damage.ts` は％で受け取る** */
export function waterDefense(player: Player): number {
  return 2.5 * get(player, "water");
}

/** 氷——蓄積率（0〜1.0）。**当てた威力にこれを掛けて溜める** */
export function iceFill(player: Player): number {
  return 0.05 * get(player, "ice");
}

// **氷は威力を持たない**（2026-08-31 決定）。
//
// **属性は ❄ を溜めるだけ**——威力は札（砕氷）、特殊攻撃は札（絶対零度）が担当する。
// **同じ「鈍化した敵への威力」を属性と札の両方が持っていて、二重に乗っていた。**

// ---------------------------------------------------------------- 値段
//
// `docs/spec/12-element.md` 1-1（**5 刻み**）

/** n 点目の値段（エメラルド） */
export function price(n: number): number {
  return 20 + 5 * (Math.max(1, Math.round(n)) - 1);
}

/** 0 から N 点までの合計 */
export function priceTotal(n: number): number {
  const N = Math.max(0, Math.round(n));
  return N * (20 + 2.5 * (N - 1));
}
