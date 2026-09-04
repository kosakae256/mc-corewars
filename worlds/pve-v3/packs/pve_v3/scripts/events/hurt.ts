/**
 * バニラのダメージを打ち消す。
 *
 * 仕様は `docs/spec/11-damage.md` 1 章。
 *
 * ## 1 イベント 1 購読
 *
 * `docs/imp.md` 10-2。**打ち消し合うイベントは、順番が意味を持つ。**
 * ここに規則を並べ、**上から順に見る。**
 *
 * ## 体力そのものは残す
 *
 * **「体力が無い」のではなく、「削られない」だけ。**
 * `/kill` が効かなくなると、**運営がモブを消せなくなる。**
 */

import { EntityDamageCause, world, type EntityHurtAfterEvent } from "@minecraft/server";

/**
 * **通す原因。** ここに無いものは全部打ち消す。
 *
 * | | |
 * | --- | --- |
 * | `selfDestruct` | **`/kill`**。運営の手 |
 * | `override` | script や仕組みが**意図して殺すとき** |
 */
const PASS: readonly EntityDamageCause[] = [EntityDamageCause.selfDestruct, EntityDamageCause.override];

/** 打ち消しの規則。**上から順に見る** */
interface HurtRule {
  readonly name: string;
  /** 打ち消すなら true */
  readonly deny: (cause: EntityDamageCause) => boolean;
}

const RULES: readonly HurtRule[] = [
  {
    // **運営の手は通す**（`docs/spec/11-damage.md` 1 章）
    name: "/kill は通す",
    deny: (cause) => !PASS.includes(cause),
  },
];

/** その原因は通すか */
function passes(cause: EntityDamageCause): boolean {
  return PASS.includes(cause);
}

/** 体力を満タンに戻す。**見た目のハートは飾り** */
function refill(ev: EntityHurtAfterEvent): void {
  // **通した分は戻さない。** 戻すと `/kill` が効かなくなる
  if (passes(ev.damageSource.cause)) return;
  try {
    ev.hurtEntity.getComponent("minecraft:health")?.resetToMaxValue();
  } catch {
    /* 消えている */
  }
}

export function subscribeHurt(): void {
  world.beforeEvents.entityHurt.subscribe((ev) => {
    const cause = ev.damageSource.cause;
    for (const rule of RULES) {
      if (ev.cancel) return;
      if (rule.deny(cause)) ev.cancel = true;
    }
  });

  // ---- 打ち消しをすり抜けた分を戻す
  //
  // **打ち消しは取りこぼす**（`/reload` の隙間・打ち消せない原因）。
  // 減ったまま放っておくと、**バニラの死が起きる**
  world.afterEvents.entityHurt.subscribe(refill);
}
