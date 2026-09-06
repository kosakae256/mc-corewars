/**
 * 湧き点の杖。**その場に立って、出てよい所を選ぶ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/21-spawn-mark.md`。
 *
 * ```
 * ブロックを殴る      範囲の 1 点目（壊さない）
 * ブロックに使う      範囲の 2 点目 → その範囲を足す
 * しゃがんで使う      その 1 マスだけを足す／外す
 * 何も無い所で使う    メニュー
 * ```
 *
 * > ### 範囲は持たない
 * >
 * > **選んだ瞬間に「立てる面」だけを点へ畳む**（`services/spawnmark.ts`）。
 */

import { Player, system, world, type Vector3 } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { addBox, clearMarks, count, showMarks, toggle } from "../../services/spawnmark.js";
import { editing, setEditing } from "../../state/spawnmark.js";
import { currentMap } from "../../services/stage.js";
import { originXOf } from "../../services/mapstore.js";
import { FIELD } from "../../core/places.js";
import { isAdmin } from "../../services/presence.js";
import { commands } from "./command.js";
import { openWand } from "./ui.js";

/** 杖 */
export const WAND = "pve_v3:spawnwand";

/** 1 点目。**人ごとに覚える** */
const first = new Map<string, Vector3>();

/**
 * どのマップの点を編集しているか。
 *
 * > ### 決まっていなければ、**いま戦場に置いてあるマップ**を使う（2026-09-06）
 * >
 * > **黙って何もしない**のが、いちばん分かりにくかった。
 * > **知らせはチャットへ**——アクションバーは HP 表示に上書きされる。
 */
function target(player: Player): string | undefined {
  const map = editing();
  if (map !== undefined) {
    // > ### **そのマップの上に立っているか**（2026-09-07・`19-map-store.md` 0-1）
    // >
    // > **点はマップの原点からの相対で持つ。**
    // > **別のマップの上で打っても、範囲の外として弾かれるだけ**——
    // > **黙って弾かれると、理由が分からない。**
    const ox = originXOf(map);
    if (Math.abs(player.location.x - ox) > FIELD.half + 20) {
      player.sendMessage(`§c${map} はここではない §8x ${ox} 付近へ行くこと（/pve:marks で選び直す）`);
      return undefined;
    }
    return map;
  }
  const now = currentMap();
  if (now !== undefined) {
    setEditing(now);
    player.sendMessage(`§7いま戦場にある §f${now}§7 の点を触る §8（変えるなら /pve:marks <名前>）`);
    return now;
  }
  player.sendMessage("§cどのマップの点か決まっていない §8/pve:marks <名前> で選ぶ");
  return undefined;
}

/**
 * 範囲を足す。
 *
 * **広さの上限は無い**（`services/spawnmark.ts`）——
 * **`system.runJob` が少しずつ数える**ので、終わるまで待つ。
 */
function commit(player: Player, map: string, a: Vector3, b: Vector3): void {
  const started = addBox(map, a, b, (added, cells) => {
    player.playSound("random.orb", { volume: 0.4, pitch: 1.5 });
    player.sendMessage(
      `§7${map} に §f${added}§7 点を足した §8（${cells.toLocaleString()} マスを見た／いま ${count(map)} 点）`
    );
  });
  if (!started) {
    player.sendMessage("§7いま別の範囲を数えている §8終わるまで待つ");
    return;
  }
  player.sendMessage("§8数えている…");
}

/** 視線の先のブロック。**手が届く範囲だけ** */
function looking(player: Player): Vector3 | undefined {
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: 8 });
    return hit === undefined ? undefined : hit.block.location;
  } catch {
    return undefined;
  }
}

/** 1 マスだけ足す／外す */
function single(player: Player, map: string, at: Vector3): void {
  const r = toggle(map, at);
  if (r === "refused") {
    // **空気や、頭上の塞がった所は足さない**（`21-spawn-mark.md` 1-1）
    player.playSound("note.bass", { volume: 0.4, pitch: 0.7 });
    player.sendMessage("§cそこには立てない §8実体のあるブロックで、頭上が 2 マス空いていること");
    return;
  }
  const on = r === "added";
  player.playSound(on ? "random.orb" : "random.click", { volume: 0.4, pitch: on ? 1.6 : 0.8 });
  player.sendMessage(`${on ? "§a足した" : "§c外した"} §f${at.x}, ${at.y}, ${at.z} §8（いま ${count(map)} 点）`);
}

function subscribe(): void {
  // ---- 殴る＝1 点目。**壊させない**
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (ev.itemStack?.typeId !== WAND) return;
    // **運営だけが使える**（`21-spawn-mark.md` 1 章）。**壊させはしない**
    ev.cancel = true;
    if (!isAdmin(ev.player)) return;
    const at = { x: ev.block.location.x, y: ev.block.location.y, z: ev.block.location.z };
    const who = ev.player;
    system.run(() => {
      first.set(who.id, at);
      who.sendMessage(`§71 点目 §f${at.x}, ${at.y}, ${at.z} §8（次にブロックを右クリック）`);
      who.playSound("random.click", { volume: 0.4, pitch: 1.2 });
    });
  });

  // ---- 右クリック。**これ 1 本で全部やる**
  //
  // > ### `playerInteractWithBlock` は当てにならない（2026-09-06）
  // >
  // > **素のブロックを普通のアイテムで右クリックしても飛んでこない。**
  // > **`itemUse` は必ず飛んでくる**ので、**視線の先を自分で見る。**
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== WAND) return;
    const player = ev.source;
    if (!isAdmin(player)) {
      player.sendMessage("§cこの杖は運営だけが使える");
      return;
    }
    system.run(() => {
      const at = looking(player);
      // **何も見ていない ＝ メニュー**
      if (at === undefined) {
        void openWand(player);
        return;
      }
      const map = target(player);
      if (map === undefined) return;
      if (player.isSneaking) {
        single(player, map, at);
        return;
      }
      const a = first.get(player.id);
      if (a === undefined) {
        player.sendMessage("§7先に 1 点目を殴る §8（しゃがんで右クリックすると 1 マスだけ）");
        return;
      }
      first.delete(player.id);
      commit(player, map, a, at);
    });
  });
}

export { clearMarks, showMarks, setEditing };

export const spawnMark: Feature = {
  name: "spawnmark",
  commands,
  subscribe,
};
