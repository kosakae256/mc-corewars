/**
 * 強化の台。**マップに置いたブロックの所へ、強化の実体を出す。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 3-3。
 *
 * > ### コードにマップごとの座標表を持たない
 * >
 * > **台はマップの構造物に焼き込まれる。**
 * > **マップを直せば置き場所も変わる**——コードは触らない。
 *
 * > ### 1 つのブロックの状態違いにしない（2026-09-05 に直した）
 * >
 * > **状態違いはクリエイティブに 1 つしか出ない。**
 * > **建てる人が選べないと意味がない**ので、**5 つのブロックに分けた。**
 */

import { world, type Vector3 } from "@minecraft/server";

import type { VendorKind } from "../core/shop.js";
import { FIELD, PLACES } from "../core/places.js";
import { spawnVendor } from "./vendor.js";

/** ブロック → 何を売るか */
export const POSTS: Readonly<Record<string, VendorKind>> = {
  "pve_v3:post_hp": "hp",
  "pve_v3:post_speed": "speed",
  "pve_v3:post_haste": "haste",
  "pve_v3:post_power": "power",
  "pve_v3:post_shop": "shop",
};

/** 見つけた台 1 つ */
export interface PostSpot {
  readonly kind: VendorKind;
  /** **実体を出す位置**（ブロックの 1 つ上・中心） */
  readonly at: Vector3;
}

/**
 * その辺りの台を全部探す。
 *
 * **数が多いので、呼ぶ側が回数を絞ること**（休憩所は覚えて使い回す）。
 */
export function findPosts(center: Vector3, radius: number, low: number, high: number): PostSpot[] {
  const out: PostSpot[] = [];
  try {
    const dim = world.getDimension("overworld");
    const cx = Math.floor(center.x);
    const cz = Math.floor(center.z);
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        for (let y = low; y <= high; y++) {
          const b = dim.getBlock({ x, y, z });
          if (b === undefined) continue;
          const kind = POSTS[b.typeId];
          if (kind === undefined) continue;
          out.push({ kind, at: { x: x + 0.5, y: y + 1, z: z + 0.5 } });
        }
      }
    }
  } catch {
    /* 読み込まれていない */
  }
  return out;
}

/**
 * 戦場の台を探して、その上に実体を出す。
 *
 * **探すのは ±50 の中、地面まわりの高さだけ**（`14-map-build.md` 0-1）。
 *
 * @returns 出した数
 */
export function spawnPosts(): number {
  let n = 0;
  const found = findPosts({ x: 0, y: 0, z: 0 }, FIELD.half, FIELD.groundY - 4, FIELD.groundY + 12);
  for (const spot of found) {
    try {
      spawnVendor(spot.kind, spot.at);
      n++;
    } catch {
      /* 読み込まれていない */
    }
  }
  return n;
}

/**
 * その辺りの、その名前のブロックを全部探す。
 *
 * **`findPosts` と同じ歩き方**——数が多いので、呼ぶ側が回数を絞ること。
 */
export function findBlocks(center: Vector3, radius: number, low: number, high: number, id: string): Vector3[] {
  const out: Vector3[] = [];
  try {
    const dim = world.getDimension("overworld");
    const cx = Math.floor(center.x);
    const cz = Math.floor(center.z);
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        for (let y = low; y <= high; y++) {
          if (dim.getBlock({ x, y, z })?.typeId === id) out.push({ x, y, z });
        }
      }
    }
  } catch {
    /* 読み込まれていない */
  }
  return out;
}

/** 休憩所を探す範囲（`14-map-build.md` 6 章の神殿がちょうど収まる） */
const REST_R = 40;

/** 覚えておく。**毎周期 20 万マス見るわけにはいかない** */
let restCache: PostSpot[] | undefined;

/**
 * **休憩所の台**（`13-flow.md` 3-4）。
 *
 * **一度探したら覚える。** 建て直したら `forgetRestPosts()` を呼ぶこと。
 */
export function restPosts(): readonly PostSpot[] {
  if (restCache !== undefined) return restCache;
  const found = findPosts(PLACES.rest, REST_R, PLACES.rest.y - 4, PLACES.rest.y + 12);
  // **1 つも無いときは覚えない**（まだ読み込まれていないだけかもしれない）
  if (found.length > 0) restCache = found;
  return found;
}

/** 覚えたぶんを捨てる */
export function forgetRestPosts(): void {
  restCache = undefined;
}
