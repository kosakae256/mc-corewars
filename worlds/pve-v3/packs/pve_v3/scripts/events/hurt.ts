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

import { EntityDamageCause, system, world, type Entity, type EntityHurtAfterEvent } from "@minecraft/server";

import { hit } from "../services/combat.js";
import { has, max as maxHp } from "../state/hp.js";

/**
 * **通す原因。** ここに無いものは全部打ち消す。
 *
 * | | |
 * | --- | --- |
 * | `selfDestruct` | **`/kill`**。運営の手 |
 * | `override` | script や仕組みが**意図して殺すとき** |
 */
const PASS: readonly EntityDamageCause[] = [EntityDamageCause.selfDestruct, EntityDamageCause.override];

/**
 * **燃えている・溶岩の中**（`docs/spec/17-state.md` 3-7）。
 *
 * **バニラのダメージは打ち消すが、こちらのダメージに置き換える。**
 */
const BURN: readonly EntityDamageCause[] = [EntityDamageCause.fire, EntityDamageCause.fireTick, EntityDamageCause.lava];

/** 燃えたときに持って行かれる割合（**最大 HP に対して**） */
const BURN_CUT = 0.02;

/**
 * **同じ実体を、この間は 2 回削らない**（tick）。
 *
 * > ### **炎は原因が 2 つ同時に来る**（2026-09-08 に気づいた）
 * >
 * > **火の中に立つと `fire` が、燃えていると `fireTick` が、同じ拍で飛んでくる。**
 * > **溶岩も `lava` ＋ `fireTick`。** **そのまま拾うと 2 回削れて、音も 2 回鳴る。**
 */
const BURN_GAP = 8;

/** 最後に燃やした時刻。**実体ごと** */
const burned = new Map<string, number>();

/**
 * **バニラが 1 回削るたびに、こちらで 1 回削る。**
 *
 * **`beforeEvents` の中では削れない**（読むだけの時間）ので、**次の tick に回す。**
 */
function burn(target: Entity): void {
  const now = system.currentTick;
  try {
    const last = burned.get(target.id);
    if (last !== undefined && now - last < BURN_GAP) return;
    burned.set(target.id, now);
  } catch {
    return;
  }
  system.run(() => {
    try {
      if (!has(target)) return;
      const cap = maxHp(target);
      if (cap === undefined || cap <= 0) return;
      hit({ target, attack: Math.max(1, Math.floor(cap * BURN_CUT)), via: "fire" });
    } catch {
      /* 消えている */
    }
  });
}

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

    // **燃えているぶんは、打ち消したうえで置き換える**（`17-state.md` 3-7）
    if (BURN.includes(cause)) burn(ev.hurtEntity);

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
