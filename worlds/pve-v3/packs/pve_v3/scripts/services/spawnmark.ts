/**
 * 湧く場所の点を、選んで貯める。
 *
 * 仕様は `worlds/pve-v3/docs/spec/21-spawn-mark.md`。
 *
 * > ### 範囲は持たない。**選んだ瞬間に点へ畳む**
 * >
 * > 範囲のままだと、**中の「立てない所」まで含んでしまう。**
 * > **立てる面だけを拾って点にする**ので、湧かせる側は確かめなくてよい。
 */

import { system, world, type Dimension, type Player, type Vector3 } from "@minecraft/server";

import { isFullBlock, same, type Mark } from "../core/spawnmark.js";
import { FIELD } from "../core/places.js";
import { originXOf } from "./mapstore.js";
import { marksOf, setMarks } from "../state/spawnmark.js";

/** 敵が立つのに要る頭上の高さ */
const HEAD = 2;

/** 数える高さの上限（`14-map-build.md` 0-1 の範囲） */
const Y_LOW = -50;
const Y_HIGH = 40;

function dim(): Dimension {
  return world.getDimension("overworld");
}

/** 戦場の中か（`14-map-build.md` 0-1） */
function inField(x: number, z: number): boolean {
  return Math.abs(x) <= FIELD.half && Math.abs(z) <= FIELD.half;
}

/**
 * **そこに敵を立たせられるか。**
 *
 * | | |
 * | --- | --- |
 * | **足元** | **実体のあるブロック**（空・液体・半ブロック・草・松明などは駄目） |
 * | **頭上** | **2 マス空いている**——埋まって出てこない |
 *
 * **「実体がある」は名前で見分ける**（`core/spawnmark.ts` の `isFullBlock`）——
 * `Block.isSolid` がこの版の API に無いため。
 */
