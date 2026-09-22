/**
 * プレイヤーの区別（運営かどうか）。admin（コンパス）と border（落ちたら戻す）が使う。
 */

import { CommandPermissionLevel, type Player } from "@minecraft/server";

/** 運営（オペレーター）か。抜けた人などで読めなければ false */
export function isOp(player: Player): boolean {
  try {
    return player.commandPermissionLevel >= CommandPermissionLevel.Admin;
  } catch {
    return false;
  }
}
