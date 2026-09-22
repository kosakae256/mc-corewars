/**
 * **振った合図を受けて、薙ぎ払う**（回転・妖狐・散弾）。
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 7 章。
 *
 * > ### **`traits.ts` から切り出した**（2026-09-08）
 * >
 * > **1 ファイル 300 行という決まりがある。**
 */

import { system, world, type Entity } from "@minecraft/server";

import { defOf } from "./enemydef.js";
import { powerOf } from "./melee.js";
import { startSwing } from "./swing.js";
import { sweep } from "./sweep.js";
import { nearest, told, toward } from "./traits.js";

/** **振った合図**（`minecraft:behavior.delayed_attack` の `on_attack`） */
const SWUNG = "pve_v3:swung";

/**
 * 回転・妖狐・散弾。**その場で当たりを決める。**
 *
 * > ### **時計ではなく、ビヘイビアの合図で振る**（2026-09-08 に直した）
 * >
 * > **script が自分で数えていたとき、振りの見た目と当たりが揃わなかった。**
 * > **`minecraft:behavior.delayed_attack` は `on_attack` で
 * > 「いま当たった」を教えてくれる**（`docs/research/05-entity-behaviors.md`）。
 * >
 * > **`hit_delay_pct: 0.5`**——**振りの真ん中で鳴る。** **見た目と必ず揃う。**
 */
/**
 * **同じ敵が続けて振らないようにする間隔**（tick）。
 *
 * **`services/windup.ts` の時計と、ビヘイビアの `on_attack` の両方から呼ばれる。**
 * **`on_attack` が鳴らないので今は片方だけだが、鳴るようになっても二度振らない。**
 */
const AGAIN = 10;

/** 最後に振った時刻。**id ごと** */
const last = new Map<string, number>();

export function doSweep(mob: Entity): void {
  const def = defOf(mob);
  const w = def?.sweep;
  if (def === undefined || w === undefined) return;
  const now = system.currentTick;
  const before = last.get(mob.id);
  if (before !== undefined && now - before < AGAIN) return;
  last.set(mob.id, now);
  const people = world.getAllPlayers();
  const target = nearest(mob, people, w.radius);
  told("薙ぎ払い", mob);
  startSwing(mob);
  sweep(
    {
      dim: mob.dimension,
      at: mob.location,
      // **狙う人が居なくても振る**（全周の敵は向きが要らない）
      dir: target === undefined ? undefined : toward(mob, target),
      power: powerOf(mob) || def.attack,
      radius: w.radius,
      angle: w.angle,
      hits: w.hits,
      knock: def.knockback,
    },
    mob
  );
}

/**
 * **ビヘイビアからの合図を受ける。**
 *
 * > ### **`on_attack` は実体イベントを鳴らす**
 * >
 * > **`dataDrivenEntityTrigger` で script まで届く**（`@minecraft/server` 2.9.0）。
 * > **これがビヘイビアと script をつなぐ、唯一のまともな口。**
 */
export function subscribeSwung(): void {
  world.afterEvents.dataDrivenEntityTrigger.subscribe(
    (ev) => {
      if (ev.eventId !== SWUNG) return;
      doSweep(ev.entity);
    },
    { eventTypes: [SWUNG] }
  );
}
