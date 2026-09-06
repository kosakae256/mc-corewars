/**
 * **焼く・消す。** マップ倉庫の「バックアップ」まわり。
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 0-6。
 *
 * > ### 構造物は、持っているだけで重い（2026-09-07）
 * >
 * > **マップは常設**（スロットに置きっぱなし）なので、**普段は構造物が要らない。**
 * > **バックアップとして取り、要らなくなったら消す。**
 *
 * **`services/mapstore.ts` から切り出した**——1 ファイル 300 行の決まり。
 */

import { StructureSaveMode, world } from "@minecraft/server";

import { GRID, idsOf, nameOk, piecesOf } from "../core/map-store.js";
import { book, dim, gridOf, originXOf, writeBook } from "./mapstore.js";

/**
 * **いまの ±50 を、いまの割り方（16 枚）に分けて保存する。**
 *
 * 同じ名前があれば**上書き**——直したものをそのまま焼き直せる。
 * **焼き直した時点で、そのマップの割り方も新しくなる。**
 */
export function save(name: string, label?: string): { ok: boolean; message: string } {
  if (!nameOk(name)) return { ok: false, message: "名前は英小文字・数字・_ だけ（24 字まで）" };
  const d = dim();
  const ids = idsOf(name, GRID);
  // **そのマップの場所を焼く**（`19-map-store.md` 0-6）。**番号が無ければ作業台（0）**
  const ox = originXOf(name);
  try {
    for (const [i, p] of piecesOf(GRID).entries()) {
      const id = ids[i];
      if (id === undefined) continue;
      // **上書きするので、先に消す**
      world.structureManager.delete(id);
      world.structureManager.createFromWorld(
        id,
        d,
        { x: p.from.x + ox, y: p.from.y, z: p.from.z },
        { x: p.to.x + ox, y: p.to.y, z: p.to.z },
        {
          includeBlocks: true,
          // **敵や落ちている物まで焼かない**
          includeEntities: false,
          saveMode: StructureSaveMode.World,
        }
      );
    }
  } catch (err) {
    return { ok: false, message: `保存できなかった §8${String(err)}` };
  }
  const now = book();
  const was = now[name];
  writeBook({
    ...now,
    [name]: {
      label: label ?? was?.label ?? name,
      on: was?.on ?? false,
      grid: GRID,
      bigJump: was?.bigJump ?? false,
      // **番号は保つ**——焼き直しても場所は変わらない
      ...(was?.slot === undefined ? {} : { slot: was.slot }),
    },
  });
  return { ok: true, message: `${name} を保存した（${ids.length} 枚）` };
}

/**
 * **バックアップ（構造物）だけ消す。** 覚え書きと場所は残す。
 *
 * > ### 構造物は、持っているだけで重い（2026-09-07）
 * >
 * > **マップは常設なので、普段は要らない。**
 * > **消しても試合には出続ける**——**戻せなくなるだけ。**
 */
export function dropStructures(name: string): { ok: boolean; message: string } {
  const meta = book()[name];
  if (meta === undefined) return { ok: false, message: `${name} は倉庫に無い` };
  let gone = 0;
  for (const id of idsOf(name, Math.max(GRID, gridOf(name)))) {
    try {
      if (world.structureManager.delete(id)) gone++;
    } catch {
      /* パック同梱のものは消せない */
    }
  }
  return { ok: true, message: `${name} のバックアップを消した（${gone} 枚）` };
}

/**
 * 消す。**構造物と覚え書き。**
 *
 * **割り方を変える前に焼いた枚も落とす**ので、いちばん多い枚数で回す。
 */
export function remove(name: string): { ok: boolean; message: string } {
  let gone = 0;
  for (const id of idsOf(name, Math.max(GRID, gridOf(name)))) {
    try {
      if (world.structureManager.delete(id)) gone++;
    } catch {
      /* パック同梱のものは消せない */
    }
  }
  const now = { ...book() };
  delete now[name];
  writeBook(now);
  return { ok: true, message: `${name} を消した（構造物 ${gone} 枚）` };
}