export function standable(at: Vector3): boolean {
  try {
    const d = dim();
    const floor = d.getBlock(at);
    if (floor === undefined || floor.isAir || floor.isLiquid) return false;
    if (!isFullBlock(floor.typeId)) return false;
    for (let dy = 1; dy <= HEAD; dy++) {
      const above = d.getBlock({ x: at.x, y: at.y + dy, z: at.z });
      if (above === undefined || !above.isAir) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** そのマップの点 */
export function marks(map: string): Mark[] {
  return marksOf(map);
}

export function count(map: string): number {
  return marksOf(map).length;
}

/** 全部捨てる */
export function clearMarks(map: string): void {
  setMarks(map, []);
}

/** いま数えている仕事。**`system.runJob` が進める** */
let job: number | undefined;

/** 数えている最中か */
export function scanning(): boolean {
  return job !== undefined;
}

/**
 * **範囲を足す。** 中の「立てる面」だけが点になる。
 *
 * > ### 広さの上限はない（2026-09-06 に外した）
 * >
 * > **1 tick で数えると、広い範囲でサーバーが止まる。**
 * > **`system.runJob` に任せて、少しずつ数える**——マップを置くのと同じやり方
 * > （`14-map-build.md` 2-1）。**呼ぶ側は広さを気にしなくてよい。**
 *
 * @param done 数え終わったときに呼ばれる（足した数・見た数）
 */
export function addBox(map: string, a: Vector3, b: Vector3, done: (added: number, cells: number) => void): boolean {
  if (job !== undefined) return false;
  job = system.runJob(scanJob(map, a, b, done));
  return true;
}

/** 1 列ずつ数えて、区切りごとに時間を返す */
function* scanJob(
  map: string,
  a: Vector3,
  b: Vector3,
  done: (added: number, cells: number) => void
): Generator<void, void, void> {
  // > ### 点は**マップの原点からの相対**で持つ（`19-map-store.md` 0-2）
  // >
  // > **マップは 1000 マスずつ離して常設してある。**
  // > **入ってくるのは世界の座標**なので、**引いてから詰める。**
  const ox = originXOf(map);
  const x1 = Math.max(-FIELD.half, Math.min(a.x, b.x) - ox);
  const x2 = Math.min(FIELD.half, Math.max(a.x, b.x) - ox);
  const y1 = Math.max(Y_LOW, Math.min(a.y, b.y));
  const y2 = Math.min(Y_HIGH, Math.max(a.y, b.y));
  const z1 = Math.max(-FIELD.half, Math.min(a.z, b.z));
  const z2 = Math.min(FIELD.half, Math.max(a.z, b.z));

  const have = marksOf(map);
  const seen = new Set(have.map((m) => `${m.x},${m.y},${m.z}`));
  let added = 0;
  let cells = 0;
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      for (let y = y1; y <= y2; y++) {
        cells++;
        const key = `${x},${y},${z}`;
        if (seen.has(key)) continue;
        if (!standable({ x: x + ox, y, z })) continue;
        have.push({ x, y, z });
        seen.add(key);
        added++;
      }
      // **1 本（縦の柱）ごとに時間を返す**
      yield;
    }
  }
  if (added > 0) setMarks(map, have);
  job = undefined;
  done(added, cells);
}

/**
 * **1 マスだけ足す／外す。**
 *
 * > ### 足せるのは「立てる面」だけ（2026-09-06）
 * >
 * > **空気は指定できない。** 頭上が塞がっている所も足せない——
 * > **範囲で選んだときと同じ物差し**にする（`standable`）。
 * >
 * > **外すのはいつでもできる。** 地形を直したあとの掃除に要る。
 *
 * @returns `"added"` 足した ／ `"removed"` 外した ／ `"refused"` 立てないので足さなかった
 */
export function toggle(map: string, at: Vector3): "added" | "removed" | "refused" {
  // **世界の座標 → そのマップの相対**
  const spot: Mark = { x: at.x - originXOf(map), y: at.y, z: at.z };
  const have = marksOf(map);
  const i = have.findIndex((m) => same(m, spot));
  if (i >= 0) {
    have.splice(i, 1);
    setMarks(map, have);
    return "removed";
  }
  if (!inField(spot.x, spot.z) || !standable(spot)) return "refused";
  have.push(spot);
  setMarks(map, have);
  return "added";
}

/**
 * **範囲の中の点を、全部外す**（`21-spawn-mark.md` 1-3・2026-09-07 追加）。
 *
 * > ### 地形を見ない
 * >
 * > 足すときは**ブロックを 1 マスずつ見る**（重いので `runJob`）。
 * > **消すときは、覚えている点のうち箱に入るものを落とすだけ**——**一瞬で終わる。**
 *
 * @returns 外した数と、残った数
 */
export function removeBox(map: string, a: Vector3, b: Vector3): { removed: number; left: number } {
  // **世界の座標 → そのマップの相対**（`19-map-store.md` 0-2）
  const ox = originXOf(map);
  const x1 = Math.min(a.x, b.x) - ox;
  const x2 = Math.max(a.x, b.x) - ox;
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  const z1 = Math.min(a.z, b.z);
  const z2 = Math.max(a.z, b.z);
  const have = marksOf(map);
  const keep = have.filter((m) => m.x < x1 || m.x > x2 || m.y < y1 || m.y > y2 || m.z < z1 || m.z > z2);
  const removed = have.length - keep.length;
  if (removed > 0) setMarks(map, keep);
  return { removed, left: keep.length };
}

/**
 * **いま立てない点を捨てる。**
 *
 * > ### 地形を直すと、登録済みの点が埋まる（2026-09-06）
 * >
 * > 点は**選んだ時の地形**で決まる。**後から屋根を足せば、その下の点は使えない。**
 * > **同じ物差し（`standable`）でもう一度当てて、通らないものを落とす。**
 *
 * @returns 捨てた数と、残った数
 */
export function pruneMarks(map: string): { dropped: number; left: number } {
  const have = marksOf(map);
  const ox = originXOf(map);
  const keep = have.filter((m) => inField(m.x, m.z) && standable({ x: m.x + ox, y: m.y, z: m.z }));
  const dropped = have.length - keep.length;
  if (dropped > 0) setMarks(map, keep);
  return { dropped, left: keep.length };
}

/** 粒を出す距離（マス）。**それより遠い点は見えない** */
const SHOW_RANGE = 48;

/** 近くの点に粒を出す。**見て確かめるため** */
export function showMarks(player: Player, map: string, limit = 200): number {
  let n = 0;
  try {
    const at = player.location;
    const ox = originXOf(map);
    // **見える所だけ**——遠くに粒を出しても見えない（`19-map-store.md` 0-1）
    const near = marksOf(map)
      .map((m) => ({ m, d: Math.hypot(m.x + ox - at.x, m.y - at.y, m.z - at.z) }))
      .filter((p) => p.d <= SHOW_RANGE)
      .sort((p, q) => p.d - q.d)
      .slice(0, limit);
    for (const { m } of near) {
      player.spawnParticle("minecraft:villager_happy", { x: m.x + ox + 0.5, y: m.y + 1.2, z: m.z + 0.5 });
      n++;
    }
  } catch {
    /* 読み込まれていない */
  }
  return n;
}
