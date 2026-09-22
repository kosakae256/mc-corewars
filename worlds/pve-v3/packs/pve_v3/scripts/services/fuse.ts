/**
 * **導火線と自爆**（クリーパー・帯電クリーパー）。
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 2 章。
 *
 * > ### **`features/mob/index.ts` から切り出した**（2026-09-08）
 * >
 * > **1 ファイル 300 行という決まりがある。**
 */

import { type Entity, type Player } from "@minecraft/server";

import type { EnemyDef } from "../core/enemy.js";
import { BOOM } from "../core/tuning.js";
import { boom as blast } from "./boom.js";
import { knockOf } from "./melee.js";

/** 届く半径（マス）。**敵が書いていなければ既定** */
const BOOM_R = BOOM.radius;

/** 押す強さの上限 */
const BOOM_KB = BOOM.knock;

/** 上へ飛ばす強さ。**爆発だけの例外** */
const BOOM_UP = BOOM.up;

/** 膨らみの進み具合（0〜1）。**バニラのアニメがここを見る** */
const FUSE = "pve_v3:fuse";

/**
 * **膨らませる。**
 *
 * > ### **`query.swell_amount` は借りられない**（実測・2026-09-08）
 * >
 * > **公式**: *Only works for `"minecraft:creeper"` and `"minecraft:wither"`.*
 * > **写した実体では常に 0**——**膨らまないまま、いきなり爆発して見える。**
 * >
 * > **バニラの `animation.creeper.swelling` は、`pre_animation` が作った
 * > `variable.swelling_scale1/2` を見るだけ。**
 * > **その式が読む値を、自前の property に差し替えてある**（`tools/pve3-newmob.mjs`）。
 * > **アニメも描画制御も、バニラのまま動く。**
 *
 * @param done 0（点いた）〜 1（爆発）
 */
export function warn(mob: Entity, done: number): void {
  try {
    // **点いた瞬間に 1 度だけ鳴らす**（バニラの導火線の音）
    if (done <= 0.01) mob.dimension.playSound("random.fuse", mob.location, { volume: 1.0 });
    mob.setProperty(FUSE, Math.max(0, Math.min(1, done)));
  } catch {
    /* その property を持たない実体 */
  }
}

/** **火が消えた。** 膨らみを戻す */
export function unswell(mob: Entity): void {
  try {
    mob.setProperty(FUSE, 0);
  } catch {
    /* その property を持たない実体 */
  }
}

/**
 * 自爆。**地形は壊さない**（`16-enemy.md` 5-1）。
 *
 * ```
 * 中心 ── 力そのまま・押す強さも最大
 *   │      外へ行くほど、まっすぐ減る
 *   └── 半径 BOOM_R で 0
 * ```
 *
 * > ### **爆発だけは浮かせる**（2026-09-08 決定）
 * >
 * > **普通の攻撃では浮かせない**（`22-feedback.md` 6-2）。**爆発は例外。**
 */
export function boom(mob: Entity, power: number, def: EnemyDef | undefined): void {
  try {
    // > ### **爆発は共通部品へ寄せた**（2026-09-08）
    // >
    // > **爆発する敵は 5 体いる。** **別々に書けば 5 種類の爆発ができる**
    // > （`25-enemy-kit.md` 2 章）。**半径と浮きだけ、その敵の値を渡す。**
    blast({
      dim: mob.dimension,
      at: mob.location,
      power,
      radius: def?.boom?.radius ?? BOOM_R,
      knock: knockOf(mob) ?? BOOM_KB,
      up: def?.boom?.up ?? BOOM_UP,
    });
    mob.remove();
  } catch {
    /* もう居ない */
  }
}

/** 火が点いた時刻。**id ごと** */
const lit = new Map<string, number>();

/** 消えない距離の倍率。**バニラは 2.5 → 6** */
const KEEP = 2.4;

/**
 * **導火線を進める。** **2 tick に 1 回。**
 *
 * > ### **イベント頼みをやめた**（2026-09-08）
 * >
 * > **`minecraft:start_exploding` を待っていたが、膨らまなかった。**
 * > **距離はこちらでも測れる。** **測って、`pve_v3:fuse` を自分で動かす。**
 * > **バニラの部品は、音と爆発の見た目のために残してある。**
 *
 * ```
 * 間合い（reach）に入る ── 火が点く
 *   │                       pve_v3:fuse を 0 → 1 へ
 *   ├ reach × 2.4 より遠い ── 火が消える（0 に戻す）
 *   └ interval 経った ────── 爆発
 * ```
 */
export function stepFuse(
  now: number,
  foes: readonly Entity[],
  people: readonly Player[],
  defOf: (mob: Entity) => EnemyDef | undefined,
  powerOf: (mob: Entity) => number
): void {
  for (const mob of foes) {
    try {
      const def = defOf(mob);
      if (def?.kind !== "boom") continue;
      const at = mob.location;
      const reach = def.reach;
      const started = lit.get(mob.id);
      const gap = (p: Player): number => Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z);
      const near = people.some((p) => gap(p) <= (started === undefined ? reach : reach * KEEP));
      if (!near) {
        // **離れたら消える**（`boom.noStop` を書いた敵は止まらない）
        if (def.boom?.noStop === true && started !== undefined) {
          /* そのまま進む */
        } else {
          if (started !== undefined) {
            lit.delete(mob.id);
            unswell(mob);
          }
          continue;
        }
      }
      if (started === undefined) {
        lit.set(mob.id, now);
        warn(mob, 0);
        continue;
      }
      const done = (now - started) / def.interval;
      if (done < 1) {
        warn(mob, done);
        continue;
      }
      lit.delete(mob.id);
      boom(mob, powerOf(mob) || def.attack, def);
    } catch {
      lit.delete(mob.id);
    }
  }
}
