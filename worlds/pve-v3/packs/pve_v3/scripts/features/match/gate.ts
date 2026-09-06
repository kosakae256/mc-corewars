/**
 * **ゲートに触れたか**（`worlds/pve-v3/docs/spec/13-flow.md` 2-1・3 章）。
 *
 * > ### 「付近」ではなく「触れた」で見る（2026-09-06 変更）
 * >
 * > **半径 4 マスで見ていたので、近づいただけで飛んでいた。**
 * > **ゲートの座標は決まっている**ので、**体が重なったとき**だけにする。
 *
 * | | 誰が触れたら |
 * | --- | --- |
 * | **戦場** | **誰か 1 人。** 敵を全部倒した後の話 |
 * | **休憩所** | **全員。** 1 人で出発できると、置いて行かれる人が出る |
 */

import type { Player } from "@minecraft/server";

import { REST_GATE, touchesGate, type GateBox } from "../../core/places.js";
import { gateBox } from "../../services/arena.js";
import { alive, members } from "../../services/presence.js";

/** **誰かがその箱に触れているか** */
function someoneAt(box: GateBox, who: readonly Player[]): boolean {
  for (const p of who) {
    try {
      if (touchesGate(p.location, box)) return true;
    } catch {
      /* 抜けた */
    }
  }
  return false;
}

/**
 * **敵を全部倒したうえで、誰かが戦場のゲートに着いたか**（`13-flow.md` 2-1）。
 *
 * > ### 倒しただけでは終わらない
 * >
 * > 前は敵が 0 になった瞬間に飛ばしていた。**急に飛ぶ。**
 * > **自分で歩いて行った先で切り替わる**ほうが、区切りが分かる。
 */
export function someoneAtPortal(): boolean {
  return someoneAt(gateBox(), alive());
}

/** 休憩所のゲートに触れた人。**その休憩の間だけ覚える** */
const touched = new Set<string>();

/** 触れた覚えを捨てる。**休憩所に入るたび** */
export function resetTouched(): void {
  touched.clear();
}

/**
 * **全員がゲートに触れたか**（`13-flow.md` 3 章）。
 *
 * **同時に触れる必要はない**——**触れた人を覚えていって、全員が揃ったら出発。**
 */
export function everyoneTouchedRestGate(): boolean {
  const who = members();
  if (who.length === 0) return false;
  for (const p of who) {
    try {
      if (touchesGate(p.location, REST_GATE)) touched.add(p.id);
    } catch {
      /* 抜けた */
    }
  }
  return who.every((p) => touched.has(p.id));
}
