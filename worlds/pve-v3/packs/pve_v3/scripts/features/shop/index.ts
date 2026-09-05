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
  type Vector3,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { canBuyHere, canShop } from "../../core/state.js";
import { PLACES } from "../../core/places.js";
import { VENDORS, VENDOR_SPOTS, vendorLabel, type VendorKind } from "../../core/shop.js";
import { STATS, isMaxed, nextCost, type StatKey } from "../../core/growth.js";
import { levelOf } from "../../state/growth.js";
import { buy } from "../../services/growth.js";
import { noteHit } from "../../services/reward.js";
import { onHit } from "../../services/combat.js";
import { onVendor, onVendorHit, spawnVendor, subscribeVendors, VENDOR, vendors } from "../../services/vendor.js";
import { forgetRestPosts, restPosts, type PostSpot } from "../../services/post.js";
import { phaseOf } from "../../services/presence.js";
import { openVendor } from "./ui.js";

/**
 * 休憩所の台の並び（**ブロックが 1 つも置かれていないとき**の代わり）。
 *
 * **`PLACES.rest` は「立つ高さ」**。床は 1 つ下。
 */
function fallbackSpots(): PostSpot[] {
  const out: PostSpot[] = [];
  for (const kind of VENDORS) {
    const s = VENDOR_SPOTS[kind];
    if (s === undefined) continue;
    out.push({ kind, at: { x: PLACES.rest.x + s.x, y: PLACES.rest.y - 1 + s.y, z: PLACES.rest.z + s.z } });
  }
  return out;
}

/** 休憩所と見なす広さ（神殿がちょうど収まる） */
const REST_NEAR = 48;

/** 休憩所のまわりか */
function nearRest(at: Vector3): boolean {
  return Math.hypot(at.x - PLACES.rest.x, at.z - PLACES.rest.z) <= REST_NEAR;
}

/** その場所に、もう売り子が立っているか */
function standing(here: readonly Entity[], at: Vector3): boolean {
  return here.some((e) => {
    try {
      const p = e.location;
      return Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z) < 1.2;
    } catch {
      return false;
    }
  });
}

/**
 * 休憩所の売り子を、**台のブロックに合わせて立て直す**（`13-flow.md` 3-4）。
 *
 * > ### 並びを表で持たない
 * >
 * > **戦場と同じく、置いたブロックの上に出る。**
 * > **まだ 1 つも置かれていない休憩所**のために、
 * > **昔の並び**を代わりに使う（建てたら、そちらが優先される）。
 */
function reconcile(): void {
  const found = restPosts();
  const want = found.length > 0 ? found : fallbackSpots();
  const here = vendors().filter((e) => {
    try {
      return nearRest(e.location);
    } catch {
      return false;
    }
  });

  // ---- **1 か所に 1 体だけ残す。** 台の無い所と、重なったぶんは片付ける
  //
  // > ### `/reload` しても増えないように（2026-09-05）
  // >
  // > 売り子は**消えない**ようにしてある（`minecraft:persistent`）ので、
  // > **「居なければ立てる」だけでは、同じ所に重なっていく。**
  const taken = new Set<number>();
  const keep: Entity[] = [];
  for (const e of here) {
    const i = want.findIndex((w, k) => !taken.has(k) && standing([e], w.at));
    if (i < 0) {
      try {
        e.remove();
      } catch {
        /* もう居ない */
      }
      continue;
    }
    taken.add(i);
    keep.push(e);
  }
  // ---- 空いている台に立てる
  for (const [i, w] of want.entries()) {
    if (taken.has(i)) continue;
    try {
      spawnVendor(w.kind, w.at);
    } catch {
      // **読み込まれていないだけ**（誰も休憩所に居ない）。次の周期でまた試す
    }
  }
}

/** **1 段だけ買う。** 買えなければ、なぜかを出す */
function buyOne(player: Player, key: StatKey): void {
  const before = levelOf(player, key);
  const r = buy(player, key, 1);
  if (r.bought === 0) {
    const why = isMaxed(key, before) ? "上限" : `エメラルドが足りない §8必要 ${nextCost(key, before) ?? 0}`;
    player.onScreenDisplay.setActionBar(`§c${STATS[key].label} §7— ${why}`);
    player.playSound("note.bass", { volume: 0.5, pitch: 0.7 });
    return;
  }
  player.playSound("random.orb", { volume: 0.5, pitch: 1.2 });
  player.onScreenDisplay.setActionBar(
    `§b${STATS[key].label} §f${r.value.toFixed(STATS[key].digits)}§7 §8(${r.level}/${STATS[key].maxLevel})` +
      ` §7— §a-${r.spent}§7（残り §a${r.left}§7）`
  );
}

function subscribe(): void {
  // ---- 売り子を右クリック（**取り次ぎは `services/vendor.ts`**）
  subscribeVendors();
  onVendor((player, kind) => {
    if (kind === "role") return false;
    // **画面を開くのはショップだけ**（1 本売りは殴って買う。`13-flow.md` 3-4）
    if (kind !== "shop") return true;
    if (!canShop(phaseOf(player))) {
      player.onScreenDisplay.setActionBar("§7買えるのは休憩所だけ");
      return true;
    }
    openVendor(player, kind);
    return true;
  });

  // ---- **殴るたびに 1 段**（`13-flow.md` 3-4）
  onVendorHit((player, kind) => {
    if (kind === "role" || kind === "shop") return false;
    if (!canBuyHere(phaseOf(player))) {
      player.onScreenDisplay.setActionBar("§7ここでは買えない");
      return true;
    }
    buyOne(player, kind);
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
        forgetRestPosts();
        reconcile();
        player.sendMessage(`§7売り子を立て直した §8${vendors().length} 体`);
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
