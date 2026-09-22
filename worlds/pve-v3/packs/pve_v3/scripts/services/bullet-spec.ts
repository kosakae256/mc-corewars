/**
 * **1 発の頼み方。**
 *
 * **`bullet.ts` から切り出した**（2026-09-10）——**1 ファイル 300 行の上限に収めるため。**
 * **中身は変えていない。**
 */

import type { Dimension, Entity, Vector3 } from "@minecraft/server";

import type { HitShape } from "../core/geometry.js";

/** 1 発の頼み方 */
export interface BulletSpec {
  readonly dim: Dimension;
  /** 出る所。**距離を測る基準でもある** */
  readonly from: Vector3;
  /** 向き。**正規化しておく** */
  readonly dir: Vector3;
  /** 速さ（マス／tick） */
  readonly speed: number;
  /** 届く距離（マス） */
  readonly range: number;
  /** 当たり判定の形 */
  readonly shape: HitShape;
  /** 軌跡の粒。**書かなければ出さない** */
  readonly trail?: string;
  /**
   * **見た目の実体**（`24-mob-howto.md` 10-4）。**書かなければ連れない。**
   *
   * **弾の位置へ毎 tick 運び、進む先を向かせる。** **弾が消えるときに一緒に消す。**
   */
  readonly body?: string;
  /** 直進する短寿命の丸弾表示。実体や固定した軌跡を使わない（spec/36）。 */
  readonly sprite?: string;
  /**
   * **当たる相手はプレイヤーだけか**（`24-mob-howto.md` 10-6）。
   *
   * > ### **周りを探さずに済む**
   * >
   * > **敵の弾はプレイヤーにしか当たらない。**
   * > **`getEntities` は敵が 100 体居ると 100 体ぶん見る**——**毎 tick、弾ごとに。**
   * > **人だけなら数人。** **その場に居る人を 1 tick に 1 度だけ数えて使い回す。**
   */
  readonly playersOnly?: boolean;
  /** 粒を置く間隔（マス）。**書かなければ既定** */
  readonly gap?: number;
  /** **素通りする相手**（自分・味方・的でないもの） */
  readonly skip: (e: Entity) => boolean;
  /** 当たった。`flown` は撃った所からの距離 */
  readonly onHit: (target: Entity, flown: number, at: Vector3, now: number) => void;
  /**
   * **落ちる速さ**（マス／tick²）。**書かなければ落ちない**（まっすぐ飛ぶ）。
   *
   * > ### **山なりに投げる**（`25-enemy-kit.md` 3 章）
   * >
   * > **投石ハスク・ボマー・ガストの弾**。**毎 tick、下向きの速さが増える。**
   */
  readonly gravity?: number;
  /**
   * **曲がる強さ**（0〜1）。**書かなければ曲がらない。**
   *
   * > ### **追ってくる弾**（`25-enemy-kit.md` 6 章）
   * >
   * > **毎 tick、いちばん近い人のほうへ、この割合だけ向きを寄せる。**
   * > **1 なら即座に向く。** **0.1 ならゆるく曲がる。**
   */
  readonly homing?: number;
  /** **壁で消えず、手前で向きを変えて迂回する**（追尾弾・`25-enemy-kit.md` 6-1） */
  readonly throughWall?: boolean;
  /** **寿命**（tick）。**書くと、距離では消えない**（追尾弾・`25-enemy-kit.md` 6-1-1） */
  readonly life?: number;
  /**
   * **狙う相手を 1 人だけ決める**（追尾弾・`25-enemy-kit.md` 6-1-2）。
   *
   * **撃った瞬間、この距離（マス）の中からランダムに選び、その人だけを追う。**
   * **書かなければ、毎 tick いちばん近い人へ寄せる。**
   */
  readonly lockOn?: number;
  /**
   * **誰にも当たらずに終わった**（壁に当たった／射程が尽きた）。
   *
   * **爆発する弾は、ここで爆発する**（`services/boom.ts`）。
   */
  readonly onEnd?: (at: Vector3, now: number) => void;
}
