/**
 * マップのバニラブロックを、独自ブロック `game:map_parts_*` に置き換える。
 *
 * ## なぜコマンドなのか
 *
 * マップは**手で作り直された**。構造物を置き直すと、その作業が消える。
 * だから**いま置かれているブロックを、その場で差し替える**。
 *
 * ## なぜ on / off なのか
 *
 * 半径を指定して1回ずつ実行すると、**マップ全体を覆うのに何十回も打つ**ことになる。
 * 常時動かして、**歩くだけで置き換わる**ようにする。
 *
 * 走査（`scan.ts`）と同じく、世界を 16 マス角の区画に切り、
 * **一度処理した区画は二度やらない**。同じ場所に立ち止まれば負荷はゼロ。
 *
 * ## どうやって差し替えるか
 *
 * `Dimension.fillBlocks` に**フィルタ**を渡すと、
 * 「この範囲の、この種類だけを、別の種類に差し替える」ができる。
 * 1 マスずつ読んで書くより、はるかに速い。
 *
 * ## 使い方
 *
 *   /kit:convert on      置き換えを始める（歩き回る）
 *   /kit:convert off     止める
 *   /kit:convert status  これまでの合計を出す
 */

import {
  system,
  world,
  BlockVolume,
  BlockPermutation,
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

import { MAP_BLOCK_MAP, AXIS_SENSITIVE, FLAMMABLE_SWAP, STAIR_STATES } from "../../lib/map-blocks.js";

/** 区画の一辺。走査と揃えてある */
const CELL = 16;

/** 処理する半径（マス） */
const RADIUS = 16;

/** 何 tick ごとに処理するか */
const SWEEP_INTERVAL = 20;

/** 1 回で処理する区画の数 */
const CELLS_PER_SWEEP = 4;

const AXIS = new Set(AXIS_SENSITIVE);

/**
 * 向きを持つブロックの、状態の名前。
 *
 * バニラは `pillar_axis`、独自ブロックは `game:axis`。
 * **名前が違うので、読み替えて引き継ぐ。**
 */
const VANILLA_AXIS = "pillar_axis";
const CUSTOM_AXIS = "game:axis";
const AXES = ["x", "y", "z"] as const;

// ---------------------------------------------------------------- 状態
/** 処理済みの区画。`"cx,cy,cz"` */
const doneCells = new Set<string>();

/** 種類ごとの累計 */
const totals = new Map<string, number>();

let running = false;
let sweeping = false;
let skipped = 0;

// ---------------------------------------------------------------- 安全装置
/**
 * 独自ブロックが**ワールドに存在するか**確かめる。
 *
 * `game` パックが有効になっていないと `game:map_parts_*` は未定義。
 * その状態で差し替えると、**失敗するか、最悪ブロックが消える。**
 *
 * **始める前に必ず確かめる。** 黙って走らせない。
 */
function customBlocksAvailable(): boolean {
  const first = MAP_BLOCK_MAP.values().next();
  if (first.done === true) return false;
  try {
    BlockPermutation.resolve(first.value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 置き換え
/**
 * 向きを持つブロックを、向きごとに差し替える。
 *
 * 丸太とヒカリゴケは**横倒しに置ける**。
 * 向きを見ずに一括で差し替えると、**横倒しが全部縦になって見た目が崩れる。**
 *
 * `blockFilter.includePermutations` で「この向きのものだけ」を指定し、
 * 差し替え先も同じ向きにする。**3 回に分けるだけで済む。**
 */
function convertAxisBlock(dim: Dimension, volume: BlockVolume, vanilla: string, custom: string): number {
  let total = 0;
  for (const axis of AXES) {
    const match = BlockPermutation.resolve(vanilla, { [VANILLA_AXIS]: axis });
    const to = BlockPermutation.resolve(custom, { [CUSTOM_AXIS]: axis });
    const done = dim.fillBlocks(volume, to, {
      blockFilter: { includePermutations: [match] },
      ignoreChunkBoundErrors: true,
    });
    total += done.getCapacity();
  }
  return total;
}

/**
 * 向きを持たないブロックを差し替える。
 *
 * ## `includeTypes` を使わない理由（2026-08-24）
 *
 * `blockFilter: { includeTypes: ["minecraft:stone"] }` で差し替えたところ、
 * **安山岩（andesite）まで石に変わってしまった。**
 *
 * 安山岩は独立した識別子で状態も持たないのに、
 * `minecraft:stone` の指定で拾われている。
 * 種類名の一致が、こちらの想定より広く働いているとしか説明がつかない。
 *
 * **`includePermutations` に切り替える。** permutation は状態まで含めた
 * 完全な指定なので、別のブロックを巻き込む余地がない。
 */
function convertPlainBlock(dim: Dimension, volume: BlockVolume, vanilla: string, custom: string): number {
  const match = BlockPermutation.resolve(vanilla);
  const done = dim.fillBlocks(volume, custom, {
    blockFilter: { includePermutations: [match] },
    ignoreChunkBoundErrors: true,
  });
  return done.getCapacity();
}

/**
 * **燃える飾りを、燃えないものに置き換える。**
 *
 * 柵と木の階段は独自ブロックにできない（形と向きを持つ）。
 * バニラのままだと延焼でマップから消えるので、材料ごと変える。
 *
 * ## 向きを引き継ぐ
 *
 * 階段は `weirdo_direction`（向き）と `upside_down_bit`（上下）を持つ。
 * **引き継がないと全部同じ向きになって形が崩れる。**
 *
 * 柵は向きを持たない（隣と自動で繋がる）ので、そのまま置き換えられる。
 */
function swapFlammable(dim: Dimension, from: Vector3, to: Vector3): number {
  let total = 0;
  for (const [vanilla, replacement] of FLAMMABLE_SWAP) {
    const isStair = vanilla.includes("stairs");
    if (!isStair) {
      const volume = new BlockVolume(from, to);
      total += dim
        .fillBlocks(volume, replacement, {
          blockFilter: { includePermutations: [BlockPermutation.resolve(vanilla)] },
          ignoreChunkBoundErrors: true,
        })
        .getCapacity();
      continue;
    }
    // **階段は向きの組み合わせごとに差し替える。** 4 向き x 上下 = 8 通り
    for (let dir = 0; dir <= 3; dir++) {
      for (const flip of [false, true]) {
        const states = { [STAIR_STATES[0]]: dir, [STAIR_STATES[1]]: flip };
        try {
          const match = BlockPermutation.resolve(vanilla, states);
          const want = BlockPermutation.resolve(replacement, states);
          const volume = new BlockVolume(from, to);
          total += dim
            .fillBlocks(volume, want, {
              blockFilter: { includePermutations: [match] },
              ignoreChunkBoundErrors: true,
            })
            .getCapacity();
        } catch {
          /* その組み合わせが無い。次へ */
        }
      }
    }
  }
  return total;
}

function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** プレイヤーの周りで、まだ処理していない区画を近い順に集める */
function pendingCells(player: Player): { cx: number; cy: number; cz: number; d: number }[] {
  const r = Math.ceil(RADIUS / CELL);
  const base = {
    x: Math.floor(Math.floor(player.location.x) / CELL),
    y: Math.floor(Math.floor(player.location.y) / CELL),
    z: Math.floor(Math.floor(player.location.z) / CELL),
  };
  const out: { cx: number; cy: number; cz: number; d: number }[] = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        const cx = base.x + dx;
        const cy = base.y + dy;
        const cz = base.z + dz;
        if (doneCells.has(cellKey(cx, cy, cz))) continue;
        out.push({ cx, cy, cz, d: dx * dx + dy * dy + dz * dz });
      }
    }
  }
  // **近い区画から。** 目の前が先に変わる方が、進んでいるのが分かる
  out.sort((a, b) => a.d - b.d);
  return out;
}

function* sweepJob(player: Player): Generator<void, void, void> {
  const dim = player.dimension;
  const cells = pendingCells(player).slice(0, CELLS_PER_SWEEP);
  let fresh = 0;

  for (const c of cells) {
    const from = { x: c.cx * CELL, y: c.cy * CELL, z: c.cz * CELL };
    const to = { x: from.x + CELL - 1, y: from.y + CELL - 1, z: from.z + CELL - 1 };
    let ok = true;

    for (const [vanilla, custom] of MAP_BLOCK_MAP) {
      try {
        const volume = new BlockVolume(from, to);
        const n = AXIS.has(vanilla)
          ? convertAxisBlock(dim, volume, vanilla, custom)
          : convertPlainBlock(dim, volume, vanilla, custom);
        if (n > 0) {
          fresh += n;
          totals.set(vanilla, (totals.get(vanilla) ?? 0) + n);
        }
      } catch {
        // **読み込まれていない区画は「処理済み」にしない。** 後で近づけば直る
        ok = false;
      }
      yield;
    }

    // **燃える飾りも同じ掃き取りで置き換える。**
    // 別のコマンドにすると、片方だけ流し忘れる
    try {
      const n = swapFlammable(dim, from, to);
      if (n > 0) {
        fresh += n;
        totals.set("燃える飾りの置換", (totals.get("燃える飾りの置換") ?? 0) + n);
      }
    } catch {
      ok = false;
    }
    yield;

    if (ok) doneCells.add(cellKey(c.cx, c.cy, c.cz));
    else skipped++;
  }

  // **チャットに流さない。** 歩くたびに出ると邪魔になる
  if (fresh > 0) {
    player.onScreenDisplay.setActionBar(`§a置き換え +${fresh} §7/ 区画 ${doneCells.size}`);
  }
  sweeping = false;
}

// ---------------------------------------------------------------- 報告
function status(player: Player): void {
  let sum = 0;
  for (const v of totals.values()) sum += v;
  const lines = [`§e${running ? "動作中" : "停止中"} / 処理した区画 ${doneCells.size} / 合計 ${sum} マス`];
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, n] of sorted) lines.push(`  ${id.replace("minecraft:", "")} §7x${n}`);
  if (skipped > 0) {
    lines.push(`§7未読み込みで後回しにした区画 ${skipped}（近づけば処理される）`);
  }
  player.sendMessage(lines.join("\n"));
}

function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerConvertCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "kit:convert",
      description: "歩いた先のマップブロックを独自ブロックに置き換える (on / off / status)",
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
          // **始める前に必ず確かめる。** game パックが無いまま走らせない
          if (!customBlocksAvailable()) {
            return {
              status: CustomCommandStatus.Failure,
              message: "game パックが有効になっていない。有効にして入り直すこと",
            };
          }
          running = true;
          return { status: CustomCommandStatus.Success, message: "置き換えを始めた。歩き回ること" };
        case "off":
          running = false;
          return { status: CustomCommandStatus.Success, message: "止めた" };
        case "status":
          system.run(() => status(player));
          return { status: CustomCommandStatus.Success };
        default:
          return { status: CustomCommandStatus.Failure, message: "on / off / status のいずれか" };
      }
    }
  );
}

/**
 * 定期的な処理を始める。
 *
 * **`worldLoad` から呼ぶこと。**
 */
export function startConvertLoop(): void {
  system.runInterval(() => {
    if (!running || sweeping) return;
    const players = world.getAllPlayers();
    if (players.length === 0) return;
    sweeping = true;
    system.runJob(sweepJob(players[0]));
  }, SWEEP_INTERVAL);
}
