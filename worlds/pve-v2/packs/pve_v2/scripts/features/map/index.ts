/**
 * マップを建てる。
 *
 * 仕様は `docs/02-map.md`、**どこに何を置くかは `plan.ts`。**
 *
 * ```
 * /pve:map build    立っている所を原点にして建てる
 * /pve:map clear    建てた範囲を消す（地面だけ残す）
 * /pve:map house    3D モデルから焼いた家を 1 軒置く（`models/`）
 * /pve:map fort     `.schem` から取り込んだ要塞を置く（**109 x 120 x 119**）
 * /pve:map rock     **岩山を作る**（毎回ちがう形・ちがう石）
 * /pve:map land     **戦場の周り 500 x 500 の地形を作る**（数分かかる。`land.ts`）
 * /pve:map landstop 地形づくりを止める
 * /pve:map floor    **歩いたまわりの y = 13 を暗い石で散らす**（入／切。`floor.ts`）
 * /pve:map portal   **本物のネザーゲートを飾りに差し替える**（`docs/spec/14-portal.md`）
 * ```
 *
 * ## 少しずつ置く
 *
 * **一度に置くとゲームが固まる**——数十万マスになる。
 * **1 tick ぶんの予算**を決めて、そのぶんだけ消化する。
 *
 * | | |
 * | --- | --- |
 * | 箱で埋める | **1 tick に 12 箱まで**（`fillBlocks` は範囲が広いほど重い） |
 * | 1 マス置く | **1 tick に 900 まで** |
 *
 * ## 手で直さない
 *
 * **数値を変えて建て直す**（`plan.ts`）。
 * 手で直したものは、**次に建て直したときに消える。**
 */

