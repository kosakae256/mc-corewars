/**
 * 敵の表と、値の出し方。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md`。
 *
 * ```
 * 出す種類と数 ＝ 敵グループ（★）
 * 1 体の値     ＝ 固有値 × 人数倍率 × ウェーブ倍率 × 呪い倍率 × 丸め係数
 * ```
 *
 * > ### 丸めは「詰め替え」であって、増減ではない
 * >
 * > **出したい数が上限を超えたら、超えたぶんを HP に詰め替える。**
 * > 83 体 × 40 と 50 体 × 66 で、総量はほぼ同じ。
 */

/**
 * **移動速度の換算**（`23-enemy-unit.md` 2 章）。
 *
 * > ### 固有値 1 ＝ **プレイヤーの歩き**
 * >
 * > **バニラの `minecraft:movement` の値とは別物。**
 * > `movement = 固有値 × WALK`。
 * >
 * > **0.2875 は「ゾンビが 0.23 になる」値**（2026-09-07）。
 * > バニラのゾンビは**歩きの 0.8 倍**——固有値 0.8 と噛み合う。
 */
export const WALK = 0.2875;

import type { EnemyTraits } from "./trait.js";

/**
 * **`minecraft:movement` の `max` に入れる倍率**（`24-mob-howto.md` 2 章）。
 *
 * > ### `max` を書かないと `value` が上限になる
 * >
 * > **上げても黙って止まる。** **呪いの上限（×3）より広く取っておく。**
 */
export const MOVE_TOP = 7;

/**
 * **飛ぶ敵の物差し**（`minecraft:flying_speed`）。
 *
 * > ### **歩く速さとは別の部品**（`25-enemy-kit.md` 11 章）
 * >
 * > **ミツバチは `movement: 0.3` ／ `flying_speed: 0.15`**——**歩く値の半分。**
 * > **`minecraft:movement` は経路探索が使い、`flying_speed` が実際の飛ぶ速さ。**
 * > **両方に同じ値を入れると、歩く側が遅すぎて経路が引けなくなる。**
 */
export const FLY_WALK = 0.15;

/** 敵 1 種 */
export interface EnemyDef extends EnemyTraits {
  readonly id: string;
  readonly name: string;
  /**
   * **★の数**（`07-enemy-plan.md` 6 章）。**名前の色になる**（`core/star.ts`）。
   *
   * **性能表の ★ と必ず合わせる。**
   */
  readonly star: number;
  /** 固有の HP */
  readonly hp: number;
  /** 固有の攻撃力 */
  readonly attack: number;
  /** 通常攻撃だけ別の基本威力にする。死に際などのattackは維持（spec/42）。 */
  readonly meleeAttack?: number;
  /** 固有の移動速度。**1 ＝ プレイヤーの歩き**（`WALK` で換算） */
  readonly speed: number;
  /** 殴る間隔（tick） */
  readonly interval: number;
  /** 届く距離（マス） */
  readonly reach: number;
  /** 動き方 */
  readonly kind: "melee" | "shoot" | "boom";
  /**
   * **押す強さ**（`22-feedback.md` 4 章）。**書かなければ既定**（`core/knockback.ts`）。
   *
   * **重い敵は強く、素早い敵は弱く。** **0 で押さない。**
   */
  readonly knockback?: number;
  /**
   * **上へ飛ばす強さ**（`22-feedback.md` 6-2）。**書かなければ浮かせない。**
   *
   * > ### **殴りで浮かせるのはゴーレムだけ**
   * >
   * > **浮くと着地するまで動けない**ので、**普通の攻撃では 0。**
   * > **爆発は別の道**（`services/boom.ts` の `up`）。
   */
  readonly knockUp?: number;
  /**
   * **湧いた瞬間に鳴らす音**（`25-enemy-kit.md` 8-A）。**書かなければ鳴らない。**
   *
   * **湧いた場所から鳴る**（64 マス）。**2 体湧けば 2 回鳴る**——**重なりは止めない。**
   */
  readonly call?: string;
  /**
   * **弾の速さ**（マス／tick）。**撃つ敵だけ**（`24-mob-howto.md` 10-2）。
   *
   * **書かなければ既定。** **`reach` がそのまま届く距離になる。**
   */
  readonly shot?: number;
  /**
   * **手に持たせるもの**（`24-mob-howto.md` 10-3）。**見た目だけ。**
   *
   * **装備表（`minecraft:equipment`）は script で湧かせた個体に効かない**ので、
   * **湧かせた瞬間に script が持たせる。**
   */
  readonly hand?: string;
  /**
   * **頭に被せるもの**（`24-mob-howto.md` 10-3）。**見た目だけ。**
   *
   * **★の違いを、被り物で見せる**（革 → 金 → 鉄 → ダイヤ）。
   */
  readonly head?: string;
  /**
   * **★5 の固有色**（`core/star.ts`）。`§` の色記号 1 つ。
   *
   * > **★1〜★4 は格の色で揃える。** **★5 だけ 1 体ずつ違う色を持つ。**
   *
   * **★5 以外では使わない。** 書き忘れると金になる。
   */
  readonly color?: string;
  /** **エメラルド倍率**（`23-enemy-unit.md` 5 章）。**書かなければ 1** */
  readonly emerald?: number;
  /** **ボスか**（`23-enemy-unit.md` 7 章）。**書かなければ雑魚** */
  readonly boss?: boolean;
}

/** エメラルド倍率。**書いていなければ 1** */
export function emeraldOf(def: EnemyDef): number {
  return def.emerald === undefined ? 1 : def.emerald;
}

