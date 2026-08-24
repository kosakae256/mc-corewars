/**
 * まだ置き換わっていないブロックを、赤く光らせる。
 *
 * ## なぜ要るか
 *
 * 置き換えは歩き回って行う。だが**どこが済んでいないかは、見ても分からない。**
 * 独自ブロックはバニラと見た目が同じだからだ。
 *
 * 取りこぼしたまま試合を始めると、**そこだけ壊せてしまう。**
 * 気づけるようにしておく。
 *
 * ## なぜ粒子なのか
 *
 * **ブロックを実際に赤いものへ差し替えるとマップが壊れる。**
 * 見た目だけ変える手段が要る。
 *
 * `minecraft:redstone_ore_dust_particle` は
 * 色が `(赤, 0, 0)` だけで**引数も要らない**。そのまま使える。
 *
 * ## 無駄を省く
 *
 * **空気に面していないブロックには出さない。**
 * 壁の内側や地面の奥は見えないので、出しても意味がないうえ、
 * 数が跳ね上がって重くなる。
 *
 * ## 使い方
 *
 *   /kit:mark on      赤く光らせる
 *   /kit:mark off     止める
 */

import {
  system,
  world,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  type Dimension,
  type Vector3,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type CustomCommandRegistry,
} from "@minecraft/server";

import { MAP_BLOCK_MAP } from "../../lib/map-blocks.js";

/** 引数の要らない、純粋な赤の粒子 */
const RED = "minecraft:redstone_ore_dust_particle";

/** 見る半径（マス）。広げると重くなる */
const RADIUS = 12;

/** 何 tick ごとに出すか */
const INTERVAL = 20;

/** 1 回に出す粒子の上限。**これ以上は出さない**（重くなる） */
const MAX_PARTICLES = 300;

/** 1 tick あたりに見るマス数（watchdog 対策） */
const PER_TICK = 2048;

let running = false;
let working = false;

/** 隣が空気の面。粒子はその方向へ少しずらして出す */
const FACES: readonly Vector3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/**
 * 見えている面を返す。空気に面していなければ `undefined`。
 *
 * **見えない面に出しても意味がない。** 数を抑えるためにも要る。
 */
function exposedFace(dim: Dimension, x: number, y: number, z: number): Vector3 | undefined {
  for (const f of FACES) {
    try {
      const n = dim.getBlock({ x: x + f.x, y: y + f.y, z: z + f.z });
      if (n === undefined) continue;
      if (n.isAir || n.isLiquid) return f;
    } catch {
      /* 読み込まれていない。見えないものとして扱う */
    }
  }
  return undefined;
}

function* markJob(player: Player): Generator<void, void, void> {
  const dim = player.dimension;
  const o = player.location;
  const ox = Math.floor(o.x);
  const oy = Math.floor(o.y);
  const oz = Math.floor(o.z);

  let shown = 0;
  let seen = 0;

  for (let dx = -RADIUS; dx <= RADIUS && shown < MAX_PARTICLES; dx++) {
    for (let dy = -RADIUS; dy <= RADIUS && shown < MAX_PARTICLES; dy++) {
      for (let dz = -RADIUS; dz <= RADIUS && shown < MAX_PARTICLES; dz++) {
        const x = ox + dx;
        const y = oy + dy;
        const z = oz + dz;

        if (++seen % PER_TICK === 0) yield;

        let typeId: string | undefined;
        try {
          typeId = dim.getBlock({ x, y, z })?.typeId;
        } catch {
          continue;
        }
        // **置き換え対象として登録されているのに、まだバニラのまま**のものだけ
        if (typeId === undefined || !MAP_BLOCK_MAP.has(typeId)) continue;

        const face = exposedFace(dim, x, y, z);
        if (face === undefined) continue;

        try {
          dim.spawnParticle(RED, {
            x: x + 0.5 + face.x * 0.55,
            y: y + 0.5 + face.y * 0.55,
            z: z + 0.5 + face.z * 0.55,
          });
          shown++;
        } catch {
          /* 出せなくても困らない */
        }
      }
    }
  }

  if (shown >= MAX_PARTICLES) {
    player.onScreenDisplay.setActionBar(`§c未置換 ${MAX_PARTICLES}+ §7(多すぎて一部のみ表示)`);
  } else if (shown > 0) {
    player.onScreenDisplay.setActionBar(`§c未置換 ${shown}`);
  }
  working = false;
}

function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerMarkCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "kit:mark",
      description: "まだ置き換わっていないブロックを赤く光らせる (on / off)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      optionalParameters: [{ name: "action", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, action?: string): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      switch ((action ?? "on").toLowerCase()) {
        case "on":
          running = true;
          return { status: CustomCommandStatus.Success, message: "未置換を赤く光らせる" };
        case "off":
          running = false;
          return { status: CustomCommandStatus.Success, message: "止めた" };
        default:
          return { status: CustomCommandStatus.Failure, message: "on / off のいずれか" };
      }
    }
  );
}

/**
 * 定期的な表示を始める。
 *
 * **`worldLoad` から呼ぶこと。**
 */
export function startMarkLoop(): void {
  system.runInterval(() => {
    if (!running || working) return;
    const players = world.getAllPlayers();
    if (players.length === 0) return;
    working = true;
    system.runJob(markJob(players[0]));
  }, INTERVAL);
}
