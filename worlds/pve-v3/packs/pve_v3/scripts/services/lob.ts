/**
 * **山なりに投げる。** **重力を持つ弾。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 3 章。
 *
 * | 使う敵 | 飛距離 | 着弾まで | 見て避けられるか |
 * | --- | --- | --- | --- |
 * | **投石ハスク**（★2） | **7 マス** | **0.5 秒** | **無理** |
 * | **ボマー**（★3） | **10 マス** | **1.5 秒** | **避けられる** |
 * | **ガスト**（★2） | まっすぐ | — | 弾速 0.5 マス／tick |
 *
 * ## 投げる向きの出し方
 *
 * > ### **「何マス先へ、何 tick で」から逆算する**
 * >
 * > **水平の速さ**＝ 距離 ÷ tick 数。
 * > **上向きの速さ**＝ 落ちる速さ × tick 数 ÷ 2（**投げた高さに戻ってくる**）。
 * >
 * > **速さを指定させると、狙った所に落ちない。** **落とす所を指定させる。**
 */

import { type Dimension, type Entity, type Vector3 } from "@minecraft/server";

import { LOB } from "../core/tuning.js";
import { fire } from "./bullet.js";

/** 1 発の頼み方 */
export interface LobSpec {
  readonly dim: Dimension;
  /** 出る所 */
  readonly from: Vector3;
  /** 落としたい所 */
  readonly to: Vector3;
  /** 届く距離の上限（マス）。**書かなければ既定** */
  readonly range?: number;
  /** 着弾までの長さ（tick）。**書かなければ既定** */
  readonly flight?: number;
  /** 落ちる速さ。**書かなければ既定** */
  readonly gravity?: number;
  /** 軌跡の粒。**書かなければ既定** */
  readonly trail?: string;
  /** **連れて飛ぶ実体**。**書かなければ粒だけ** */
  readonly body?: string;
  /** **跡を出さない**（実体を飛ばすとき） */
  readonly noTrail?: boolean;
  /** 素通りする相手 */
  readonly skip: (e: Entity) => boolean;
  /** 人に当たった */
  readonly onHit: (target: Entity, at: Vector3, now: number) => void;
  /** **誰にも当たらず、壁か射程の端で止まった。** 爆発はここ */
  readonly onEnd?: (at: Vector3, now: number) => void;
}

/**
 * **「そこへ、その時間で」届く初速を出す。**
 *
 * **水平は等速、上下だけ落ちる**——`y = v*t - g*t²/2` を `t = flight` で解く。
 *
 * **`services/mobshot.ts` も使う**（バニラの `ranged_attack` に投げさせるとき）。
 */
export function arcOf(
  from: Vector3,
  to: Vector3,
  flight: number,
  gravity: number
): { readonly dir: Vector3; readonly speed: number } | undefined {
  const vx = (to.x - from.x) / flight;
  const vz = (to.z - from.z) / flight;
  const vy = (to.y - from.y) / flight + (gravity * flight) / 2;
  const speed = Math.hypot(vx, vy, vz);
  if (speed <= 0) return undefined;
  return { dir: { x: vx / speed, y: vy / speed, z: vz / speed }, speed };
}

/** 投げる */
export function lob(spec: LobSpec): void {
  const flight = spec.flight ?? LOB.flight;
  const gravity = spec.gravity ?? LOB.gravity;
  const arc = arcOf(spec.from, spec.to, flight, gravity);
  if (arc === undefined) return;
  const { dir, speed } = arc;
  fire({
    dim: spec.dim,
    from: spec.from,
    dir,
    speed,
    range: spec.range ?? LOB.range,
    // **胴と頭を見る**
    shape: { fat: 0.5, marks: [0.9, 1.6] },
    trail: spec.noTrail === true ? undefined : (spec.trail ?? LOB.trail),
    body: spec.body,
    playersOnly: true,
    gravity,
    skip: spec.skip,
    onHit: (target, _flown, at, now) => spec.onHit(target, at, now),
    onEnd: spec.onEnd,
  });
}