/** 攻撃力・速度の人数倍率。**1 ＋ 0.05 ×(人数 − 1)** */
export function powerScale(players: number): number {
  return 1 + 0.05 * Math.max(0, players - 1);
}

/**
 * HP のウェーブ倍率（`16-enemy.md` 3-3・2026-09-06 に決め直した）。
 *
 * ```
 * 1.1 ^ (wave − 1)
 * ```
 *
 * > ### 帯で積む形はやめた
 * >
 * > **wave 30 で ×301 まで伸び、数字が壊れていた。**
 * > **1 本の式にして、wave 15 で約 3.8 倍。** ここに呪いが乗る。
 */
export function waveScale(wave: number): number {
  return Math.pow(1.1, Math.max(1, wave) - 1);
}

/** 敵グループ（★）。**組み方の決まりは `16-enemy.md` 2-1** */
export interface LegionDef {
  readonly id: string;
  readonly name: string;
  /** **★N の軍団には、★N 以下の敵しか入れない** */
  readonly star: number;
  /**
   * **この軍団の狙い**（一言）。
   *
   * **「何を要求する戦いか」が言えないものは作らない。**
   */
  readonly concept: string;
  /** **初期数**。**1 人・wave 1 のときの数**（そこに wave と人数が掛かる・`16-enemy.md` 3-1） */
  readonly fixed: number;
  /** **wave が 1 進むごとに増える数**。**いまは全部 3**（軍団ごとに書ける） */
  readonly perWave: number;
  /**
   * **中身**（**最大 6 種類**）。
   *
   * **`weight` は出る確率**——**合計が 100 でなくてよい。比で見る。**
   * **比率で割り切るのではなく、1 体ずつ引く**（`planOf`）。
   */
  readonly mix: readonly { readonly enemy: string; readonly weight: number }[];
}

/** その 1 体の HP */
export function hpOf(def: EnemyDef, wave: number, curse: number, pack: number): number {
  return Math.max(1, Math.round(def.hp * waveScale(wave) * curse * pack));
}

/**
 * **その 1 体の値を、まとめて出す**（`23-enemy-unit.md` 6 章）。
 *
 * ```
 * HP       ＝ 固有値 × 1.1^(wave−1) × 呪い(HP) × 丸め   （掛け算）
 * 力       ＝ 固有値 × (人数倍率 ＋ 呪い(攻撃力) − 1)      （加算）
 * 移動速度 ＝ 固有値 × 呪い(移動速度)                      （**人数は効かない**）
 * 攻撃速度 ＝ 固有値 × (人数倍率 ＋ 呪い(攻撃速度) − 1)    （加算）
 * ```
 *
 * **呪いは種類ごとに別の倍率**（`core/curse.ts`）。**上限もそちらで掛かっている。**
 */
export function statsOf(
  def: EnemyDef,
  o: {
    readonly wave: number;
    readonly players: number;
    readonly pack: number;
    readonly curse: { readonly hp: number; readonly power: number; readonly speed: number; readonly haste: number };
  }
): { readonly hp: number; readonly attack: number; readonly move: number; readonly swing: number } {
  return {
    hp: hpOf(def, o.wave, o.curse.hp, o.pack),
    attack: attackOf(def, o.players, o.curse.power),
    move: moveOf(def, o.curse.speed),
    swing: swingOf(def, o.players, o.curse.haste),
  };
}

/**
 * **倍率を重ねる。加算で。**（`16-enemy.md` 1-2・2026-09-07 決定）
 *
 * ```
 * 1 ＋ Σ(それぞれの倍率 − 1)
 * ```
 *
 * > ### 掛け算にしない
 * >
 * > **人数 ×1.10 と呪い ×1.85 を掛けると ×2.035。**
 * > **足せば ×1.95。** **重なるほど跳ね上がるのを避ける。**
 *
 * **HP だけは掛け算のまま**——ウェーブ倍率と呪いは、二重に伸びるのが狙い。
 */
export function addMult(...mults: readonly number[]): number {
  let sum = 1;
  for (const m of mults) sum += m - 1;
  return Math.max(0, sum);
}

/** その 1 体の攻撃力。**丸めは掛からない** */
export function attackOf(def: EnemyDef, players: number, curse: number): number {
  return Math.max(1, Math.round(def.attack * addMult(powerScale(players), curse)));
}

/**
 * その 1 体の**バニラの移動速度**（`minecraft:movement` に入れる値）。
 *
 * **固有値 1 ＝ プレイヤーの歩き**（`WALK`）。
 *
 * > ### **人数では速くならない**（2026-09-07 決定）
 * >
 * > **速さが上がるのが、いちばん脅威。**
 * > **人数が増えても、逃げ切れなくなってはいけない。**
 * > **速くするのは呪いだけ**（上限 ×3.0）。
 */
export function moveOf(def: EnemyDef, curse: number): number {
  return def.speed * WALK * curse;
}

/**
 * その 1 体の**殴る間隔**（tick）。
 *
 * > ### 攻撃速度は「大きいほど速い」（`23-enemy-unit.md` 2 章）
 * >
 * > **間隔は割り算で縮む。** 呪いと人数の倍率が、そのまま攻撃速度。
 */
export function swingOf(def: EnemyDef, players: number, curse: number): number {
  return Math.max(1, Math.round(def.interval / addMult(powerScale(players), curse)));
}

/** **攻撃速度の段**は `core/haste.ts`（`24-mob-howto.md` 3 章）。**ここからは出さない** */
