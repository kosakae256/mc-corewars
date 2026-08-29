/**
 * 削る。**通り道はここ 1 本。**
 *
 * 仕様は `docs/spec/10-damage.md` 4 章・5 章。
 *
 * ```
 * 最終攻撃力 → 防御率で削る → HP を引く → 0 なら倒れる
 *                                    ↓
 *                             当たった後のフック
 * ```
 *
 * **武器も、モブの殴りも、属性も、最後はここを通る。**
 * 通り道が 1 本なら、**数字が合わないときに見る場所も 1 つ。**
 *
 * ## 基礎と追加を分ける
 *
 * | | 何か | 効果のフック | 属性 |
 * | --- | --- | --- | --- |
 * | **基礎ダメージ** | 当てた 1 発 | **呼ぶ** | 乗る |
 * | **追加ダメージ** | 星が降る・爆ぜる | **呼ばない**（星が星を呼ぶ） | **乗る** |
 * | **属性ダメージ** | 属性が削る分 | 呼ばない | **乗らない**（火が火を呼ぶ） |
 */

import { Player, system, type Entity } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { finalDamage } from "../../lib/damage.js";
import { elementRate, type Element } from "../../lib/element.js";
import { current, damage as cutHp, has, heal, max } from "../../state/hp.js";
import { gaugeOf } from "../../state/gauge.js";
import { resistOf } from "../element/resist.js";
import { weaponKindOf } from "../element/gauges.js";
import { feedback, stepFeedback } from "./feedback.js";

/**
 * 倒した粒。**自分たちで作ったもの**（`resource_packs/pve/particles/`）。
 *
 * **当たったときの粒は出さない**（2026-08-29 決定）——
 * **何の粒か分からないものが毎回出て、邪魔だった。**
 * 当たったことは**赤く光る・音**で分かる（`docs/spec/16-feedback.md`）。
 */
const KILL = "pve:kill_burst";

/** 1 発当てる */
export interface HitOptions {
  /** 撃った人。**居ないこともある**（モブの殴りなど） */
  readonly by?: Player;
  readonly target: Entity;
  /** **最終攻撃力**（`lib/attack.ts` で組み立て終えた値） */
  readonly attack: number;
  /** 何で当てたか（武器の識別子など） */
  readonly via?: string;
  /** ため具合（0.1〜1.0）。**追加ダメージの数を決める**（`docs/spec/10-damage.md` 5-1） */
  readonly charge?: number;
  /**
   * **何の攻撃か**（`docs/spec/10-damage.md` 5-3）。
   *
   * | | 効果フック | 属性 | 表示 |
   * | --- | --- | --- | --- |
   * | `base` | ○ | ○ | ○ |
   * | `extra` | × | ○ | ○ |
   * | `element` | × | × | ○ |
   *
   * **切っておかないと、星が星を、火が火を呼んで止まらなくなる。**
   */
  readonly kind?: HitKind;
  /**
   * 乗っている属性（`docs/spec/17-element.md`）。
   *
   * **追加ダメージにも乗る**——星の 1 つ 1 つが、火なら燃やす。
   */
  readonly elements?: readonly Element[];
  /**
   * **属性の蓄積の倍率**（破魔矢。`docs/spec/19-weapons.md` 3 章）。
   *
   * **削る量は変わらない。** 溜まり方だけが速くなる。
   */
  readonly elementScale?: number;
  /**
   * **この 1 発を出した属性**（`kind: "element"` のとき）。
   *
   * **数字の色と、手応え（音・赤み）がこれで変わる**
   *（`docs/spec/15-hud.md` 4 章、`docs/spec/16-feedback.md` 2-2）。
   */
  readonly element?: Element;
}

/** 何の攻撃か */
export type HitKind = "base" | "extra" | "element";

/** 当たったときに渡すもの */
export interface HitInfo extends HitOptions {
  /** **削った値**（属性の蓄積はこれで動く。`docs/03-content.md` 3-5） */
  readonly dealt: number;
  /** 倒したか */
  readonly killed: boolean;
}

/**
 * 当たった後に呼ばれるもの。
 *
 * 仕様は `docs/spec/11-structure.md` 2-2。
 *
 * **属性・エンチャント・武器の固有効果はここに挿す。**
 * 挿す側は**「削った値」と「誰が誰に」だけ**を受け取り、
 * **どこから来た攻撃かを知らなくてよい。**
 */
export type HitHook = (info: HitInfo) => void;

/** 効果のフック。**基礎ダメージだけ** */
const hooks: HitHook[] = [];

