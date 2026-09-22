/**
 * **跳ぶ**（テレポート・★4）。
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 13 章。
 *
 * > ### **`traits.ts` から切り出した**（2026-09-08）
 * >
 * > **1 ファイル 300 行という決まりがある。**
 */

import { type Entity, type Player } from "@minecraft/server";
import { hittable } from "./mobaim.js";

import type { EnemyDef } from "../core/enemy.js";
import { BLINK } from "../core/tuning.js";
import { has } from "../state/hp.js";
import { ready } from "./traits.js";

/** 跳んだ音。**エンダーマンと同じ** */
const BLINK_SOUND = "mob.endermen.portal";

/**
 * テレポート。**戦っている人の所へ跳ぶ。**
 *
 * > ### **跳んだことを、両側で鳴らす**（2026-09-08 決定）
 * >
 * > **消えた所と、出た所の両方でエンダーマンの音。**
 * > **音が無いと、突然目の前に現れたようにしか見えない。**
 */
export function doBlink(mob: Entity, def: EnemyDef, people: readonly Player[], now: number): void {
  if (!ready(mob, def.blink ?? BLINK.gap, now)) return;
  // **見ているだけの人には跳ばない**（`07-enemy-plan.md` テレポート）
  const alive = people.filter((p) => has(p) && hittable(p));
  const pick = alive[Math.floor(Math.random() * alive.length)];
  if (pick === undefined) return;
  const from = mob.location;
  const q = pick.location;
  // **相手の少し後ろへ。** 真上や体の中に出すと、押し出されて弾かれる
  const to = { x: q.x, y: q.y, z: q.z + BLINK.back };
  try {
    // **`checkForBlocks: false`**——**塞がっていても跳ぶ。** 見ないと、ほぼ跳べない
    mob.teleport(to, { dimension: pick.dimension, checkForBlocks: false });
  } catch {
    return;
  }
  for (const spot of [from, to]) {
    try {
      mob.dimension.playSound(BLINK_SOUND, spot, { volume: 1.0 });
      mob.dimension.spawnParticle("minecraft:enderman_teleport_particle", spot);
    } catch {
      /* 読み込まれていない */
    }
  }
}
