/**
 * ツルハシの攻撃力を固定する。
 *
 * 仕様は `docs/03-content.md` 1-6。
 *
 * ## なぜ
 *
 * **ツルハシは道具であって、武器ではない。**
 *
 * バニラでは段階ごとに火力が違い（木 2 〜 ネザライト 6）、
 * **ダイヤのツルハシが剣の代わりになる。**
 * 剣（[13-grapple.md](../../../../docs/spec/13-grapple.md) 9 章）は
 * ワイヤーを撃つための道具でもあるので、
 * **「殴るならツルハシ」になると、買う意味の並びが崩れる。**
 *
 * ## どうやるか
 *
 * **バニラのツルハシは定義を差し替えられない**
 *（アイテム定義がゲーム側にあり、手元に無い）。
 *
 * | やり方 | 採否 |
 * | --- | --- |
 * | 独自のツルハシを作る | **不採用。** 採掘の速さと段階を全部書き直すことになる |
 * | 殴りを打ち消して 1 だけ与え直す | **不採用。** 打ち消すと**ノックバックまで消える** |
 * | **入った分から差し引きを戻す** | **採用** |
 *
 * **叩き自体はバニラのまま通す。**
 * 入った直後に「入りすぎた分」を戻せば、
 * **押される力もクールダウンもバニラのまま**で、減る量だけが変わる。
 *
 * > 体力の表示が**一瞬だけ深く減って戻る。**
 * > そこは目をつぶる。**動きが変わるほうが困る。**
 */

import { EntityDamageCause, EquipmentSlot, Player, world, type EntityDamageSource } from "@minecraft/server";

/** ツルハシで殴ったときのダメージ。**段階に依らない** */
export const PICKAXE_DAMAGE = 1;

/**
 * 持っているものがツルハシか。
 *
 * **バニラのものだけを見る**（`_pickaxe` で終わる id）。
 *
 * ショップで売るのは**独自のツルハシ**（`game:pick_*`）になり、
 * そちらは**定義そのものに攻撃力 1 が書いてある**ので、ここは通らない。
 *
 * それでも残してあるのは、**運営が配ったバニラのツルハシ**のため。
 * **どちらの経路でも 1 になる。**
 */
function isPickaxe(typeId: string | undefined): boolean {
  return typeId !== undefined && typeId.endsWith("_pickaxe");
}

/**
 * その一撃はツルハシの殴りか。
 *
 * **`features/death` も見る。**
 * 致命傷かどうかの見積もりに、**入る前の値**として使う。
 */
export function isPickaxeHit(source: EntityDamageSource): boolean {
  if (source.cause !== EntityDamageCause.entityAttack) return false;
  const by = source.damagingEntity;
  if (!(by instanceof Player)) return false;
  try {
    return isPickaxe(by.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId);
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
export function registerPickaxe(): void {
  world.afterEvents.entityHurt.subscribe((ev) => {
    if (!isPickaxeHit(ev.damageSource)) return;
    const back = ev.damage - PICKAXE_DAMAGE;
    // **入った分が既に 1 以下。** 戻す必要が無い
    if (back <= 0) return;
    try {
      const h = ev.hurtEntity.getComponent("minecraft:health");
      if (h === undefined) return;
      // **上限は超えない。** 増えている分（吸収）まで押し上げない
      h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + back));
    } catch {
      /* 消えている */
    }
  });
}
