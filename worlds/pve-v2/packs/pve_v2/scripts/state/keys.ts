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
const PREFIX = "pve2:";

/** 鍵の一覧。**足すときはここに書く** */
export const KEYS = {
  /** 実体のいまの HP（`state/hp.ts`） */
  hp: `${PREFIX}hp`,
  /** 実体の HP 上限 */
  hpMax: `${PREFIX}hp_max`,
  /**
   * **その人が買った最大 HP**（**ショップの取り分**。既定 100）。
   *
   * **札で増える分（深水・円環）とは別に持つ**——
   * 札を外しても、買った分は残る（`docs/00-concept.md` 7 章）。
   */
  hpBase: `${PREFIX}hp_base`,
  /** 実体の表示名（`state/label.ts`） */
  label: `${PREFIX}label`,
  /** 名札に HP の数値を出すか（**ワールドが持つ**。`features/hud/debug.ts`） */
  dbgPlate: `${PREFIX}dbg_plate`,
  /** 体力の実態を出すか（**その人が持つ**） */
  dbgHp: `${PREFIX}dbg_hp`,
  /** 持っているエンチャント（**その人が持つ**。`state/enchant.ts`） */
  ench: `${PREFIX}ench`,
  /** 鈍化の溜まり（**実体が持つ**。`state/slow.ts`） */
  slow: `${PREFIX}slow`,
  /** 鈍化を最後に足した時刻（tick） */
  slowAt: `${PREFIX}slow_at`,
  /** **最大蓄積値**（どこまで溜まるか。`state/slow.ts`） */
  slowCap: `${PREFIX}slow_cap`,
  /** **蓄積効果値**（最大の効きに届く値） */
  slowEff: `${PREFIX}slow_eff`,
} as const;

export type KeyName = keyof typeof KEYS;

/**
 * 属性値の鍵（**その人が持つ**。`state/element.ts`）。
 *
 * **5 つ並べて書かない**——増えないと決まっているが、
 * **綴り違いを 1 か所で防ぐ**ほうが安い。
 */
export function elementKey(name: string): string {
  return `${PREFIX}el_${name}`;
}
