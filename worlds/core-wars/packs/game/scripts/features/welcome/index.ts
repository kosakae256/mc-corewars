/**
 * 初めて来た人を迎える。
 *
 * 仕様は `docs/spec/24-role.md` 3-2-B。
 *
 * ## 何をするか
 *
 * | | |
 * | --- | --- |
 * | 本人 | **300P を配る**。ロールを選べる状態から始める |
 * | 全体 | **初参加だと知らせる**。迎える側が気づけるように |
 *
 * ## 遅らせて出す
 *
 * 入った直後は**まだ読み込まれていない。**
 * `features/lobby` が待機所へ移すのも遅らせているので、
 * **同じくらい待ってから**出す。
 *
 * 早く出すと、**移動の最中に流れて読めない。**
 */

import { system, world } from "@minecraft/server";

import { isNewcomer, markSeen } from "../../lib/first.js";
import { givePoints } from "../../lib/roles.js";

/** 初めて来た人に配る点（`docs/spec/24-role.md` 3-2-B） */
const WELCOME_POINTS = 300;

/** 出すまでの待ち（tick）。**待機所へ移したあと** */
const DELAY = 100;

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function registerWelcome(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const player = ev.player;

    // ---- **待ってから見る**（2026-08-28 修正）
    //
    // 入った直後は**まだ読み込みの途中。**
    // その場で見ると「印が無い」と読めてしまい、
    // **`/reload` のたびに初参加として配っていた。**
    //
    // > **落ち着いてから、見て、書いて、確かめる。**
    system.runTimeout(() => {
      if (!isNewcomer(player)) return;
      // **配る前に印を付ける。** 書けなければ配らない（次の機会に回す）
      if (!markSeen(player)) return;
      givePoints(player, WELCOME_POINTS);

      try {
        world.sendMessage(`§e${player.name} さんは初参加です`);
        player.sendMessage(`§b§lようこそ§r §7Core Wars へ`);
        player.sendMessage(`§a${WELCOME_POINTS}P§7 を配りました。§bロールの球§7 で好きなロールを選べます`);
        player.sendMessage("§7遊び方は §f/game:guide§7、参加は §f看板§7 から");
      } catch {
        /* もう居ない */
      }
    }, DELAY);
  });
}
