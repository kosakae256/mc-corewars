/**
 * 属性の見せ方は、**武器の種類ごとに違う。**
 *
 * 仕様は `docs/spec/17-element.md` 5 章、`docs/spec/11-structure.md` 2-3。
 *
 * > ### 弓のいまの絵は「弓の分」。共通ではない。
 * >
> * **同じ火でも、弓は矢が燃え、剣は刃が燃える。**
 * 武器の種類が増えたら、**ここに 1 段足す。**
 *
 * ## 何を持つか
 *
 * | | |
 * | --- | --- |
 * | `hit` | **当たった瞬間**の粒 |
 * | `state` | **溜まっている間**ずっと出す粒 |
 * | `burst` | **満ちた瞬間**に重ねる粒 |
 * | `sound` | **炸裂の音** |
 * | `flame` | **バニラの炎を散らす**（火だけ。`docs/spec/17-element.md` 5-6） |
 */

import type { Element } from "../../lib/element.js";
import type { WeaponKind } from "./gauges.js";

/** 属性 1 つぶんの見せ方 */
export interface ElementLook {
  readonly hit?: string;
  readonly state?: string;
  readonly burst?: readonly string[];
  readonly sound?: string;
  readonly flame?: boolean;
}

/** 弓（Archer）の見せ方 */
const BOW: Readonly<Partial<Record<Element, ElementLook>>> = {
  water: { hit: "pve:el_water", state: "pve:el_water_wet" },
  // **雷は 1 枚の絵ではない**（`features/element/thunder.ts` が折れ線を落とす）
  thunder: { sound: "pve.element.thunder" },
  // **炎はバニラの粒を、こちらの置き方で散らす**
  fire: { flame: true },
  wind: { hit: "pve:el_wind" },
  ice: {
    hit: "pve:el_ice",
    state: "pve:el_ice_chill",
    burst: ["pve:el_ice_burst", "pve:el_ice_flash", "pve:el_ice_ring"],
    sound: "pve.element.ice",
  },
};

/**
 * 武器の種類ごとの一覧。
 *
 * **まだ弓しか無い。** 他の武器が増えるまでは、弓の見せ方を借りる——
 * **借りていることを分かるように、ここに書いておく。**
 */
const LOOKS: Readonly<Record<WeaponKind, Readonly<Partial<Record<Element, ElementLook>>>>> = {
  bow: BOW,
  other: BOW,
};

/** その武器の、その属性の見せ方 */
export function lookOf(kind: WeaponKind, element: Element): ElementLook {
  return LOOKS[kind][element] ?? {};
}
