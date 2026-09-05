/**
 * ネザーゲートを通さない係。
 *
 *
 * ## 二段構え
 *
 * > ### 「行く前に止める」だけでは足りない
 * >
 * > **次元移動を打ち消せる before イベントが無い**
 * > （`playerDimensionChange` は after しかない）。
 * > だから**踏んだ時点で押し戻し、それでも飛んだら引き戻す。**
 *
 * ```
 * 毎 tick   足元か頭がゲート → 直前の安全な場所へ戻す
 * 次元変化  オーバーワールド以外 → 元の場所へ戻す（保険）
 * ```
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Vector3,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { center } from "../../core/places.js";
import { place } from "./gate.js";

/** ゲートのブロック */
const PORTAL = "minecraft:portal";

/** ここだけが「居てよい次元」 */
const HOME = "minecraft:overworld";

/** 知らせる間隔（tick）。**連打すると画面が埋まる** */
const TELL = 40;

/** 直前の安全な場所（**地に足が着いていて、ゲートの外**） */
const safe = new Map<string, Vector3>();

/** 最後に知らせた tick */
const told = new Map<string, number>();

/** ゲートの中にいるか（**足元と頭の両方を見る**） */
function inPortal(player: Player): boolean {
  const at = player.location;
  const dim = player.dimension;
  for (const dy of [0, 1]) {
    const b = dim.getBlock({ x: Math.floor(at.x), y: Math.floor(at.y) + dy, z: Math.floor(at.z) });
    if (b?.typeId === PORTAL) return true;
  }
  return false;
}

/** 短く知らせる（**2 秒に 1 回まで**） */
function tell(player: Player): void {
  const last = told.get(player.id) ?? -TELL;
  if (system.currentTick - last < TELL) return;
  told.set(player.id, system.currentTick);
  try {
    player.sendMessage("§7ネザーゲートは飾り。§f通れない");
  } catch {
    /* 消えている */
  }
}

/** ゲートから 1 マス外へ押し出す（**戻す先を覚えていないとき**） */
function shove(player: Player): void {
  const at = player.location;
  const dim = player.dimension;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ]) {
    const x = Math.floor(at.x) + dx;
    const z = Math.floor(at.z) + dz;
    const y = Math.floor(at.y);
    const foot = dim.getBlock({ x, y, z });
    const head = dim.getBlock({ x, y: y + 1, z });
    const under = dim.getBlock({ x, y: y - 1, z });
    if (foot === undefined || head === undefined || under === undefined) continue;
    if (foot.typeId === PORTAL || head.typeId === PORTAL) continue;
    if (!foot.isAir || !head.isAir || under.isAir) continue;
    try {
      player.teleport(center({ x, y, z }));
    } catch {
      /* 置けなければ諦める */
    }
    return;
  }
}

/** 1 tick ぶん */
function tick(): void {
  for (const player of world.getAllPlayers()) {
    try {
      if (player.dimension.id !== HOME) continue;
      if (inPortal(player)) {
        const back = safe.get(player.id);
        if (back === undefined) shove(player);
        else player.teleport(center(back));
        tell(player);
        continue;
      }
      // **地に足が着いているときだけ覚える**（空中を覚えると、戻した瞬間に落ちる）
      if (player.isOnGround) {
        const at = player.location;
        safe.set(player.id, { x: at.x, y: at.y, z: at.z });
      }
    } catch {
      /* 消えている */
    }
  }
}

/** 保険。**それでも飛んだら引き戻す** */
function subscribe(): void {
  world.afterEvents.playerDimensionChange.subscribe((ev) => {
    if (ev.toDimension.id === HOME) return;
    const back = safe.get(ev.player.id) ?? ev.fromLocation;
    system.run(() => {
      try {
        ev.player.teleport(center(back), { dimension: ev.fromDimension });
        tell(ev.player);
      } catch {
        /* 消えている */
      }
    });
  });
}

/**
 * 座標を指定して、**飾りのゲートを敷く**。
 *
 * ```
 * /pve:gate 1250 20 700 1253 24 700        置く
 * /pve:gate 1250 20 700 1253 24 700 true   消す（空気にする）
 * ```
 *
 * **本物のゲートは拾えない**ので、こちらで敷く（`gate.ts`）。
 */
function gateCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:gate",
      description: "飾りのネザーゲートを範囲に敷く",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [
        { name: "から", type: CustomCommandParamType.Location },
        { name: "まで", type: CustomCommandParamType.Location },
      ],
      optionalParameters: [{ name: "消す", type: CustomCommandParamType.Boolean }],
    },
    (origin: CustomCommandOrigin, from: Vector3, to: Vector3, clear?: boolean): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      system.run(() => {
        try {
          place(player.dimension, from, to, player, clear === true);
        } catch (err) {
          player.sendMessage(`§c${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const portal: Feature = {
  name: "portal",
  tick: { every: 1, run: tick },
  subscribe,
  commands: [gateCommand],
};
