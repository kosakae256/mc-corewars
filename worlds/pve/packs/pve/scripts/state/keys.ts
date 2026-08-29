/**
 * 動的プロパティの鍵は、ここだけで決める。
 *
 * 仕様は `docs/imp.md` 10-5。
 *
 * ## なぜ 1 か所なのか
 *
 * 前のワールドでは `cw:` と `game:` が混ざり、
 * **どこに何が入っているのか、grep しないと分からなくなった。**
 *
 * | ここで決まること | |
 * | --- | --- |
 * | **接頭辞** | 付け忘れも、揺れも起きない |
 * | **持ち主** | プレイヤーか、実体か、ワールドか |
 * | **消し方** | 「その人の記録を全部消す」が一覧を回すだけで書ける |
 */

/** すべての鍵に付く。**他のパックとぶつからないように** */
const PREFIX = "pve:";

/** 鍵の一覧。**足すときはここに書く** */
export const KEYS = {
  /** 実体のいまの HP（`state/hp.ts`） */
  hp: `${PREFIX}hp`,
  /** 実体の HP 上限 */
  hpMax: `${PREFIX}hp_max`,
  /** 実体の表示名（`state/label.ts`） */
  label: `${PREFIX}label`,
  /** **武器 1 本に付いた属性**（`state/item-element.ts`）。`water,fire` の形 */
  elements: `${PREFIX}elements`,
  /** **武器 1 本に付いたエンチャント**（`state/item-enchant.ts`）。`power:3,pierce:1` の形 */
  enchants: `${PREFIX}enchants`,
  /** 蓄積を最後に触った時刻（tick）。**落とすのに使う** */
  gaugeAt: `${PREFIX}g_at`,
  /** 名札に HP の数値を出すか（**ワールドが持つ**。`features/hud/debug.ts`） */
  dbgPlate: `${PREFIX}dbg_plate`,
  /** 体力の実態を出すか（**その人が持つ**） */
  dbgHp: `${PREFIX}dbg_hp`,
} as const;

/**
 * 属性ごとの蓄積（`state/gauge.ts`）。
 *
 * **鍵を組み立てるのもここ。** 呼ぶ側が文字列を作らない。
 *
 * **武器ごとに分かれる**（`docs/spec/17-element.md` 2-2）ので、
 * **武器の種類も鍵に入る**（`pve:g_bow_fire` など）。
 */
export function gaugeKey(weapon: string, element: string): string {
  return `${gaugePrefix()}${weapon}_${element}`;
}

/** 蓄積の鍵の頭。**数え上げるときに使う** */
export function gaugePrefix(): string {
  return `${PREFIX}g_`;
}

export type KeyName = keyof typeof KEYS;
