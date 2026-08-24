/**
 * 歩いた先のブロックの種類を集める。
 *
 * ## 何のために要るか
 *
 * マップは手で作り込まれていて、**作り手（Claude）は何が置かれたか知らない。**
 * 独自ブロックへの置き換え表を作るには、まず**実際に何があるかを見る**必要がある。
 *
 * 推測で表を書くと、載っていないブロックが黙って残る。**見てから書く。**
 *
 * ## なぜ「一度見た区画は二度見ない」のか
 *
 * 半径を毎回まるごと見ると、すぐ数十万マスになる。1 秒ごとには終わらない。
 *
 * だから世界を 16 マス角の区画に切り、**まだ見ていない区画だけ**を見る。
 * 歩き回るほど新しい区画だけが積み上がり、同じ場所で立ち止まっても
 * 負荷はゼロになる。
 *
 * ## 使い方
 *
 *   /kit:scan on      集め始める（歩き回る）
 *   /kit:scan off     止める
 *   /kit:scan show    集まった種類を出す
 *   /kit:scan clear   集めたものを捨てる
 *
 * **未知のブロックを見つけたら、その場で知らせる。**
 * `show` を打たなくても気づける。
 */

import {
  system,
  world,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type CustomCommandRegistry,
} from "@minecraft/server";

import { MAP_BLOCK_MAP, NEVER_REPLACE } from "../../lib/map-blocks.js";

/** 区画の一辺。16 は Minecraft のチャンクの幅に合わせてある */
const CELL = 16;

/** 集める半径（マス）。歩き回って埋める前提なので、広くしすぎない */
const RADIUS = 16;

/** 何 tick ごとに集めるか */
const SWEEP_INTERVAL = 20;

/**
 * 1 回の掃き取りで見る区画の数。
 *
 * 16³ = 4096 マス × 8 区画 = 32768 マス。
 * `system.runJob` で刻むので tick は跨ぐが、**溜め込みすぎない量**にする。
 */
const CELLS_PER_SWEEP = 8;

/** 1 tick あたりに見るマス数（watchdog 対策。docs/imp.md 5.3） */
const PER_TICK = 2048;

const NEVER = new Set(NEVER_REPLACE);

// ---------------------------------------------------------------- 集めた結果
/** 見終わった区画。`"cx,cy,cz"` */
const scannedCells = new Set<string>();

/** 見つかった種類 → 数 */
const found = new Map<string, number>();

/** 未知の種類を知らせた記録。同じものを何度も言わないため */
const announced = new Set<string>();

let running = false;
let sweeping = false;

// ---------------------------------------------------------------- 分類
type Kind = "custom" | "known" | "never" | "unknown";

/**
 * 種類を4つに分ける。
 *
 * **「未知」がこの道具の本題。** それを人が読んで、対応表に足すか決める。
 */
function classify(typeId: string): Kind {
  if (typeId.startsWith("game:map_parts_")) return "custom";
  if (MAP_BLOCK_MAP.has(typeId)) return "known";
  if (NEVER.has(typeId)) return "never";
  return "unknown";
}

// ---------------------------------------------------------------- 走査
function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** プレイヤーの周りで、まだ見ていない区画を近い順に集める */
function pendingCellsNear(player: Player): { cx: number; cy: number; cz: number; d: number }[] {
  const px = Math.floor(player.location.x);
  const py = Math.floor(player.location.y);
  const pz = Math.floor(player.location.z);
  const r = Math.ceil(RADIUS / CELL);
  const base = {
    x: Math.floor(px / CELL),
    y: Math.floor(py / CELL),
    z: Math.floor(pz / CELL),
  };

  const out: { cx: number; cy: number; cz: number; d: number }[] = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        const cx = base.x + dx;
        const cy = base.y + dy;
        const cz = base.z + dz;
        if (scannedCells.has(cellKey(cx, cy, cz))) continue;
        out.push({ cx, cy, cz, d: dx * dx + dy * dy + dz * dz });
      }
    }
  }
  // **近い区画から見る。** 目の前が先に埋まる方が、気づくのが早い
  out.sort((a, b) => a.d - b.d);
  return out;
}

