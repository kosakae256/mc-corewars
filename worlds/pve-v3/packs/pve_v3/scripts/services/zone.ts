/**
 * **地面に残る円。** **入っている間、じわじわ削る。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 4 章。
 *
 * ```
 * 敵が倒れる
 *   └ その場に円ができる（半径 3・5 秒）
 *        └ 2 tick ごと、中の人へ 最大 HP の 1 %
 * ```
 *
 * ## なぜ実体を置かないのか
 *
 * > ### **実体を置くと、当たり判定も AI も付いてくる**
 * >
 * > **円は「場所と時間」だけ。** **表に持てば、それだけで足りる。**
 * > **`/reload` で消えてよい**——消えても、次の敵が作り直す。
 */

import { world, type Dimension, type Vector3 } from "@minecraft/server";
import { hittable } from "./mobaim.js";

import { ZONE } from "../core/tuning.js";
import { hit } from "./combat.js";
import { has, max as maxHp } from "../state/hp.js";
import { groundCircle } from "./fx.js";

/** 1 つぶん */
interface Zone {
  readonly dim: Dimension;
  readonly at: Vector3;
  readonly radius: number;
  /** 1 回で削る割合（最大 HP の %） */
  readonly cut: number;
  readonly gap: number;
  readonly particle: string;
  /** 置いた時刻（tick）。**円の長さを測るのに要る** */
  readonly from: number;
  /** 消える時刻（tick） */
  readonly until: number;
}

/** いま出ている円。**メモリだけ** */
const zones: Zone[] = [];

/** 1 つ置く。**書かなかった値は既定**（`core/tuning.ts`） */
export function putZone(o: {
  readonly dim: Dimension;
  readonly at: Vector3;
  readonly now: number;
  readonly radius?: number;
  readonly life?: number;
  readonly cut?: number;
  readonly gap?: number;
  readonly particle?: string;
}): void {
  const z: Zone = {
    dim: o.dim,
    at: o.at,
    radius: o.radius ?? ZONE.radius,
    cut: o.cut ?? ZONE.cut,
    gap: o.gap ?? ZONE.gap,
    particle: o.particle ?? ZONE.particle,
    from: o.now,
    until: o.now + (o.life ?? ZONE.life),
  };
  zones.push(z);
  // **円は置いた瞬間に 1 枚だけ**——**敷き直すとちらつく**
  draw(z);
}

/** いま出ている円の数。**確かめる用** */
export function zoneCount(): number {
  return zones.length;
}

/**
 * 円を描く。**毎 tick 置くと重い**ので、間隔を空ける。
 *
 * > ### **劇薬の毒だまりと同じ絵にする**（2026-09-10）
 * >
 * > **粒を円周に 12 個置いていた**——**点が並んでいるようにしか見えなかった。**
 * > **中まで塗りつぶした円を、地面に 1 枚敷く**（`services/fx.ts` の `groundCircle`）。
 */
function draw(z: Zone): void {
  // **置いたときに 1 枚だけ。** **粒の側が最後まで残る**（`v.life`）
  groundCircle(z.dim, z.at, z.radius, z.particle, (z.until - z.from) / 20);
}

/** 霧を出す間隔（tick）。**円の中から、毒がゆっくり立ちのぼる** */
const MIST_GAP = 8;

/** 毎 tick。**古いものを捨て、中に居る人を削る** */
export function stepZones(now: number): void {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i];
    if (z === undefined) continue;
    if (now >= z.until) {
      zones.splice(i, 1);
      continue;
    }

    // **円の中から毒が立ちのぼる**（2026-09-10）。**円より先に、霧だけ止まる**
    if (now % MIST_GAP === 0 && now - z.from < ZONE.mistFor) groundCircle(z.dim, z.at, z.radius, ZONE.mist);
    if (now % z.gap !== 0) continue;
    for (const p of world.getAllPlayers()) {
      if (!has(p) || !hittable(p)) continue;
      const d = Math.hypot(p.location.x - z.at.x, p.location.y - z.at.y, p.location.z - z.at.z);
      if (d > z.radius) continue;
      const cap = maxHp(p) ?? 0;
      if (cap <= 0) continue;
      // **割合で削る。** **育てても軽くならない**
      hit({ target: p, attack: Math.max(1, Math.round((cap * z.cut) / 100)), kind: "extra" });
    }
  }
}
