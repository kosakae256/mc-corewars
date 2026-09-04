/**
 * 売り子を押したときの取り次ぎ。
 *
 * > ### 1 つのイベントを購読するのは 1 か所（`docs/imp.md` 10-2）
 * >
 * > **ショップとロール選択は別の機能**だが、**押されるのは同じイベント。**
 * > **ここで 1 回だけ購読して、登録された係へ配る。**
 */

import { world, type Entity, type Player } from "@minecraft/server";

import { toVendorKind, type VendorKind } from "../core/shop.js";
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

/** 係を足す。**トップレベルから 1 度だけ** */
export function onVendor(handler: VendorHandler): void {
  handlers.push(handler);
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
    const kind = kindOf(ev.target);
    if (kind === undefined) return;
    for (const handler of handlers) {
      try {
        if (handler(ev.player, kind, ev.target)) return;
      } catch (err) {
        console.warn(`[vendor] ${String(err)}`);
      }
    }
  });
}
