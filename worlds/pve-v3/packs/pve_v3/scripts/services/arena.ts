/**
 * **いまの戦場がどこにあるか。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 0 章。
 *
 * ```
 * x ＝ 0      作業台（作る・直す・焼く）
 * x ＝ 1000   1 枚目
 * x ＝ 2000   2 枚目 …
 * ```
 *
 * > ### 座標を直に書かない
 * >
 * > **`core/places.ts` の値は「マップの原点からの相対」。**
 * > **絶対の座標が要る所は、必ずここを通す。**
 *
 * **どのマップに居るかは `state/match.ts` が覚えている**（`fieldMap`）。
 */

import type { Vector3 } from "@minecraft/server";

import { FIELD, GATE, type GateBox, type Place } from "../core/places.js";
import { fieldMap } from "../state/match.js";
import { originXOf } from "./mapstore.js";

/** いまの戦場の原点の x。**マップが決まっていなければ作業台（0）** */
export function originX(): number {
  const name = fieldMap();
  return name === undefined || name === "" ? 0 : originXOf(name);
}

/** そのマップの原点の x */
export function originOf(name: string): number {
  return originXOf(name);
}

/** 湧く所（手前）。**着いた瞬間 ＋z を向く** */
export function spawnSpot(): Place {
  return { x: originX(), y: FIELD.groundY + 1, z: FIELD.spawnZ };
}

/** ゲートの箱。**触れたら次へ**（`13-flow.md` 2-1） */
export function gateBox(): GateBox {
  const ox = originX();
  return { x1: GATE.x1 + ox, x2: GATE.x2 + ox, y1: GATE.y1, y2: GATE.y2, z: GATE.z };
}

/** 戦場の箱（**一掃と数え上げに使う**） */
export function fieldBox(): { readonly from: Vector3; readonly to: Vector3 } {
  const ox = originX();
  return {
    from: { x: ox - FIELD.half, y: FIELD.bottomY, z: -FIELD.half },
    to: { x: ox + FIELD.half, y: 40, z: FIELD.half },
  };
}

/** そのマップの座標へ直す。**湧き点は相対で持っている**（`21-spawn-mark.md`） */
export function toWorld(at: Vector3): Vector3 {
  return { x: at.x + originX(), y: at.y, z: at.z };
}
