/**
 * 開発用の道具。**遊ぶ人には配らない。**
 *
 * ```
 * /give @s pve_v3:border_wand
 * ```
 *
 * | 道具 | 何をするか |
 * | --- | --- |
 * | **境界の棒** | **右クリックした場所の真下（y ＝ −64）に `border_block` を置く** |
 *
 * ## なぜ y ＝ −64 なのか
 *
 * **`border_block` は、置いた所から上下いっぱいに壁を張る。**
 * **世界の底に 1 つ置けば、その柱は上まで通れなくなる**——
 * だから**平面図を描く感覚で、地面を叩いて回れる。**
 *
 * > ### 状態を見ない
 * >
 * > **これは開発用**（`docs/spec/17-state.md` 4 章の例外）。
 * > 試合中だろうが非開始だろうが、**棒を持っている人だけに効く。**
 */

import { world, type Player, type Vector3 } from "@minecraft/server";

import type { Feature } from "../../types.js";

/** 境界の棒 */
export const BORDER_WAND = "pve_v3:border_wand";

/** 置くブロック */
const BORDER = "minecraft:border_block";

/** 世界の底 */
const BOTTOM = -64;

function place(player: Player, at: Vector3): void {
  const spot = { x: Math.floor(at.x), y: BOTTOM, z: Math.floor(at.z) };
  try {
    player.dimension.setBlockType(spot, BORDER);
    player.onScreenDisplay.setActionBar(`§7境界 §f${spot.x}, ${spot.z}`);
    player.playSound("random.orb", { volume: 0.3, pitch: 1.6 });
  } catch (err) {
    // **黙って諦めない。**読み込まれていないのか、名前が違うのかが分からなくなる
    player.sendMessage(`§c置けなかった §8${String(err)}`);
  }
}

function subscribe(): void {
  // ---- ブロックを右クリック
  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.itemStack?.typeId !== BORDER_WAND) return;
    // **両手ぶん飛んでくる**ので、1 回目だけ拾う
    if (!ev.isFirstEvent) return;
    place(ev.player, ev.block.location);
  });

  // ---- 何も無い所を右クリック。**視線の先を見る**
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== BORDER_WAND) return;
    const hit = ev.source.getBlockFromViewDirection({ maxDistance: 64 });
    if (hit === undefined) return;
    place(ev.source, hit.block.location);
  });
}

export const devTools: Feature = {
  name: "devtools",
  subscribe,
};
