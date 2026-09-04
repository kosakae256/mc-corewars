/**
 * モブの名札。**1 体ぶんの情報を、1 つの塊にする。**
 *
 * 仕様は `docs/spec/12-hud.md` 3 章。
 *
 * ```
 * グラント
 * §a|||||||§0|||||||   ← HP バー
 * §7HP §f120§7/200     ← HP の数値
 * ```
 *
 * **属性の蓄積率は出さない**（2026-08-29 決定）——
 * **名前と残りだけで足りる。** 出すと**塊が縦に伸びて、隣のモブと混ざる。**
 *
 * ## なぜ全部ここに積むのか
 *
 * **モブが重なると、誰の数字か分からない**（`docs/spec/12-hud.md` 1-1）。
 * **離して浮かべると、もっと分からない。**
 * **同じ名札に積めば、取り違えようがない。**
 *
 * ## 同じなら書き直さない
 *
 * **控えと比べる。** `entity.nameTag` を**読み返して比べない**——
 * 読み返した値が書いた値と同じ保証が無く、**毎回書き直し＝ちらつき**になる。
 */

import { world, type Entity } from "@minecraft/server";

import { bar, hpNumber } from "../../core/bar.js";
import { plateText } from "../../core/plate.js";
import { current, has, max } from "../../state/hp.js";
import { labelOf } from "../../state/label.js";

/** 出す距離（マス）。**遠くの分まで組み立てない** */
const RANGE = 64;

/** 最後に書いた中身。**メモリだけ。** `/reload` で消えてよい */
const written = new Map<string, string>();

/** 名札の中身 */
function plate(entity: Entity): string | undefined {
  const now = current(entity);
  const cap = max(entity);
  if (now === undefined || cap === undefined) return undefined;
  return plateText({
    name: `§f${labelOf(entity) ?? "？"}`,
    bar: bar(now, cap),
    hp: `§7HP ${hpNumber(now, cap)}`,
  });
}

/**
 * 近くのモブぜんぶ。
 *
 * **一覧を持たない。** HP を持っている実体が、そのまま対象になる。
 * モブが増えても、ここは変わらない。
 */
function nearby(): Entity[] {
  const seen = new Set<string>();
  const out: Entity[] = [];
  for (const p of world.getAllPlayers()) {
    try {
      for (const e of p.dimension.getEntities({ location: p.location, maxDistance: RANGE })) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (e.id === p.id) continue;
        if (e.typeId === "minecraft:player") continue;
        if (!has(e)) continue;
        out.push(e);
      }
    } catch {
      /* 消えている */
    }
  }
  return out;
}

/** 名札を合わせる。**変わったものだけ書き直す** */
export function updateNameplates(): void {
  const seen = new Set<string>();
  for (const e of nearby()) {
    try {
      const text = plate(e);
      if (text === undefined) continue;
      seen.add(e.id);
      if (written.get(e.id) === text) continue;
      e.nameTag = text;
      written.set(e.id, text);
    } catch {
      /* 消えている */
    }
  }
  // ---- 居なくなった分の控えを捨てる。**残すと際限なく増える**
  if (written.size <= seen.size) return;
  for (const id of written.keys()) {
    if (!seen.has(id)) written.delete(id);
  }
}