/** 属性のフック。**基礎と追加**（属性ダメージからは呼ばない） */
const elemental: HitHook[] = [];

/** 効果を足す。**トップレベルから 1 度だけ** */
export function onHit(hook: HitHook): void {
  hooks.push(hook);
}

/**
 * 属性を足す。**トップレベルから 1 度だけ。**
 *
 * **基礎と追加の両方で呼ばれる**（`docs/spec/17-element.md` 4 章）。
 * **属性ダメージからは呼ばれない**——火が火を呼ばないように。
 */
export function onElementHit(hook: HitHook): void {
  elemental.push(hook);
}

/**
 * 水が最大まで満ちたときの防御率（%）。
 *
 * **−25% ＝ 受けるダメージ 1.25 倍**（`docs/spec/17-element.md` 3 章）。
 * **「防御率が下がる」は「受けるダメージが増える」という意味**（2026-08-29 に確認した）。
 */
const WATER_DEFENSE = -25;

/**
 * いまの防御率（%）。
 *
 * 仕様は `docs/spec/10-damage.md` 3-2。
 *
 * **0 から始めて、持っているものを足す。**
 *
 * | 何が動かすか | いま |
 * | --- | --- |
 * | **属性の水** | **溜まっているほど負になる**（最大 −20%） |
 * | バフ・デバフ・ステータス | **まだ無い** |
 */
function defenseOf(target: Entity, via: string | undefined): number {
  // **水の溜まりは武器ごと**（`docs/spec/17-element.md` 2-2）。
  // **その武器で濡らした分だけ、その武器の攻撃が重くなる。**
  const water = elementRate(gaugeOf(target, weaponKindOf(via), "water"), resistOf(target, "water"));
  return WATER_DEFENSE * water;
}

function call(list: readonly HitHook[], info: HitInfo): void {
  for (const hook of list) {
    try {
      hook(info);
    } catch (err) {
      console.warn(`[hit] ${String(err)}`);
    }
  }
}

/** 当てる。**基礎も追加も、ここを通る** */
export function hit(o: HitOptions): void {
  const { target } = o;
  if (!has(target)) return;

  const dealt = finalDamage(o.attack, defenseOf(target, o.via));
  if (dealt <= 0) return;

  const left = cutHp(target, dealt);
  const killed = left <= 0;
  const info: HitInfo = { ...o, dealt, killed };

  const kind = o.kind ?? "base";

  // ---- 手応え（赤く光る・音・ノックバック。`docs/spec/16-feedback.md`）
  feedback(target, o.by, system.currentTick, o.element);

  // ---- 属性（**基礎と追加**。`docs/spec/17-element.md` 4 章）
  if (kind !== "element") call(elemental, info);

  // ---- 効果（**基礎だけ**。`docs/spec/10-damage.md` 5-3）
  if (kind === "base") call(hooks, info);

  if (!killed) return;
  down(target);
}

/** 倒れた */
function down(target: Entity): void {
  if (target instanceof Player) {
    // **プレイヤーの倒れ方は、ウェーブの仕組みと一緒に決める**
    //（`docs/01-rules.md` 1-1）。
    //
    // **いまは満タンに戻す**（`docs/spec/10-damage.md` 6 章）——
    // 0 のまま置くと、**殴られるたびに倒れた合図が鳴り続ける。**
    const cap = max(target) ?? 0;
    if (cap > 0) heal(target, cap);
    try {
      target.sendMessage("§c倒れた §8— 立て直した（仮）");
      target.dimension.playSound("pve.common.bless", target.location, { volume: 0.5 });
    } catch {
      /* 消えている */
    }
    return;
  }
  try {
    const at = target.location;
    target.dimension.spawnParticle(KILL, { x: at.x, y: at.y + 1, z: at.z });
    target.dimension.playSound("random.explode", at, { volume: 0.4 });
    target.remove();
  } catch {
    /* もう居ない */
  }
}

/** いまの HP。**表示用** */
export function hpOf(entity: Entity): { now: number; max: number } | undefined {
  const now = current(entity);
  const cap = max(entity);
  if (now === undefined || cap === undefined) return undefined;
  return { now, max: cap };
}

/**
 * 機能としての「削る」。
 *
 * **`hit()` はどこからでも呼ばれる**が、
 * **赤くしたものを戻すのは毎 tick の仕事**なので、機能として登録する。
 */
export const damageSystem: Feature = {
  name: "damage",
  tick: { every: 1, run: stepFeedback },
};
