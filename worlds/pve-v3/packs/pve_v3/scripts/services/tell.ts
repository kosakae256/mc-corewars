/**
 * **運営にだけ伝える。**
 *
 * > ### **黙って失敗するのがいちばん困る**（2026-09-08）
 * >
 * > **弓が出ない・矢が飛ばない**とき、**どこで止まっているか分からなかった。**
 * > **content log は既定で切れている**ので、**画面に出す。**
 *
 * **同じ文は 1 度しか出さない**——毎 tick 出ると読めない。
 */

import { CommandPermissionLevel, world } from "@minecraft/server";

const said = new Set<string>();

/** 運営にだけ、1 度だけ伝える */
export function tellOps(text: string): void {
  if (said.has(text)) return;
  said.add(text);
  console.warn(`[pve3] ${text}`);
  for (const p of world.getAllPlayers()) {
    try {
      if (p.commandPermissionLevel !== CommandPermissionLevel.Any) p.sendMessage(`§8[運営] §f${text}`);
    } catch {
      /* 抜けた */
    }
  }
}
