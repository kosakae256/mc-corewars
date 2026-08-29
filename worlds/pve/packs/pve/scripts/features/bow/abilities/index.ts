/**
 * 固有能力。**型に分けて、数値だけ変える。**
 *
 * 仕様は `docs/spec/19-weapons.md` 3 章。
 *
 * ## 48 本を 48 通りに書かない
 *
 * **撃ち方・当たり方・当たった後**の 3 か所に差し込む形にして、
 * **弓は「どの型か」を持つだけ**にする。
 *
 * ```
 * 撃つ  → rays（何本・どの向き・何割）
 *        → pierce（何体まで抜けるか）
 *        → power（攻撃力の倍率）
 * 当たった → onHit（吸収・引き寄せ・印…）
 * 着弾した → onImpact（爆発・柱・場…）
 * 撃った後 → after（反動・分身・追い撃ち）
 * ```
 *
 * ## エンチャントとの重なり
 *
 * **同じことをするなら固有能力が勝つ**（`docs/spec/19-weapons.md` 3-1）。
 * **重ねられるものは掛け合わせる**——拡散の弓に拡散が付けば **2 本 × 5 本**。
 * 型ごとの扱いは仕様書の表に書いてある。
 */

import type { Entity, Player, Vector3 } from "@minecraft/server";

import type { Element } from "../../../lib/element.js";
import type { EnchantAxis } from "../enchants/list.js";
import type { Enchant } from "../../../state/item-enchant.js";
import type { Bow } from "../weapons.js";

/** 固有能力の名前。**`tools/pve_weapon_table.py` と同じ綴り** */
export type AbilityKey =
  | "none"
  | "heal_ally"
  | "rapid"
  | "long_draw"
  | "spread3"
  | "spread5"
  | "knock_far"
  | "heavy_draw"
  | "chain_mark"
  | "recoil"
  | "element_boost"
  | "heal_on_kill"
  | "more_drops"
  | "guardian"
  | "explode_small"
  | "pierce_all"
  | "bounce"
  | "firework"
  | "slam_down"
  | "lifesteal"
  | "railgun"
  | "web"
  | "mine"
  | "twin_spiral"
  | "light_pillar"
  | "brand"
  | "dice"
  | "cards"
  | "cannon"
  | "pierce_line"
  | "enchant_luck"
  | "starfall"
  | "time_stop"
  | "root"
  | "echo"
  | "ward"
  | "homing"
  | "kill_echo"
  | "meteor"
  | "boomerang"
  | "pull"
  | "combo"
  | "shadow_shot"
  | "quiver"
  | "dual_element"
  | "blackhole"
  | "aurora";

/** 1 発ぶんの向きと割合 */
export interface Ray {
  readonly dir: Vector3;
  /** 攻撃力の割合（1.0 で満額） */
  readonly rate: number;
}

/** 撃つときに分かっていること */
export interface ShotContext {
  readonly player: Player;
  readonly bow: Bow;
  /** ため具合（0.1〜1.0）。**1 秒を満とする**（`lib/charge.ts`） */
  readonly charge: number;
  /**
   * 押していた長さ（tick）。
   *
   * **1 秒を超えて引ける弓**（長弓・重弓・大砲・レールガン）は、
   * **ため具合ではなくこちらを見る**——ため具合は 1 秒で頭打ちになる。
   */
  readonly heldTicks: number;
  /** **最終攻撃力**（ためまで乗せ終えた値） */
  readonly attack: number;
  readonly elements: readonly Element[];
  /** その 1 本に付いたエンチャント（`docs/spec/20-enchants.md`） */
  readonly enchants: readonly Enchant[];
  readonly from: Vector3;
  readonly dir: Vector3;
  /**
   * **何段目の矢か。** 0 が本人の 1 発。
   *
   * 能力から撃った矢は 1 以上になり、**着弾の能力は動かない**——
   * **跳弾が跳弾を呼んで止まらなくなる**のを防ぐ（2026-08-29 の直し）。
   */
  readonly depth?: number;
}

