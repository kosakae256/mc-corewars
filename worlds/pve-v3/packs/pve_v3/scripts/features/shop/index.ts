/**
 * ショップ。**売り子を立てて、右クリックで開く。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md`。
 *
 * | | |
 * | --- | --- |
 * | **売り子** | `pve_v3:vendor` ×5。**見た目は仮**（人の形を借りているだけ） |
 * | **立ち位置** | 休憩所の中心から `core/shop.ts` の `VENDOR_SPOTS` |
 * | **開き方** | 右クリック。**休憩所に居るときだけ** |
 *
 * ## 覚えるより、あるべき姿へ寄せる
 *
 * **居ない売り子は、周期ごとに立て直す**（`docs/imp.md` 10-7）——
 * 消しても `/reload` しても戻る。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Entity,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { canShop } from "../../core/state.js";
import { PLACES } from "../../core/places.js";
import { VENDORS, VENDOR_SPOTS, vendorLabel, type VendorKind } from "../../core/shop.js";
import { KEYS } from "../../state/keys.js";
import { setLabel } from "../../state/label.js";
import { noteHit } from "../../services/reward.js";
import { onHit } from "../../services/combat.js";
import { kindOf, onVendor, subscribeVendors, VENDOR, vendors } from "../../services/vendor.js";
import { phaseOf } from "../../services/presence.js";
import { openVendor } from "./ui.js";

/** 休憩所の、その立ち位置の絶対座標。**決まっていない売り子は undefined** */
function spotOf(kind: VendorKind): { x: number; y: number; z: number } | undefined {
  const s = VENDOR_SPOTS[kind];
  if (s === undefined) return undefined;
  // **`PLACES.rest` は「立つ高さ」**。床は 1 つ下
  return { x: PLACES.rest.x + s.x, y: PLACES.rest.y - 1 + s.y, z: PLACES.rest.z + s.z };
}

/** 居ない売り子を立て直す */
function reconcile(): void {
  const alive = new Map<VendorKind, Entity>();
  for (const e of vendors()) {
    const kind = kindOf(e);
    if (kind === undefined || alive.has(kind)) {
      // **素性の分からない売り子は片付ける**（二重に立てない）
      try {
        e.remove();
      } catch {
        /* もう居ない */
      }
      continue;
    }
    alive.set(kind, e);
  }
  for (const kind of VENDORS) {
    if (alive.has(kind)) continue;
    const spot = spotOf(kind);
    if (spot === undefined) continue;
    try {
      const e = world.getDimension("overworld").spawnEntity(VENDOR, spot);
      e.setDynamicProperty(KEYS.sells, kind);
      setLabel(e, vendorLabel(kind));
    } catch {
      // **読み込まれていないだけ**（誰も休憩所に居ない）。次の周期でまた試す
    }
  }
}

function subscribe(): void {
  // ---- 売り子を右クリック（**取り次ぎは `services/vendor.ts`**）
  subscribeVendors();
  onVendor((player, kind) => {
    if (kind === "role") return false;
    if (!canShop(phaseOf(player))) {
      player.onScreenDisplay.setActionBar("§7買えるのは休憩所だけ");
      return true;
    }
    openVendor(player, kind);
    return true;
  });

  // ---- 削った人を覚えておく（アシストのため）
  onHit((info) => {
    if (info.target instanceof Player) return;
    noteHit(info.target, info.by);
  });
}

/** 売り子を立て直す（試作） */
function vendorCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:vendors",
      description: "売り子を立て直す（試作）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        for (const v of vendors()) {
          try {
            v.remove();
          } catch {
            /* もう居ない */
          }
        }
        reconcile();
        player.sendMessage(`§7売り子を立て直した §8${vendors().length} 人`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const shop: Feature = {
  name: "shop",
  commands: [vendorCommand],
  subscribe,
  tick: {
    // **2 秒に 1 回で足りる**
    every: 40,
    run: reconcile,
  },
};
