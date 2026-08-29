/**
 * どの武器で、どの属性が溜まるか。
 *
 * 仕様は `docs/spec/17-element.md` 2 章。
 *
 * ## 蓄積は武器ごとに分かれる（2026-08-29 決定）
 *
 * **弓の雷と、他の武器の雷は別物。**
 * 同じ相手でも、**武器を持ち替えれば別の溜まり**になる。
 *
 * ## 溜まらない属性もある
 *
 * **弓で溜まるのは 水・火・氷 だけ。**
 * **雷と風には「溜まる」という考えが無い**——当たればその場で効く。
 */

import { ELEMENTS, type Element } from "../../lib/element.js";

/** 武器の種類。**職業が増えたらここに足す** */
export type WeaponKind = "bow" | "other";

/** 溜まる属性の一覧（`docs/spec/17-element.md` 2-3） */
const ACCUMULATE: Readonly<Record<WeaponKind, readonly Element[]>> = {
  // 弓（Archer）
  bow: ["water", "fire", "ice"],
  // まだ無い武器。**分かるまでは全部溜まる**ことにしておく
  other: ELEMENTS,
};

/**
 * その識別子はどの武器か。
 *
 * **アイテム 1 本ごとではなく、種類でまとめる**——
 * 「弓」と「他の武器」を分けたいのであって、弓 A と弓 B を分けたいのではない。
 */
export function weaponKindOf(via: string | undefined): WeaponKind {
  if (via === undefined) return "other";
  if (via.startsWith("pve:bow")) return "bow";
  return "other";
}

/** その武器で、その属性は溜まるか */
export function accumulates(kind: WeaponKind, element: Element): boolean {
  return ACCUMULATE[kind].includes(element);
}