/** 当たったときに分かっていること */
export interface HitContext extends ShotContext {
  readonly target: Entity;
  readonly at: Vector3;
  /** 何番目の的か（貫通したときに増える） */
  readonly index: number;
  /** **この 1 発で倒したか**（`state/hp.ts` を読み直さなくてよい） */
  readonly killed: boolean;
}

/** 固有能力 1 つ */
export interface Ability {
  /**
   * **何本、どの向きへ撃つか。**
   *
   * 返さなければ 1 本（まっすぐ・満額）。
   * **拡散のエンチャントは、この本数に掛かる**（`docs/spec/19-weapons.md` 3-1）。
   */
  readonly rays?: (ctx: ShotContext) => Ray[];
  /** **何体まで抜けるか**（1 で貫通なし） */
  readonly pierce?: number;
  /**
   * **その 1 発ごとに変わる貫通数**（札の弓）。
   *
   * 返したほうが `pierce` より優先される。
   */
  readonly pierceFor?: (ctx: ShotContext) => number;
  /** 抜けるたびに落ちる割合（0.15 なら 1 体ごとに −15%） */
  readonly falloff?: number;
  /** 攻撃力の倍率。**ためや連撃で変わるもの** */
  readonly power?: (ctx: ShotContext) => number;
  /**
   * **味方に当たると回復する**（癒しの弓）。
   *
   * `true` なら、**人に当たったときは削らずに回復させる。**
   */
  readonly friendly?: boolean;
  /**
   * **属性が最低いくつ付くか**（双属の弓）。
   *
   * 足りないぶんは、**その 1 発のあいだだけ**足す。
   */
  readonly minElements?: number;
  /**
   * **属性の蓄積の倍率**（破魔矢）。
   *
   * 与えたダメージではなく**蓄積だけ**が増える（`docs/spec/17-element.md` 2 章）。
   */
  readonly elementScale?: number;
  /**
   * **引いている間、勝手に撃つ**（速射弓）。
   *
   * 何 tick ごとに 1 発か。**ためは効かない。**
   */
  readonly autoEvery?: number;
  /** 当たった相手ごとに */
  readonly onHit?: (ctx: HitContext) => void;
  /** 着いた場所で（当たらなくても呼ぶ） */
  readonly onImpact?: (ctx: ShotContext, at: Vector3, hit: boolean) => void;
  /**
   * **この武器が既に持っている軸**（`docs/spec/20-enchants.md` 3 章）。
   *
   * **同じ軸のエンチャントは働かない**——固有能力が勝つ。
   * **拡散だけは例外**で、書いてあっても掛け合わせる。
   */
  readonly owns?: readonly EnchantAxis[];
  /** 撃った後で（反動・分身・追い撃ち） */
  readonly after?: (ctx: ShotContext) => void;
  /**
   * 線を引く間隔（マス）。**速射のように数を撃つ弓は粗くする。**
   *
   * 書かなければ既定（0.7）。
   */
  readonly trailStep?: number;
  /** **1 本も当たらなかったとき**（連撃が切れる） */
  readonly onMiss?: (ctx: ShotContext) => void;
}

/** 型ごとの中身。**足すときはここに 1 行**（中身は別ファイル） */
const REGISTRY = new Map<AbilityKey, Ability>();

/**
 * 能力を登録する。**トップレベルから。**
 *
 * **同じ型を 2 か所から足せる**——撃ち方は `shots.ts`、当たり方は `onhit.ts`、
 * 着弾は `impact.ts` に分かれている。
 *
 * > **上書きではなく、混ぜる。**
 * > 上書きにしていたので、**後から読まれたほうが前の中身を消していた**
 * >（連撃の倍率が消える・反動が効かない。2026-08-29 の不具合）。
 */
export function defineAbility(key: AbilityKey, ability: Ability): void {
  const before = REGISTRY.get(key);
  REGISTRY.set(key, before === undefined ? ability : { ...before, ...ability });
}

/** その型の中身。**まだ作っていない型は「何もしない」** */
export function abilityOf(key: AbilityKey): Ability {
  return REGISTRY.get(key) ?? {};
}

/** 作ってある型の数。**確かめる用** */
export function abilityCount(): number {
  return REGISTRY.size;
}
