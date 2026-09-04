/**
 * その人のロール。
 *
 * 仕様は `worlds/pve-v3/docs/01-roles.md`。
 * **選んでいなければ既定のロール**（`core/roles.ts` の `DEFAULT_ROLE`）。
 */

import type { Player } from "@minecraft/server";

import { DEFAULT_ROLE, toRoleId, type RoleId } from "../core/roles.js";
import { KEYS } from "./keys.js";

/** いまのロール */
export function roleOf(player: Player): RoleId {
  try {
    return toRoleId(player.getDynamicProperty(KEYS.role)) ?? DEFAULT_ROLE;
  } catch {
    return DEFAULT_ROLE;
  }
}

/** ロールを置く */
export function setRole(player: Player, id: RoleId): void {
  try {
    player.setDynamicProperty(KEYS.role, id);
  } catch {
    /* 消えている */
  }
}
