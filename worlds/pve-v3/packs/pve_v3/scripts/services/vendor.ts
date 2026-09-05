/**
 * 売り子を押したときの取り次ぎ。
 *
 * > ### 1 つのイベントを購読するのは 1 か所（`docs/imp.md` 10-2）
 * >
 * > **ショップとロール選択は別の機能**だが、**押されるのは同じイベント。**
 * > **ここで 1 回だけ購読して、登録された係へ配る。**
 */

import { Player, world, type Entity, type Vector3 } from "@minecraft/server";

import { lookOf, toVendorKind, vendorLabel, type VendorKind } from "../core/shop.js";
import { setLabel } from "../state/label.js";
import { KEYS } from "../state/keys.js";

/** 売り子の実体 */
export const VENDOR = "pve_v3:vendor";

/**
 * 押されたときに呼ばれるもの。
 *
 * @returns **自分が扱ったら true。** false なら次の係へ回す
 */
export type VendorHandler = (player: Player, kind: VendorKind, vendor: Entity) => boolean;

const handlers: VendorHandler[] = [];
const hitHandlers: VendorHandler[] = [];

/** **押されたとき**の係を足す。**トップレベルから 1 度だけ** */
export function onVendor(handler: VendorHandler): void {
  handlers.push(handler);
}

/** **殴られたとき**の係を足す（`13-flow.md` 3-4） */
export function onVendorHit(handler: VendorHandler): void {
  hitHandlers.push(handler);
}

function deal(list: readonly VendorHandler[], player: Player, target: Entity): void {
  const kind = kindOf(target);
  if (kind === undefined) return;
  for (const handler of list) {
    try {
      if (handler(player, kind, target)) return;
    } catch (err) {
      console.warn(`[vendor] ${String(err)}`);
    }
  }
}

/** その売り子が何を売るか */
export function kindOf(entity: Entity): VendorKind | undefined {
  try {
    return toVendorKind(entity.getDynamicProperty(KEYS.sells));
  } catch {
    return undefined;
  }
}

/** 場に居る売り子 */
export function vendors(): Entity[] {
  try {
    return world.getDimension("overworld").getEntities({ type: VENDOR });
  } catch {
    return [];
  }
}

let subscribed = false;

/** 購読する。**何度呼んでも 1 回しか登録しない** */
export function subscribeVendors(): void {
  if (subscribed) return;
  subscribed = true;
  world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.target.typeId !== VENDOR) return;
    deal(handlers, ev.player, ev.target);
  });
  // ---- **殴られた**（`13-flow.md` 3-4。殴るたびに 1 段）
  world.afterEvents.entityHitEntity.subscribe((ev) => {
    if (ev.hitEntity.typeId !== VENDOR) return;
    const by = ev.damagingEntity;
    if (!(by instanceof Player)) return;
    deal(hitHandlers, by, ev.hitEntity);
  });
}

/**
 * 売り子を 1 体出す。
 *
 * **休憩所も戦場も、出し方はこれ 1 つ**——
 * 置き場所の決め方だけが違う（休憩所は表、戦場は印のブロック）。
 */
export function spawnVendor(kind: VendorKind, at: Vector3): Entity {
  const e = world.getDimension("overworld").spawnEntity(VENDOR, at);
  e.setDynamicProperty(KEYS.sells, kind);
  // **どのブロックの絵にするか。** 見た目はこれだけで決まる（`core/shop.ts`）
  try {
    e.setProperty("pve_v3:kind", lookOf(kind));
  } catch {
    /* 定義が読み込まれていない */
  }
  setLabel(e, vendorLabel(kind));
  return e;
}
