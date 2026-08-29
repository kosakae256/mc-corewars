/**
 * 弓 1 本の形。**一覧そのものは `list.ts`（書き出したもの）。**
 *
 * 仕様は `docs/spec/19-weapons.md`、構えの見せ方は `docs/spec/13-bow-view.md`。
 *
 * ## 一覧と処理を分ける
 *
 * `docs/spec/11-structure.md` 2-1。
 * **ここは「何を持っているか」だけ。** 何が起きるかは `features/bow/abilities/`。
 */

import type { Rarity } from "../../lib/rarity.js";
import type { AbilityKey } from "./abilities/index.js";

/** 弓 1 本 */
export interface Bow {
  /** アイテムの識別子 */
  readonly item: string;
  /** 表示名 */
  readonly label: string;
  /** レア度（`docs/spec/18-item-view.md` 3 章） */
  readonly rarity: Rarity;
  /** **1 秒ためた 1 発の火力**（`docs/03-content.md` 1-1） */
  readonly base: number;
  /**
   * **ためきりの合図が鳴るまで**（tick）。既定は 20（1 秒）。
   *
   * > **火力の計算には使わない。**
   * > 基礎攻撃力は「1 秒ためた 1 発」なので、**ため具合はいつも 1 秒が満**
   * >（`lib/charge.ts`）。**1 秒より長く引ける弓**は、
   * > 能力が `heldTicks` を見て上乗せする（`docs/spec/19-weapons.md` 3 章）。
   */
  readonly fullTicks?: number;
  /** 固有能力の型（`docs/spec/19-weapons.md` 3 章） */
  readonly ability: AbilityKey;
  /** 効果の名前（説明欄） */
  readonly effect?: string;
  /** 効果の説明（説明欄） */
  readonly about?: string;
  /**
   * 飛んだ跡に引く線（粒の識別子）。
   *
   * **弓ごとに変える**（`docs/spec/13-bow-view.md` 4 章）。
   */
  readonly trail: string;
  /** 線の上に散らすきらめき。**無くてよい** */
  readonly spark?: string;
  /**
   * **飛んでいく音**（`docs/spec/13-bow-view.md` 3-1）。
   *
   * **放つ音はバニラで揃える**（`random.bow`）。**変えるのは軌跡の音だけ。**
   */
  readonly trailSound?: string;
  /** 固有能力の音（発動した瞬間） */
  readonly abilitySound?: string;
}

export { BOW_LIST as BOWS } from "./list.js";

import { BOW_LIST } from "./list.js";

/** その持ち物は弓か。**違うなら undefined** */
export function bowOf(itemId: string | undefined): Bow | undefined {
  if (itemId === undefined) return undefined;
  return BOW_LIST.find((b) => b.item === itemId);
}
