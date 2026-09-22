/**
 * **殴りモーションの時計。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 16 章。
 *
 * > ### **engine の変数は、こちらの実体には来ない**（実測・2026-09-08）
 * >
 * > **バニラのゴーレムの腕振りは `variable.attack_animation_tick` で動く。**
 * > **これは engine が「本物のアイアンゴーレム」にだけ入れる値。**
 * > **写した実体には来ないので、歩くだけで殴っているように見えた。**
 * >
 * > **`pve3-anim.py` が `DARE MO IRENAI` と教えてくれていた値**——道具が当てた。
 *
 * ```
 * 敵が当てた ── property を 10 にする
 *      ↓ 2 tick ごとに 2 ずつ減らす
 *      0 になったら止まる（＝ 10 tick ＝ 0.5 秒の振り）
 * ```
 *
 * **実体ファイルの `pre_animation` が、この property から変数を作る**
 * （`tools/pve3-newmob.mjs` の `swingIn`）。
 */

import { world, type Entity } from "@minecraft/server";

/** 振りの property */
const KEY = "pve_v3:swing";

/** 振り始めの値。**バニラの式は 10 で 1 周する** */
const FULL = 10;

/** 1 回でどれだけ減らすか */
const STEP = 2;

/** いま振っているもの。**メモリだけ** */
const swinging = new Set<string>();

/** 振り始める。**当てた瞬間に呼ぶ** */
export function startSwing(mob: Entity): void {
  try {
    mob.setProperty(KEY, FULL);
    swinging.add(mob.id);
  } catch {
    /* その property を持たない実体 */
  }
}

/** 振りを進める。**2 tick に 1 回** */
export function stepSwings(): void {
  if (swinging.size === 0) return;
  for (const id of [...swinging]) {
    const mob = byId(id);
    if (mob === undefined) {
      swinging.delete(id);
      continue;
    }
    try {
      const now = mob.getProperty(KEY);
      const left = typeof now === "number" ? now - STEP : 0;
      mob.setProperty(KEY, Math.max(0, left));
      if (left <= 0) swinging.delete(id);
    } catch {
      swinging.delete(id);
    }
  }
}

/** id から実体を引く */
function byId(id: string): Entity | undefined {
  try {
    return world.getEntity(id);
  } catch {
    return undefined;
  }
}
