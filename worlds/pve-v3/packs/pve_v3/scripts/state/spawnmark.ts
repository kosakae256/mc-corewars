/**
 * 湧く場所の点を、ワールドに持つ。
 *
 * 仕様は `worlds/pve-v3/docs/spec/21-spawn-mark.md` 2 章。
 *
 * > ### マップ名で引く
 * >
 * > **`/pve:mapsave` をやり直しても点は残る。**
 * > 地形を大きく変えたら、点も選び直すこと。
 */

import { world } from "@minecraft/server";

import { keyOf, pack, PER_SLOT, unpack, type Mark } from "../core/spawnmark.js";

/** いま点を編集しているマップ */
const EDITING = "pve_v3:spawnedit";

/** そのマップの点を全部読む */
export function marksOf(map: string): Mark[] {
  const out: Mark[] = [];
  for (let slot = 0; slot < 32; slot++) {
    const raw = world.getDynamicProperty(keyOf(map, slot));
    if (typeof raw !== "string" || raw === "") break;
    out.push(...unpack(raw));
  }
  return out;
}

/**
 * そのマップの点を書く。
 *
 * **上限に当たったら次の本へ分ける**（`21-spawn-mark.md` 2 章）。
 */
export function setMarks(map: string, marks: readonly Mark[]): void {
  let slot = 0;
  for (let i = 0; i < marks.length; i += PER_SLOT) {
    world.setDynamicProperty(keyOf(map, slot), pack(marks.slice(i, i + PER_SLOT)));
    slot++;
  }
  // **余った本は消す**（減ったときに古いものが残らないように）
  for (let s = slot; s < 32; s++) {
    const key = keyOf(map, s);
    if (world.getDynamicProperty(key) === undefined) break;
    world.setDynamicProperty(key, undefined);
  }
}

/** いま編集しているマップ名 */
export function editing(): string | undefined {
  const v = world.getDynamicProperty(EDITING);
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function setEditing(map: string | undefined): void {
  world.setDynamicProperty(EDITING, map ?? "");
}
