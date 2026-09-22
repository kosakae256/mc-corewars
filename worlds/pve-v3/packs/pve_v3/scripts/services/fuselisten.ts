/**
 * **導火線の合図を受ける**（クリーパー・帯電クリーパー）。
 *
 * 仕様は `docs/spec/25-enemy-kit.md` 2 章。
 *
 * > ### **`traits.ts` から切り出した**（2026-09-08）
 * >
 * > **1 ファイル 300 行という決まりがある。**
 */

import { world, type Entity } from "@minecraft/server";

/**
 * **火が点いた／消えた**（`minecraft:target_nearby_sensor` が鳴らす）。
 *
 * > ### **バニラの実体を土台にしたので、名前もバニラのまま**（2026-09-08）
 * >
 * > **`--base creeper` で作った実体は、`minecraft:start_exploding` を鳴らす**
 * > （`tools/pve3-newmob.mjs` の `fromVanilla`）。**そちらも拾う。**
 */
const FUSE = ["pve_v3:fuse", "minecraft:start_exploding", "minecraft:start_exploding_forced"];
const UNFUSE = ["pve_v3:unfuse", "minecraft:stop_exploding"];

/**
 * **導火線の合図を受ける。**
 *
 * > ### **待ちの長さはバニラが持つ**（`minecraft:explode` の `fuse_length`）
 * >
 * > **script は「いつ火が点いたか」だけ控える。**
 * > **爆ぜるのは `features/mob/index.ts`**——**同じ長さを数えて、こちらのダメージを出す。**
 */
export function subscribeFuse(lit: (mob: Entity, on: boolean) => void): void {
  world.afterEvents.dataDrivenEntityTrigger.subscribe(
    (ev) => {
      if (FUSE.includes(ev.eventId)) lit(ev.entity, true);
      else if (UNFUSE.includes(ev.eventId)) lit(ev.entity, false);
    },
    { eventTypes: [...FUSE, ...UNFUSE] }
  );
}
