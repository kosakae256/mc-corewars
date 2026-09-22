/**
 * **範囲爆発。** **爆発する敵は、全部ここを通る。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 2 章。
 *
 * ```
 * 中心 ── 力そのまま・押す強さも最大
 *   │      外へ行くほど、まっすぐ減る
 *   └── 半径で 0
 * ```
 *
 * ## なぜ 1 本にするのか
 *
 * > ### **爆発する敵は 5 体いる**
 * >
 * > クリーパー・帯電クリーパー・爆弾・ボマー・ガスト。
 * > **別々に書けば、5 種類の爆発ができる。** **1 本にすれば、直すのも 1 箇所。**
 *
 * ## 決まっていること（`07-enemy-plan.md` 6 章）
 *
 * | | |
 * | --- | --- |
 * | **巻き込む相手** | **プレイヤーだけ。** **仲間の敵には当たらない** |
 * | **押す強さ** | **必ず弾く。** **中心ほど強く、外へ行くほど弱い** |
 * | **浮かせる** | **爆発だけの例外**（ほかの攻撃では浮かせない） |
 * | **地形** | **壊さない** |
 */

import { world, type Dimension, type Vector3 } from "@minecraft/server";
import { hittable } from "./mobaim.js";

import { BOOM } from "../core/tuning.js";
import { hit } from "./combat.js";
import { has } from "../state/hp.js";

/** 1 回ぶんの頼み方 */
export interface BoomSpec {
  readonly dim: Dimension;
  /** 中心 */
  readonly at: Vector3;
  /** **中心での力。** 外へ行くほど減る */
  readonly power: number;
  /** 届く半径（マス）。**書かなければ既定** */
  readonly radius?: number;
  /** 押す強さの上限。**書かなければ既定** */
  readonly knock?: number;
  /** 上へ飛ばす強さ。**書かなければ既定** */
  readonly up?: number;
  /** 見た目の粒。**書かなければ既定** */
  readonly particle?: string;
  /** 音。**書かなければ既定** */
  readonly sound?: string;
}

/**
 * **爆発の見た目。** **届く範囲をそのまま描く。**
 *
 * ```
 * 中心 ── 大きい爆発
 *  ├ 半径の 55 % に 6 つ
 *  └ 半径の 95 % に 10 つ  ← ここまで届く、が目で分かる
 * ```
 */
function draw(dim: Dimension, at: Vector3, radius: number, particle: string): void {
  const put = (x: number, y: number, z: number, what: string): void => {
    try {
      dim.spawnParticle(what, { x, y, z });
    } catch {
      /* 読み込まれていない */
    }
  };
  // **真ん中は半径で選ぶ**——**大きいものは広く撒くので、小さい爆発には使わない**
  put(at.x, at.y + 0.5, at.z, radius >= BOOM.hugeFrom ? "minecraft:huge_explosion_emitter" : particle);
  // **輪の数も半径で決める**——**小さい爆発に 16 個も置くと、粒が重なって広く見える**
  for (const [ratio, marks] of [
    [0.55, Math.max(3, Math.round(radius * 1.5))],
    [0.95, Math.max(4, Math.round(radius * 2.5))],
  ] as const) {
    for (let i = 0; i < marks; i++) {
      const t = ((i + ratio) / marks) * 2 * Math.PI;
      put(at.x + Math.cos(t) * radius * ratio, at.y + 0.4, at.z + Math.sin(t) * radius * ratio, particle);
    }
  }
}

/**
 * 爆ぜる。
 *
 * @returns 巻き込んだ人数
 */
export function boom(spec: BoomSpec): number {
  const at = spec.at;
  const radius = spec.radius ?? BOOM.radius;
  const knockMax = spec.knock ?? BOOM.knock;
  const up = spec.up ?? BOOM.up;
  // > ### **見た目を半径に合わせる**（2026-09-08）
  // >
  // > **粒 1 つでは、半径 4〜6 の爆発が「狭い」ようにしか見えない。**
  // > **中心に大きいものを 1 つ、周りに輪を 2 重に置く**——**届く範囲がそのまま見える。**
  draw(spec.dim, at, radius, spec.particle ?? BOOM.particle);
  try {
    spec.dim.playSound(spec.sound ?? BOOM.sound, at, { volume: 1.2 });
  } catch {
    /* 読み込まれていない */
  }
  let caught = 0;
  for (const p of world.getAllPlayers()) {
    if (!has(p) || !hittable(p)) continue;
    const d = Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
    if (d > radius) continue;
    // **中心で 1.0、縁で 0**
    const near = 1 - d / radius;
    const dealt = Math.max(1, Math.round(spec.power * near));
    hit({ target: p, attack: dealt, source: at, knockPower: knockMax * near, knockUp: up * near });
    caught += 1;
  }
  return caught;
}
