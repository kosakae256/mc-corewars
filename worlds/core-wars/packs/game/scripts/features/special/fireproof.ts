/**
 * 火では何も損なわれない。
 *
 * 仕様は `docs/spec/14-death.md` 6-B。
 *
 * ## なぜ
 *
 * **火は場所を通せんぼするためのもの。**
 *
 * ファイヤーチャージ（`docs/03-content.md` 1-4）は
 * **その場を焼いて通れなくする道具**として置いてある。
 * そこに「入れば削れる」が乗ると、**遠距離から削り合う**遊びになる。
 *
 * 火のついた場所は**「入りたくない場所」であればよく、
 * 「入ったら減る場所」である必要が無い。**
 *
 * ## 3 つまとめて 1 箇所に置く
 *
 * | | |
 * | --- | --- |
 * | ダメージ | **打ち消す** |
 * | 燃えている見た目 | **消す** |
 * | 落ちている物 | **燃やさない** |
 *
 * どれも「火では損なわれない」という 1 つの決まりなので、分けない。
 *
 * ## 火炎耐性は使わない
 *
 * 効果を付けると**常時その印が出て、画面も色付く。**
 * 効果の枠も 1 つ潰れる。
 *
 * **ダメージが来たところで打ち消し、燃えたらすぐ消す。**
 */

import { EntityDamageCause, system, world, type Entity } from "@minecraft/server";

/**
 * 打ち消す原因。
 *
 * **火の中に居る**のと**燃え移った**の 2 つ。
 * **溶岩は入れない**——マップの仕掛けとして残す。
 */
const FIRE: ReadonlySet<EntityDamageCause> = new Set([EntityDamageCause.fire, EntityDamageCause.fireTick]);

/** 見張る間隔（tick）。**燃えた直後に消したいので短く** */
const INTERVAL = 5;

/** 落ちている物 */
const ITEM_ENTITY = "minecraft:item";

/** 燃えているなら消す。**燃えていなければ何もしない** */
function douse(entity: Entity): void {
  try {
    if (entity.getComponent("minecraft:onfire") === undefined) return;
    entity.extinguishFire(false);
  } catch {
    /* 消えている */
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startFireproof(): void {
  system.runInterval(() => {
    for (const p of world.getAllPlayers()) douse(p);

    // ---- **落ちている物も燃やさない**（docs/spec/14-death.md 6-B）
    //
    // 死んで落とした装備が、**そのあと燃え広がった火で消える**——
    // 取り返しに行っても何も無い、が起きる。
    //
    // 火は**通せんぼ**であって、**物を消す仕掛けではない**
    try {
      for (const e of world.getDimension("overworld").getEntities({ type: ITEM_ENTITY })) douse(e);
    } catch {
      /* 読み込まれていない。次の機会に */
    }
  }, INTERVAL);
}

/**
 * ダメージの打ち消しを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerFireproof(): void {
  world.beforeEvents.entityHurt.subscribe((ev) => {
    // **人も物も同じ扱い。** 火では損なわれない
    if (!FIRE.has(ev.damageSource.cause)) return;
    ev.cancel = true;
  });
}
