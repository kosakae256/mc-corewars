/**
 * 幕間の合図。**音とチャットだけ**（演出はあとで作る）。
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 2 章。
 *
 * **暗転そのものは `services/dark.ts`。** ここには持たない
 * （前は密室カメラをここに置いていたが、**中の岩盤が見えたのでやめた**）。
 */

import { world } from "@minecraft/server";

/**
 * **敵を全部倒した合図**（仮）。
 *
 * > ### いまは音とチャットだけ
 * >
 * > **演出はあとで作る。** デバッグで「殲滅した」が分かればよい。
 */
export function clearedCue(): void {
  try {
    for (const p of world.getAllPlayers()) {
      p.playSound("random.levelup", { volume: 0.8, pitch: 1.0 });
      p.onScreenDisplay.setActionBar("§a殲滅 §7— 奥のポータルへ");
    }
    world.sendMessage("§a敵を全部倒した §7— §f奥のポータルに着いた人が居れば、全員が次へ進む");
  } catch {
    /* 抜けた */
  }
}

/** 次へ進む合図（仮） */
export function departCue(): void {
  try {
    for (const p of world.getAllPlayers()) p.playSound("mob.endermen.portal", { volume: 0.7, pitch: 1.1 });
  } catch {
    /* 抜けた */
  }
}

/** 音で切り替わりを伝える */
export function cue(): void {
  try {
    for (const p of world.getAllPlayers()) {
      p.playSound("beacon.activate", { volume: 0.6, pitch: 1.2 });
    }
  } catch {
    /* 抜けた */
  }
}
