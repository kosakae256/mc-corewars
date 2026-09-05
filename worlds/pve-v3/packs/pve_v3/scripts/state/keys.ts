/**
 * 動的プロパティの鍵は、ここだけで決める。
 *
 * 仕様は `docs/imp.md` 10-5（**ワールド共通の実装方針**）。
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
const PREFIX = "pve3:";

/** 鍵の一覧。**足すときはここに書く** */
export const KEYS = {
  /** 実体のいまの HP（`state/hp.ts`） */
  hp: `${PREFIX}hp`,
  /** 実体の HP 上限 */
  hpMax: `${PREFIX}hp_max`,
  /** **その人の最大 HP**（既定 100） */
  hpBase: `${PREFIX}hp_base`,
  /** **その敵 1 体の攻撃力**（`services/spawn.ts` が置き、`features/mob` が読む） */
  atk: `${PREFIX}atk`,
  /** **その敵の種類**（`core/enemy.ts` の id） */
  kind: `${PREFIX}kind`,
  /** 実体の表示名（`state/label.ts`） */
  label: `${PREFIX}label`,
  /** **強化を買った回数**（`state/growth.ts`）。HP */
  lvHp: `${PREFIX}lv_hp`,
  /** 同・足の速さ */
  lvSpeed: `${PREFIX}lv_speed`,
  /** 同・攻撃速度 */
  lvHaste: `${PREFIX}lv_haste`,
  /** 同・攻撃力 */
  lvPower: `${PREFIX}lv_power`,
  /** **持っているエメラルド**（アイテムではなく数で持つ） */
  emerald: `${PREFIX}emerald`,

  // ---- 試合。**ワールドに持つ**（`state/match.ts`）
  /** いまの状態（`core/state.ts` の `WorldPhase`） */
  phase: `${PREFIX}phase`,
  /** その状態に入った時刻（tick）。**砂時計** */
  phaseAt: `${PREFIX}phase_at`,
  /** いま何戦目か */
  wave: `${PREFIX}wave`,
  /** 選ばれている敵グループ */
  legion: `${PREFIX}legion`,
  /** 次の 3 戦の相手（`,` 区切り）。休憩所の 3 択で決まる */
  run: `${PREFIX}run`,
  /** その人が入れた門（0〜2）。**休憩所の 3 択** */
  vote: `${PREFIX}vote`,
  /** 一時停止から戻る先 */
  resumeTo: `${PREFIX}resume_to`,
  /** **どこから幕間へ入ったか**（`wave` なら 3 択を出す） */
  interFrom: `${PREFIX}inter_from`,

  // ---- その人の参加（`state/member.ts`）
  /** 参加のしかた（`out` / `member` / `late`） */
  member: `${PREFIX}member`,
  /** 戦場で倒れているか */
  dead: `${PREFIX}dead`,
  /** **幕間で強化を選び終わったか**（`state/pick.ts`） */
  picked: `${PREFIX}picked`,

  /** **売り子が何を売るか**（`core/shop.ts` の `VendorKind`） */
  sells: `${PREFIX}sells`,
  /** **その人の職業**（`core/roles.ts` の `RoleId`） */
  role: `${PREFIX}role`,
} as const;

export type KeyName = keyof typeof KEYS;
