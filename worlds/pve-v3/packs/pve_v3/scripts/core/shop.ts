/**
 * ショップの品書き。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md`。
 *
 * ## 売り子は 5 人
 *
 * | 何を売るか | 見た目の名前 |
 * | --- | --- |
 * | `shop` | **ショップ**（4 本まとめて買える） |
 * | `hp` / `speed` / `haste` / `power` | **その 1 本だけ** |
 *
 * **中身は同じ**——`shop` は 4 本すべてを一覧に出すだけ。
 */

import { STATS, type StatKey } from "./growth.js";

/** 売り子が扱うもの */
export type VendorKind = "shop" | "role" | StatKey;

/** 並び。**左から順に置く** */
export const VENDORS: readonly VendorKind[] = ["hp", "speed", "shop", "haste", "power"];

/**
 * 売り子の立ち位置（休憩所の中心からの相対）。**`core/rest-temple.ts` の並びに合わせる。**
 *
 * **`role` は入っていない**——**職業の村人はロビーに、手で呼ぶ**（`/pve:jobmaster`）。
 */
export const VENDOR_SPOTS: Readonly<Partial<Record<VendorKind, { x: number; y: number; z: number }>>> = {
  hp: { x: -10, y: 1, z: 31 },
  speed: { x: -5, y: 1, z: 31 },
  shop: { x: 0, y: 1, z: 31 },
  haste: { x: 5, y: 1, z: 31 },
  power: { x: 10, y: 1, z: 31 },
};

/**
 * **見た目の番号。** 実体のプロパティ `pve_v3:kind` に入れる。
 *
 * **並びは `render_controllers/pve3_post.render_controllers.json` の
 * `Array.skins` と同じ順**——ずらすと別のブロックの絵になる。
 */
export const LOOKS: readonly VendorKind[] = ["hp", "speed", "shop", "haste", "power"];

/** その売り子の見た目の番号（表に無ければ 0） */
export function lookOf(kind: VendorKind): number {
  const i = LOOKS.indexOf(kind);
  return i < 0 ? 0 : i;
}

/** 頭の上に出す名前 */
export function vendorLabel(kind: VendorKind): string {
  if (kind === "shop") return "§aショップ§7（仮）";
  if (kind === "role") return "§e職業§7（仮）";
  return `§b${STATS[kind].label}§7 の強化`;
}

/** 保存する値からの読み替え */
export function toVendorKind(value: unknown): VendorKind | undefined {
  if (value === "shop") return "shop";
  if (value === "role") return "role";
  if (value === "hp" || value === "speed" || value === "haste" || value === "power") return value;
  return undefined;
}