function* sweepJob(player: Player): Generator<void, void, void> {
  const dim = player.dimension;
  const cells = pendingCellsNear(player).slice(0, CELLS_PER_SWEEP);
  const fresh: string[] = [];
  let seen = 0;

  for (const c of cells) {
    // **読み込まれていない区画は「見た」にしない。** 後で近づいたときに見直す
    let ok = true;

    for (let x = c.cx * CELL; x < (c.cx + 1) * CELL && ok; x++) {
      for (let y = c.cy * CELL; y < (c.cy + 1) * CELL && ok; y++) {
        for (let z = c.cz * CELL; z < (c.cz + 1) * CELL; z++) {
          let typeId: string | undefined;
          try {
            typeId = dim.getBlock({ x, y, z })?.typeId;
          } catch {
            ok = false;
            break;
          }
          if (typeId !== undefined && typeId !== "minecraft:air") {
            const before = found.get(typeId);
            found.set(typeId, (before ?? 0) + 1);
            if (before === undefined && classify(typeId) === "unknown" && !announced.has(typeId)) {
              announced.add(typeId);
              fresh.push(`${typeId} §7(${x}, ${y}, ${z})`);
            }
          }
          if (++seen % PER_TICK === 0) yield;
        }
      }
    }

    if (ok) scannedCells.add(cellKey(c.cx, c.cy, c.cz));
  }

  if (fresh.length > 0) {
    player.sendMessage(`§c未知のブロック §f${fresh.length} 種\n  ` + fresh.join("\n  "));
  }
  sweeping = false;
}

// ---------------------------------------------------------------- 報告
function show(player: Player): void {
  if (found.size === 0) {
    player.sendMessage("§7まだ何も集めていない。§f/kit:scan on §7で歩き回る");
    return;
  }
  const groups: Record<Kind, [string, number][]> = {
    unknown: [],
    known: [],
    custom: [],
    never: [],
  };
  for (const [id, n] of found) groups[classify(id)].push([id, n]);
  for (const k of Object.keys(groups) as Kind[]) groups[k].sort((a, b) => b[1] - a[1]);

  const lines: string[] = [`§e集めた区画 ${scannedCells.size} / 種類 ${found.size}`];
  const section = (title: string, k: Kind, color: string) => {
    const g = groups[k];
    if (g.length === 0) return;
    lines.push(`${color}── ${title} (${g.length})`);
    for (const [id, n] of g) lines.push(`  ${id} §7x${n}`);
  };
  // **未知を先頭に。** これが知りたいもの
  section("未知（対応表に無い）", "unknown", "§c");
  section("置き換え対象", "known", "§a");
  section("置き換え済み", "custom", "§b");
  section("置き換えない（コア・目印）", "never", "§7");

  player.sendMessage(lines.join("\n"));
}

// ---------------------------------------------------------------- 登録
function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerScanCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "kit:scan",
      description: "歩いた先のブロックの種類を集める (on / off / show / clear)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      optionalParameters: [{ name: "action", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, action?: string): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      // **コマンドのコールバックは restricted execution**（docs/imp.md 5.1）。
      // world を触る処理は次の tick へ逃がす
      const what = (action ?? "on").toLowerCase();

      switch (what) {
        case "on":
          running = true;
          return { status: CustomCommandStatus.Success, message: "集め始めた。歩き回ること" };
        case "off":
          running = false;
          return { status: CustomCommandStatus.Success, message: "止めた" };
        case "show":
          system.run(() => show(player));
          return { status: CustomCommandStatus.Success };
        case "clear":
          scannedCells.clear();
          found.clear();
          announced.clear();
          return { status: CustomCommandStatus.Success, message: "集めたものを捨てた" };
        default:
          return {
            status: CustomCommandStatus.Failure,
            message: "on / off / show / clear のいずれか",
          };
      }
    }
  );
}

/**
 * 定期的な掃き取りを始める。
 *
 * **`worldLoad` から呼ぶこと。**
 */
export function startScanLoop(): void {
  system.runInterval(() => {
    if (!running || sweeping) return;
    const players = world.getAllPlayers();
    if (players.length === 0) return;
    sweeping = true;
    // **1 人ぶんずつ。** 全員を同時に走査すると tick が持たない
    system.runJob(sweepJob(players[0]));
  }, SWEEP_INTERVAL);
}
