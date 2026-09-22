/**
 * **運営にだけ伝える。** pve-v3 から写した。
 *
 * content log は既定で切れているので `console.warn` は誰にも見えない。**画面に出す。**
 * 同じ文は 1 度しか出さない——毎 tick 出ると読めない。
 */

import { CommandPermissionLevel, world } from "@minecraft/server";

import { pushChat } from "../state/chatlog.js";

const said = new Set<string>();

export function tellOps(text: string): void {
  if (said.has(text)) return;
  said.add(text);
  console.warn(`[quiz] ${text}`);
  for (const p of world.getAllPlayers()) {
    try {
      if (p.commandPermissionLevel !== CommandPermissionLevel.Any) p.sendMessage(`§8[運営] §f${text}`);
    } catch {
      /* 抜けた */
    }
  }
}

/** 全員に出す。出題の UI が見せるチャットの控えにも積む（17-modes 3 章） */
export function tellAll(text: string): void {
  pushChat(text);
  world.sendMessage(text);
}
