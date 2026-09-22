/**
 * 行動範囲（200×200×200、原点中心）。`docs/spec/16-world-rules.md` 3 章。
 *
 * **Core Wars の境界を写した**（`worlds/core-wars/packs/game/scripts/features/border/index.ts`）。
 * Bedrock にワールドボーダーは無いので、出たら中へ戻し、近づいたら粒子で壁を見せる。
 * 粒子はバニラのワールドボーダーの粒子から上昇だけ外したもの（RP の `particles/border_wall.json`）。
 *
 * 違い: **上下も切る**（飛べるので）、**常に効く**（状態を見ない）、クリエイティブは通す。
 * 加えて **y < −60 に落ちたら op 以外はスポーン地点へ戻す**（本人・2026-09-21）。
 */

import { GameMode, system, world, type Player } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { FALL_Y, PLAY_BOX, pushInside, type Box } from "../../core/box.js";
import { isOp } from "../../services/players.js";

const BORDER_PARTICLE = "ai_build_quiz:border_wall";
/** 粒子の寿命（0.1 秒 = 2 tick）と揃える。ずれると明滅する */
const INTERVAL = 2;
const SHOW_RADIUS = 6;
const STEP = 1.5;
const PUSH_IN = 1.5;
const NOTIFY_TICKS = 40;

const lastNotified = new Map<string, number>();

function showWalls(player: Player, box: Box): void {
  const p = player.location;
  const dim = player.dimension;
  const rr = SHOW_RADIUS * SHOW_RADIUS;
  const put = (x: number, y: number, z: number): void => {
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    if (dx * dx + dy * dy + dz * dz > rr) return;
    try {
      dim.spawnParticle(BORDER_PARTICLE, { x, y, z });
    } catch {
      /* 読み込まれていない */
    }
  };
  /** 1 軸を固定した面を、プレイヤーの周りだけ描く */
  const wall = (fixed: "x" | "y" | "z", value: number): void => {
    const away = Math.abs((fixed === "x" ? p.x : fixed === "y" ? p.y : p.z) - value);
    const reach = Math.sqrt(Math.max(0, rr - away * away));
    for (let a = -reach; a <= reach; a += STEP) {
      for (let b = -reach; b <= reach; b += STEP) {
        if (fixed === "x") put(value, p.y + a, p.z + b);
        else if (fixed === "y") put(p.x + a, value, p.z + b);
        else put(p.x + a, p.y + b, value);
      }
    }
  };
  if (p.x - box.min.x < SHOW_RADIUS) wall("x", box.min.x);
  if (box.max.x - p.x < SHOW_RADIUS) wall("x", box.max.x);
  if (p.z - box.min.z < SHOW_RADIUS) wall("z", box.min.z);
  if (box.max.z - p.z < SHOW_RADIUS) wall("z", box.max.z);
  if (p.y - box.min.y < SHOW_RADIUS) wall("y", box.min.y);
  if (box.max.y - p.y < SHOW_RADIUS) wall("y", box.max.y);
}

function notify(player: Player): void {
  const now = system.currentTick;
  const last = lastNotified.get(player.id);
  if (last !== undefined && now - last < NOTIFY_TICKS) return;
  lastNotified.set(player.id, now);
  try {
    player.onScreenDisplay.setActionBar("§cここから先には行けません");
  } catch {
    /* 抜けた */
  }
}

/** スポーン地点。ベッドで決めた人はそこ、無ければワールドのもの。y が変（未設定の印）なら輪の高さに */
function spawnOf(player: Player): { x: number; y: number; z: number } {
  const own = player.getSpawnPoint();
  const s = own ?? world.getDefaultSpawnLocation();
  const y = s.y > 255 || s.y < FALL_Y ? 1 : s.y;
  return { x: s.x, y, z: s.z };
}

/** 落ちたら戻す（op 以外）。戻したら true */
function catchFall(player: Player): boolean {
  if (player.location.y >= FALL_Y || isOp(player)) return false;
  try {
    player.teleport(spawnOf(player), { dimension: player.dimension });
    player.onScreenDisplay.setActionBar("§cスポーン地点に戻しました");
  } catch {
    /* 次の機会に */
  }
  return true;
}

function tick(): void {
  for (const player of world.getAllPlayers()) {
    if (catchFall(player)) continue;
    // クリエイティブは通す（運営が直しに行く）
    try {
      if (player.getGameMode() === GameMode.Creative) continue;
    } catch {
      continue;
    }
    const back = pushInside(PLAY_BOX, player.location, PUSH_IN);
    if (back !== undefined) {
      try {
        player.teleport(back, { dimension: player.dimension });
        notify(player);
      } catch {
        /* 次の機会に */
      }
      continue;
    }
    showWalls(player, PLAY_BOX);
  }
}

export const border: Feature = { name: "border", tick: { every: INTERVAL, run: tick } };
