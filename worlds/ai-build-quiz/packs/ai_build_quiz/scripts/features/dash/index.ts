/**
 * 羽のダッシュ。`docs/spec/16-world-rules.md` 4 章。
 *
 * - 羽（feather）を**常に 1 本**持たせる（参加時・再スポーン時・5 秒ごとに無ければ渡す）。落とせない・死んでも残る
 * - 羽で右クリック（itemUse）→ 見ている方向へ一瞬強く加速（applyKnockback）。0.5 秒は連打を受けない
 */

import { ItemLockMode, ItemStack, system, world, type Player } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { tellOps } from "../../services/tell.js";

const FEATHER = "minecraft:feather";
const NAME = "§bダッシュ §7(右クリック)";
const HORIZONTAL = 12.5; // 2.5 → 「今の 5 倍」（本人・2026-09-21。16-world-rules 4 章）
const VERTICAL = 12.5;
const COOLDOWN_TICKS = 10;
const SOUND = "item.trident.riptide_1";

const lastDash = new Map<string, number>();
let warned = false;

function hasFeather(player: Player): boolean {
  const inv = player.getComponent("inventory");
  const c = inv?.container;
  if (!c) return true; // 見られないなら触らない
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === FEATHER) return true;
  return false;
}

function giveFeather(player: Player): void {
  const c = player.getComponent("inventory")?.container;
  if (!c || hasFeather(player)) return;
  const item = new ItemStack(FEATHER, 1);
  item.nameTag = NAME;
  item.lockMode = ItemLockMode.inventory; // 捨てる・移す・置くができない
  item.keepOnDeath = true;
  item.setLore(["§7見ている方向へ一瞬ダッシュ"]);
  c.addItem(item);
}

function doDash(player: Player): void {
  const now = system.currentTick;
  if (now - (lastDash.get(player.id) ?? -COOLDOWN_TICKS) < COOLDOWN_TICKS) return;
  lastDash.set(player.id, now);
  const d = player.getViewDirection();
  try {
    player.applyKnockback({ x: d.x * HORIZONTAL, z: d.z * HORIZONTAL }, d.y * VERTICAL);
    player.playSound(SOUND, { volume: 0.6, pitch: 1.2 });
  } catch (err) {
    if (!warned) {
      warned = true;
      tellOps(`ダッシュできない: ${String(err)}`);
    }
  }
}

function subscribe(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => system.run(() => giveFeather(ev.player)));
  world.afterEvents.playerLeave.subscribe((ev) => lastDash.delete(ev.playerId));
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId === FEATHER) doDash(ev.source);
  });
  system.run(() => {
    for (const p of world.getAllPlayers()) giveFeather(p);
  });
}

/** 5 秒ごと: 持っていなければ渡す（ゲーム中でなくても） */
function tick(): void {
  for (const p of world.getAllPlayers()) giveFeather(p);
}

export const dash: Feature = { name: "dash", subscribe, tick: { every: 100, run: tick } };