import {
  BlockPermutation,
  BlockVolume,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Dimension,
  type Vector3,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { plan, type Op } from "./plan.js";
import { simple, type VoxelModel } from "./models/simple.js";
import { fortress } from "./models/fortress.js";
import { rockPlan } from "./rock.js";
import * as floor from "./floor.js";
import * as gate from "./gate.js";
import * as land from "./land.js";

/** 1 tick ぶんの予算 */
// **街を丸ごと建てるので上げた**（2026-08-31）。数十万手になる
const FILLS_PER_TICK = 40;
const SETS_PER_TICK = 2500;

/**
 * ブロックの姿を作る。
 *
 * > ### 名前だけでは向きが決まらない
 * >
 * > **階段やハーフブロックは「状態」を持つ**（`weirdo_direction` など）。
 * > 名前だけで置くと**全部が同じ向き**になり、屋根が破綻する（2026-08-31）。
 */
function permutation(block: string, states?: Readonly<Record<string, string | number | boolean>>): BlockPermutation {
  const id = `minecraft:${block}`;
  return states === undefined ? BlockPermutation.resolve(id) : BlockPermutation.resolve(id, states);
}

/** いま建てている仕事。**同時に 1 つだけ** */
interface Job {
  readonly dim: Dimension;
  readonly origin: Vector3;
  readonly ops: readonly Op[];
  readonly by: Player;
  at: number;
  /** 置けなかった数（**読み込まれていない所**など） */
  failed: number;
}

let job: Job | undefined;

/** 進み具合を伝える間隔（何割ごとか） */
const REPORT = 0.25;
let reported = 0;

function build(dim: Dimension, origin: Vector3, by: Player): void {
  job = { dim, origin, ops: plan(), by, at: 0, failed: 0 };
  reported = 0;
  by.sendMessage(`§7マップを建てる（§f${job.ops.length}§7 手）……`);
}

/**
 * 消す。**地面だけ残して、上を空にする。**
 *
 * **建て直す前に呼ぶ必要はない**——`plan()` の頭で空にしている。
 */
function clear(dim: Dimension, origin: Vector3, by: Player): void {
  job = {
    dim,
    origin,
    ops: [{ kind: "fill", x1: -60, y1: 1, z1: -56, x2: 60, y2: 40, z2: 82, block: "air" }],
    by,
    at: 0,
    failed: 0,
  };
  reported = 0;
  by.sendMessage("§7マップを消す……");
}

/**
 * 3D モデルから焼いた家を、1 軒置く。
 *
 * **`tools/mc-voxelize.py` が OBJ から作ったもの**（`models/`）。
 * **足元を左手前の角**にして置く——**向きは元のモデルのまま。**
 */
function place(model: VoxelModel, label: string, dim: Dimension, origin: Vector3, by: Player): void {
  const ops: Op[] = [];
  // **置く前に、その体積を空にする**（前に建てたものが残らない）
  ops.push({
    kind: "fill",
    x1: 0,
    y1: 0,
    z1: 0,
    x2: model.size[0] - 1,
    y2: model.size[1] - 1,
    z2: model.size[2] - 1,
    block: "air",
  });
  for (const b of model.blocks) {
    const name = model.palette[b[3]];
    if (name === undefined) continue;
    ops.push({ kind: "set", x: b[0], y: b[1], z: b[2], block: name });
  }
  job = { dim, origin, ops, by, at: 0, failed: 0 };
  reported = 0;
  by.sendMessage(`§7${label}を置く（§f${model.size.join(" x ")}§7・${model.blocks.length} ブロック）……`);
}

/**
 * 岩山を作る（`docs/02-map.md` 8 章）。
 *
 * > ### 守る範囲に掛かったら、1 つも置かない
 * >
 * > **途中まで置いて止めると、壊すのが手作業になる。**
 * > **全部の座標を先に調べて**、掛かるなら**何もせずに断る。**
 */
function rock(dim: Dimension, origin: Vector3, by: Player): void {
  // **毎回ちがう形・ちがう石**（時刻と乱数を種にする）
  const seed = (system.currentTick * 2654435761 + Math.floor(Math.random() * 0xffffff)) >>> 0;
  const made = rockPlan(origin, seed);
  if (made.blocked) {
    by.sendMessage("§c守る範囲（1201,13,643〜1308,132,757）に掛かるので作らなかった");
    return;
  }
  job = { dim, origin, ops: made.ops, by, at: 0, failed: 0 };
  reported = 0;
  by.sendMessage(`§7岩山を作る（§f${made.ops.length}§7 ブロック）……`);
}

/** 1 tick ぶん進める */
function tick(): void {
  // **地形づくりは別の係**（帯ごとに読み込みを待つ。`land.ts`）
  land.step();
  // **床を散らす係**（歩いたまわりだけ。`floor.ts`）
  floor.step();
  // **ネザーゲートを飾りに差し替える係**（`gate.ts`）
  gate.step();

  const j = job;
  if (j === undefined) return;

  let fills = 0;
  let sets = 0;
  while (j.at < j.ops.length) {
    const op = j.ops[j.at];
    if (op === undefined) {
      j.at += 1;
      continue;
    }
    if (op.kind === "fill") {
      if (fills >= FILLS_PER_TICK) break;
      fills += 1;
      try {
        const from = { x: j.origin.x + op.x1, y: j.origin.y + op.y1, z: j.origin.z + op.z1 };
        const to = { x: j.origin.x + op.x2, y: j.origin.y + op.y2, z: j.origin.z + op.z2 };
        j.dim.fillBlocks(new BlockVolume(from, to), permutation(op.block, op.states));
      } catch {
        j.failed += 1;
      }
    } else {
      if (sets >= SETS_PER_TICK) break;
      sets += 1;
      try {
        j.dim.setBlockPermutation(
          { x: j.origin.x + op.x, y: j.origin.y + op.y, z: j.origin.z + op.z },
          permutation(op.block, op.states)
        );
      } catch {
        j.failed += 1;
      }
    }
    j.at += 1;
  }

  const done = j.at / j.ops.length;
  if (done >= reported + REPORT && done < 1) {
    reported = Math.floor(done / REPORT) * REPORT;
    try {
      j.by.sendMessage(`§7…… §f${Math.round(done * 100)}%`);
    } catch {
      /* 消えている */
    }
  }

  if (j.at >= j.ops.length) {
    try {
      const miss = j.failed > 0 ? `§7（置けなかった: §c${j.failed}§7）` : "";
      j.by.sendMessage(`§a終わった。${miss}`);
    } catch {
      /* 消えている */
    }
    job = undefined;
  }
}

/**
 * 座標を指定して、**飾りのゲートを敷く**。
 *
 * ```
 * /pve:gate 1250 20 700 1253 24 700        置く
 * /pve:gate 1250 20 700 1253 24 700 true   消す（空気にする）
 * ```
 *
 * **`/pve:map portal` で拾えないとき**に使う（`docs/spec/14-portal.md`）。
 */
function gateCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:gate",
      description: "飾りのネザーゲートを範囲に敷く（`docs/spec/14-portal.md`）",
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
          gate.place(player.dimension, from, to, player, clear === true);
        } catch (err) {
          player.sendMessage(`§c${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

function command(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:map",
      description: "マップを建てる／消す（`docs/02-map.md`）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "何を", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, what: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      if (job !== undefined) {
        return { status: CustomCommandStatus.Failure, message: "いま建てている最中" };
      }
      system.run(() => {
        try {
          // **立っている所が原点**（`docs/02-map.md` 2 章）
          const at = player.location;
          const spot = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
          if (what === "build") build(player.dimension, spot, player);
          else if (what === "clear") clear(player.dimension, spot, player);
          else if (what === "house") place(simple, "家", player.dimension, spot, player);
          else if (what === "fort") place(fortress, "要塞", player.dimension, spot, player);
          else if (what === "rock") rock(player.dimension, spot, player);
          else if (what === "land") {
            // **押すたびに違う地形**（種を毎回変える）
            if (land.busy()) player.sendMessage("§7いま地形を作っている最中（`/pve:map landstop` で止める）");
            else land.start(player.dimension, player, (Date.now() ^ (system.currentTick * 2654435761)) >>> 0);
          } else if (what === "landstop") land.stop();
          else if (what === "portal") {
            if (gate.busy()) player.sendMessage("§7いま探している最中");
            else gate.start(player.dimension, spot, player);
          } else if (what === "floor") {
            const now = floor.toggle(player);
            player.sendMessage(now ? "§a床を散らす：入（もう一度で切）" : "§7床を散らす：切");
          } else
            player.sendMessage(
              "§7`/pve:map build` / `clear` / `house` / `fort` / `rock` / `land` / `landstop` / `floor`"
            );
        } catch (err) {
          player.sendMessage(`§c${String(err)}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const map: Feature = {
  name: "map",
  tick: { every: 1, run: tick },
  commands: [command, gateCommand],
};
