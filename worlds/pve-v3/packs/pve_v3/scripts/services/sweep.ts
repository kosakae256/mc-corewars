/**
 * **薙ぎ払い。** **弾を飛ばさず、その場で当たりを決める。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 7 章。
 *
 * | 使う敵 | 形 |
 * | --- | --- |
 * | **回転**（★2） | **全周**（`angle: 360`・半径 4） |
 * | **妖狐**（★5） | **前方の扇**（`angle: 90` ほど） |
 * | **散弾**（★4） | **前方の狭い扇 ＋ 当たった数だけ重ねる** |
 *
 * ## なぜ弾を飛ばさないのか
 *
 * > ### **50 発飛ばすと重い**（`07-enemy-plan.md` 散弾）
 * >
 * > **弾は 1 発ずつ毎 tick 進める。** **50 発 × 敵の数だけ増える。**
 * > **当たりはその場で決めて、見た目だけ出す。**
 */

import { world, type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import { hittable } from "./mobaim.js";

import { SWEEP } from "../core/tuning.js";
import { hit } from "./combat.js";
import { current, has } from "../state/hp.js";
import { insideCone, insideFan } from "../core/charged-sweep.js";
import { clearSight } from "./sight.js";

/** 1 回ぶんの頼み方 */
export interface SweepSpec {
  readonly dim: Dimension;
  /** 中心（振る人の場所） */
  readonly at: Vector3;
  /** 向き。**扇のときだけ要る。** 無ければ全周として扱う */
  readonly dir?: Vector3;
  /** 1 発の力 */
  readonly power: number;
  /** 届く半径（マス）。**書かなければ既定** */
  readonly radius?: number;
  /** 広がり（度）。**360 なら全周。書かなければ既定** */
  readonly angle?: number;
  /**
   * **同じ人に何回当たるか。** **書かなければ 1 回**（重ならない）。
   *
   * **散弾はここを 50 にする**——**至近では 50 回ぶん入る。**
   */
  readonly hits?: number;
  /** 押す強さ */
  readonly knock?: number;
  /** 見た目の粒。**書かなければ既定** */
  readonly particle?: string;
  /** 上下の差。指定時だけ制限する（狐火）。 */
  readonly height?: number;
  /** 専用演出で描く場合はfalse。判定は一度だけ共通処理を通す。 */
  readonly showParticles?: boolean;
  /** 立体の円錐（狐火）。省略時は既存の水平扇形。 */
  readonly shape?: "cone";
  /** 判定する標的の足元からの高さ。 */
  readonly targetHeight?: number;
  /** 命中して生き残った相手を燃やす秒数。継続ダメージは既存の炎処理へ。 */
  readonly igniteSeconds?: number;
  /** 発射点から遮蔽物に隠れた相手には当てない。 */
  readonly cover?: boolean;
}

/** その人は扇の中か */
function inFan(spec: SweepSpec, target: Vector3, radius: number, angle: number): boolean {
  if (spec.shape === "cone" && spec.dir !== undefined) return insideCone(spec.at, target, spec.dir, radius, angle);
  return insideFan(spec.at, target, spec.dir, radius, angle, spec.height);
}

/** 見た目。**当たりの形をなぞって粒を置く** */
function draw(spec: SweepSpec, radius: number, angle: number): void {
  const marks = SWEEP.marks;
  const base = spec.dir === undefined ? 0 : Math.atan2(spec.dir.z, spec.dir.x);
  for (let i = 0; i < marks; i++) {
    const t = angle >= 360 ? (i / marks) * 2 * Math.PI : base + ((i / (marks - 1) - 0.5) * angle * Math.PI) / 180;
    try {
      spec.dim.spawnParticle(spec.particle ?? SWEEP.particle, {
        x: spec.at.x + Math.cos(t) * radius,
        y: spec.at.y + 1,
        z: spec.at.z + Math.sin(t) * radius,
      });
    } catch {
      /* 読み込まれていない */
    }
  }
}

/**
 * 振る。
 *
 * @returns 当てた人数
 */
export function sweep(spec: SweepSpec, source?: Entity): number {
  const radius = spec.radius ?? SWEEP.radius;
  const angle = spec.angle ?? SWEEP.angle;
  if (spec.showParticles !== false) draw(spec, radius, angle);
  const times = Math.max(1, spec.hits ?? 1);
  let caught = 0;
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== spec.dim.id || !has(p) || !hittable(p)) continue;
    const target = { ...p.location, y: p.location.y + (spec.targetHeight ?? 0) };
    if (!inFan(spec, target, radius, angle)) continue;
    if (spec.cover === true && !clearSight(spec.dim, spec.at, target)) continue;
    for (let i = 0; i < times; i++) {
      hit({
        target: p,
        attack: spec.power,
        source: source ?? spec.at,
        knockPower: i === 0 ? spec.knock : 0,
        kind: i === 0 ? "base" : "extra",
      });
    }
    if (spec.igniteSeconds !== undefined && spec.igniteSeconds > 0) {
      try {
        if ((current(p) ?? 0) > 0) p.setOnFire(spec.igniteSeconds, true);
      } catch {
        /* 命中直後の消滅など。炎上の失敗で他の相手の判定を中断しない。 */
      }
    }
    caught += 1;
  }
  return caught;
}
