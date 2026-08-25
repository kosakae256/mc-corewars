/**
 * 飲んだ後の空き瓶を残さない。
 *
 * 仕様は `docs/03-content.md` 1-3。
 *
 * ## なぜ
 *
 * **飲むたびに持ち物が 1 枠埋まる。**
 *
 * ポーションは戦闘の最中に飲むもの（`docs/spec/12-shop.md`）なのに、
 * 飲んだ結果として**要らない物が手元に増える。**
 * 戦っている最中に捨てる操作をさせたくない。
 *
 * 空き瓶は**使い道が無い。** 水を汲む遊びも、醸造も無い。
 *
 * ## 出さない手は採れない
 *
 * バニラのポーションは**アイテム定義が手元に無い**
 *（全部 `minecraft:potion` の 1 種類で、効果はデータ値。1-3）。
 * **「返ってくる物」を定義から消せない。**
 *
 * だから**返ってきた直後に消す。**
 *
 * ## 持ち物に入らなかった分も追う
 *
 * 持ち物が一杯だと、空き瓶は**足元に落ちる。**
 * そこを見ないと「拾えば残る」ことになる。
 */

import { system, world, type Container, type Player } from "@minecraft/server";

/** 飲むと空き瓶が返るもの */
const DRINKS: ReadonlySet<string> = new Set(["minecraft:potion", "minecraft:honey_bottle"]);

/** 返ってくる物 */
const BOTTLE = "minecraft:glass_bottle";

/** 足元を探す広さ（マス）。**落ちた直後なので狭くてよい** */
const NEAR = 2;

/** 持ち物から 1 本だけ減らす。**減らせたか返す** */
function takeOne(container: Container): boolean {
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it?.typeId !== BOTTLE) continue;
    if (it.amount <= 1) container.setItem(i, undefined);
    else {
      it.amount -= 1;
      container.setItem(i, it);
    }
    return true;
  }
  return false;
}

/** 足元に落ちた 1 本を消す */
function takeDropped(player: Player): void {
  try {
    for (const e of player.dimension.getEntities({
      type: "minecraft:item",
      location: player.location,
      maxDistance: NEAR,
    })) {
      if (e.getComponent("minecraft:item")?.itemStack.typeId !== BOTTLE) continue;
      e.remove();
      return;
    }
  } catch {
    /* 読み込まれていない。**拾われても害は無い** */
  }
}

/**
 * 受け取りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function registerNoBottle(): void {
  world.afterEvents.itemCompleteUse.subscribe((ev) => {
    if (!DRINKS.has(ev.itemStack.typeId)) return;
    const player = ev.source;
    // **返るのは飲み終わった後。** 同じ tick では、まだ手元に無い
    system.run(() => {
      try {
        const c = player.getComponent("minecraft:inventory")?.container;
        if (c !== undefined && takeOne(c)) return;
      } catch {
        /* 消えている */
      }
      // **持ち物に入らなかった＝足元に落ちている**
      takeDropped(player);
    });
  });
}
