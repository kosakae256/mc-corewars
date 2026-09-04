/**
 * 1 発の威力を組み立てる。**式はここ 1 か所。**
 *
 * ```
 * 通常攻撃 ＝ (通常攻撃力 × 攻撃力) × クリティカル威力
 * 特殊攻撃 ＝ (特殊攻撃力 × 攻撃力) × クリティカル威力 × 特殊攻撃の固有値
 * ```
 *
 * **v2 から持ってきたが、札（エンチャント）は全部外した。**
 * **伸びるのは「攻撃力」1 本**（`services/growth.ts`。初期 1.0・上限 5.0）。
 *
 * **撃つ速さはここにない**——**溜め方式**なので `features/bow/index.ts` にある
 *（`docs/spec/15-growth.md` 3 章）。
 *
 * ## 何が効いたかを返す
 *
 * **条件つきの効果は、効いた時だけ光らせたい。**
 * だから**「どれが乗ったか」も一緒に返す**（`fired`）。
 * **いまは `crit` しか入らない。**
 */

import type { Entity, Player } from "@minecraft/server";

import { powerOf } from "./growth.js";
import { ROLES } from "../core/roles.js";
import { roleOf } from "../state/role.js";

/** クリティカル倍率の基礎 */
const CRIT_BASE = 2.0;

/** クリティカル率の上限 */
const RATE_CAP = 1.0;

/** 通常攻撃力の初期値 */
export const NORMAL_POWER = 20;

/** 特殊攻撃力の初期値 */
export const SPECIAL_POWER = 20;

/** 弓の基本火力。**通常攻撃力そのもの** */
export const BOW_HIT = NORMAL_POWER;

/** 撃つときの状況。**条件つきの効果が見る** */
export interface Situation {
  readonly shooter: Player;
  readonly target?: Entity;
  /** 撃った所からの距離（マス） */
  readonly distance?: number;
  /** 動いているか */
  readonly moving?: boolean;
  /** その敵にまだ当てていないか */
  readonly firstHit?: boolean;
  /** いまの tick */
  readonly now: number;
}

/** 組み上がった 1 発 */
export interface Shot {
  /** クリティカル前（**特殊攻撃が参照するのはこれ**） */
  readonly power: number;
  /** 実際に入る値 */
  readonly final: number;
  readonly crit: boolean;
  /** **効いたものの id。** 光らせるのに使う */
  readonly fired: readonly string[];
}

/**
 * クリティカル倍率。
 *
 * **いまは基礎だけ。** 伸ばす手段はこれから。
 */
export function critMult(_player: Player): number {
  return CRIT_BASE;
}

/**
 * クリティカル率。
 *
 * **初期は 0％**——伸ばさなければ 1 度も出ない。
 */
export function critRate(_player: Player): number {
  return Math.min(RATE_CAP, 0);
}

/** 通常攻撃を 1 発組み立てる */
export function buildShot(base: number, s: Situation): Shot {
  const p = s.shooter;
  const fired: string[] = [];

  // **買った攻撃力**（1.0 が素・上限 5.0）と、**職業の通常攻撃倍率**が乗る
  const power = base * powerOf(p) * ROLES[roleOf(p)].normal;
  const crit = Math.random() < critRate(p);
  if (crit) fired.push("crit");

  return { power, final: crit ? power * critMult(p) : power, crit, fired };
}
