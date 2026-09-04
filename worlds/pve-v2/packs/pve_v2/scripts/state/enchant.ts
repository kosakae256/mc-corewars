/**
 * 持っているエンチャント。**プレイヤーが持つ。**
 *
 * 仕様は `docs/spec/20-enchant.md`。
 *
 * ## v1 と持ち主が違う
 *
 * | | v1 | v2 |
 * | --- | --- | --- |
 * | 付く先 | **武器 1 本** | **プレイヤー** |
 * | なぜ | 武器が 48 本あった | **武器は 1 本きり。** 落とすことも拾うことも無い |
 *
 * **周回で積み上がるのは「その人のビルド」**（`docs/00-concept.md` 3 章）。
 *
 * ## 持ち方
 *
 * ```
 * power:5,crit:3,tailwind:2      ← 動的プロパティ 1 つに詰める
 * ```
 *
 * **1 鍵にまとめる**——エンチャントが増えても**鍵は増えない。**
 */

import type { Player } from "@minecraft/server";

import { clampLv, find, type EnchantDef } from "../lib/enchants.js";
import { KEYS } from "./keys.js";

/** 持っている 1 つ */
export interface Held {
  readonly def: EnchantDef;
  readonly lv: number;
}

function raw(player: Player): string {
  try {
    const v = player.getDynamicProperty(KEYS.ench);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

function write(player: Player, map: Map<string, number>): void {
  const text = [...map.entries()]
    .filter(([, lv]) => lv > 0)
    .map(([id, lv]) => `${id}:${lv}`)
    .join(",");
  try {
    player.setDynamicProperty(KEYS.ench, text);
  } catch {
    /* 消えている */
  }
}

function parse(player: Player): Map<string, number> {
  const map = new Map<string, number>();
  for (const part of raw(player).split(",")) {
    const [id, lv] = part.split(":");
    if (id === undefined || lv === undefined) continue;
    const def = find(id);
    if (def === undefined) continue; // **消したエンチャントは黙って捨てる**
    const n = clampLv(def, Number(lv));
    if (n > 0) map.set(def.id, n);
  }
  return map;
}

/** 持っているものを全部 */
export function held(player: Player): Held[] {
  const out: Held[] = [];
  for (const [id, lv] of parse(player)) {
    const def = find(id);
    if (def !== undefined) out.push({ def, lv });
  }
  return out;
}

/**
 * その 1 つの段。**持っていなければ 0。**
 *
 * **式を書くところは、これだけを見る**——`lv(player, "power") * 0.2` のように。
 */
export function lv(player: Player, id: string): number {
  return parse(player).get(id) ?? 0;
}

/** 段を置く。**0 で外す** */
export function setLv(player: Player, def: EnchantDef, value: number): number {
  const map = parse(player);
  const next = clampLv(def, value);
  if (next === 0) map.delete(def.id);
  else map.set(def.id, next);
  write(player, map);
  return next;
}

/** 全部外す */
export function clear(player: Player): void {
  try {
    player.setDynamicProperty(KEYS.ench, "");
  } catch {
    /* 消えている */
  }
}
