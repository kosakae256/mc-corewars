/**
 * ノックバック棒を、もっと飛ばす。
 *
 * 仕様は `docs/03-content.md` 1-1-C。
 *
 * ## なぜ足すのか
 *
 * **バニラのノックバックは 2 が上限。**
 * 付呪は乗っているが、**落とす道具としては物足りなかった。**
 *
 * 倒すためではなく**奈落へ落とすため**の道具なので、
 * **飛距離がそのまま値打ち**になる。
 *
 * ## 打ち消さずに、足す
 *
 * 殴りそのものは**バニラのまま通す。**
 * 打ち消すと**ノックバックまで消える**（`docs/spec/14-death.md`）。
 *
 * **当たった後に、こちらから押す。**
 * バニラの分に上乗せする形なので、走り込みの伸びもそのまま残る。
 */

import { Player, world } from "@minecraft/server";

/** この道具 */
const ITEM = "game:knock_stick";

/** 横に押す強さ。**バニラの上乗せ分** */
const PUSH = 1.6;

/** 上に浮かせる強さ。**少しだけ。** 高く上げると落ちるまでが長い */
const LIFT = 0.42;

/** 殴った人がこれを持っているか */
function holding(player: Player): boolean {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    return c?.getItem(player.selectedSlotIndex)?.typeId === ITEM;
  } catch {
    return false;
  }
}

/**
 * 受け取りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function registerKnockStick(): void {
  world.afterEvents.entityHurt.subscribe((ev) => {
    const by = ev.damageSource.damagingEntity;
    if (!(by instanceof Player) || !holding(by)) return;

    const victim = ev.hurtEntity;
    if (!(victim instanceof Player)) return;

    try {
      const a = by.location;
      const b = victim.location;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      // **真上から殴られた**など、向きが決まらないときは押さない
      if (len < 1e-3) return;
      victim.applyKnockback({ x: (dx / len) * PUSH, z: (dz / len) * PUSH }, LIFT);
    } catch {
      /* 消えている */
    }
  });
}
