/**
 * **溜めてから薙ぎ払う敵の時計**（回転）。
 *
 * 仕様は `docs/spec/24-mob-howto.md` 16-2-1。
 *
 * ```
 * 間合いに入った ── 溜める ── 振る ── 休む ── はじめへ
 *                     │        │
 *                     │        └ ここで当たりを決める（services/swung.ts）
 *                     └ **途中で相手が離れても、やめない**
 * ```
 *
 * > ### **見た目の合図は `minecraft:mark_variant`**（2026-09-09）
 * >
 * > **`q.property()` で切り替えようとしたが、見た目が一度も変わらなかった。**
 * > **`query.mark_variant` は昔からある、確実に client まで届く値**——
 * > **部品群を差し替えて数字を変える**（`entities/spinner.json` の `pve_v3:pose_*`）。
 */

import type { Entity, Player } from "@minecraft/server";

import type { EnemyDef } from "../core/enemy.js";
import { doSweep } from "./swung.js";
import { nearest, swingOf } from "./traits.js";

/** 振りの長さ（tick）。**`services/swing.ts` の 10 tick と同じ** */
const SLASH = 10;

/** いちばん短い溜め（tick）。**これより短いと、溜めに見えない** */
const LEAST = 6;

/** いま何をしているか */
type Phase = "charge" | "slash" | "rest";

interface Act {
  readonly phase: Phase;
  /** この時刻になったら次へ */
  readonly until: number;
  /** その個体の攻撃間隔（tick）。**呪いで縮んだ後の値** */
  readonly gap: number;
}

/** 進行中のもの。**メモリだけ** */
const acts = new Map<string, Act>();

/** 見た目の合図を送る。**部品群の差し替え** */
function pose(mob: Entity, name: Phase | "none"): void {
  try {
    mob.triggerEvent(`pve_v3:pose_${name === "rest" ? "none" : name}`);
  } catch {
    /* その口を持たない実体 */
  }
}

/**
 * 1 体ぶん進める。**`sweep` を持ち、遠くから撒くのではない敵だけ。**
 *
 * @param now いまの tick
 */
export function doWindup(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  const w = def.sweep;
  if (w === undefined || w.atRange === true) return;
  const act = acts.get(mob.id);
  if (act === undefined) {
    // **間合いは `reach`**——**当たる範囲**（`sweep.radius`）**とは別**
    if (nearest(mob, people, def.reach) === undefined) return;
    const gap = swingOf(mob, def);
    // **溜めは攻撃間隔の半分。** **呪いで攻撃速度が上がれば、溜めも縮む**
    const full = Math.max(LEAST, Math.round(gap / 2));
    acts.set(mob.id, { phase: "charge", until: now + full, gap });
    pose(mob, "charge");
    return;
  }
  if (now < act.until) return;
  next(mob, act, now);
}

/**
 * 次の段へ。
 *
 * > ### **溜め切ったら、必ず振る**（2026-09-09）
 * >
 * > **相手が離れたからといって、溜めを取り消さない。**
 * > **溜めたのに何も起きないと、見ている側は「壊れている」と思う。**
 * > **当たるかどうかは、振った後に `services/sweep.ts` が決める。**
 */
function next(mob: Entity, act: Act, now: number): void {
  if (act.phase === "charge") {
    acts.set(mob.id, { phase: "slash", until: now + SLASH, gap: act.gap });
    pose(mob, "slash");
    doSweep(mob);
    return;
  }
  if (act.phase === "slash") {
    // **残りは休み。** **溜め ＋ 振り ＋ 休み ＝ 攻撃間隔**
    const left = Math.max(0, act.gap - Math.round(act.gap / 2) - SLASH);
    acts.set(mob.id, { phase: "rest", until: now + left, gap: act.gap });
    pose(mob, "none");
    return;
  }
  acts.delete(mob.id);
}
