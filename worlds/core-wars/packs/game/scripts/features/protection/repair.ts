/**
 * マップの姿を記憶し、**欠けたところを元に戻す。**
 *
 * ## なぜ要るか
 *
 * 守りきれない壊れ方がある。
 *
 * - **炎の延焼** — 木の柵や葉はバニラのまま。燃えるのは普通の挙動で、止めない
 * - **ピストン** — 押し出しを止めるイベントが存在しない
 *
 * 以前は「炎を見つけた瞬間に隣を控える」方式にしていた。
 * だが**控える前に燃え尽きると戻せない。** 実際に戻らなかった。
 *
 * **先に丸ごと記憶しておけば、取りこぼしが無くなる。**
 *
 * ## どこに記憶するか
 *
 * **構造物として、ワールドに保存する**（`StructureManager`）。
 *
 * - `/reload` で消えない。**ワールドのデータとして残る**
 * - `getBlockPermutation()` で**1 マスずつ読める**。
 *   丸ごと置き直さないので、**プレイヤーの建築を壊さない**
 *
 * ## 負荷について（重要）
 *
 * **照合は重い。** 48 マス角の区画ひとつで 11 万マスある。
 * 広い範囲を常時見張ると tick が持たない。
 *
 * だから**全体を見に行かない。**
 *
 * | | いつ | 範囲 |
 * | --- | --- | --- |
 * | `/game:remember` | マップ完成時に 1 回 | 手動・広く |
 * | `/game:repair` | 試合の合間に手動 | 手動・狭め |
 * | 自動 | **炎が出たときだけ** | **その周り数マスのみ** |
 *
 * さらに、照合の順番を工夫してある。
 * **先に世界の側を見て、空でなければそこで打ち切る。**
 * ほとんどの場所は空ではないので、記憶を読むところまで行かない。
 *
 * 自動修復は `fireguard.ts` が呼ぶ。**火が点いていなければ動かない。**
 */

import {
  system,
  world,
  Player,
  StructureSaveMode,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  type Dimension,
  type Vector3,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type CustomCommandRegistry,
} from "@minecraft/server";

import { isMapBlock } from "../../lib/protection.js";

/** 記憶を入れる構造物の名前の頭 */
const PREFIX = "game:memory_";

/**
 * 区画の一辺。
 *
 * 構造物の上限は 64x384x64。**48 なら余裕を持って収まる。**
 */
const TILE = 48;

/** 1 tick あたりに見るマス数（watchdog 対策。docs/imp.md 5.3） */
const PER_TICK = 1024;

let working = false;

const tileOf = (v: number): number => Math.floor(v / TILE);
const tileId = (tx: number, ty: number, tz: number): string => `${PREFIX}${tx}_${ty}_${tz}`;

/** 範囲がまたぐ区画の一覧 */
function tilesIn(min: Vector3, max: Vector3): { tx: number; ty: number; tz: number }[] {
  const out: { tx: number; ty: number; tz: number }[] = [];
  for (let tx = tileOf(min.x); tx <= tileOf(max.x); tx++) {
    for (let ty = tileOf(min.y); ty <= tileOf(max.y); ty++) {
      for (let tz = tileOf(min.z); tz <= tileOf(max.z); tz++) {
        out.push({ tx, ty, tz });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 記憶する
function* rememberJob(player: Player, radius: number): Generator<void, void, void> {
  const dim = player.dimension;
  const c = player.location;
  const tiles = tilesIn(
    { x: c.x - radius, y: c.y - radius, z: c.z - radius },
    { x: c.x + radius, y: c.y + radius, z: c.z + radius }
  );
  let saved = 0;
  let failed = 0;

  for (const t of tiles) {
    const from: Vector3 = { x: t.tx * TILE, y: t.ty * TILE, z: t.tz * TILE };
    const to: Vector3 = { x: from.x + TILE - 1, y: from.y + TILE - 1, z: from.z + TILE - 1 };
    const id = tileId(t.tx, t.ty, t.tz);
    try {
      // **同じ名前で撮り直す。** 古い記憶は捨てる
      world.structureManager.delete(id);
    } catch {
      /* 無ければそれでよい */
    }
    try {
      world.structureManager.createFromWorld(id, dim, from, to, {
        saveMode: StructureSaveMode.World,
        includeEntities: false,
      });
      saved++;
    } catch {
      // **読み込まれていない区画は記憶できない。** 近づいて撮り直す
      failed++;
    }
    yield;
  }

  const lines = [`§a記憶した区画 ${saved} / ${tiles.length}`];
  if (failed > 0) lines.push(`§c未読み込みで撮れなかった区画 ${failed}（近づいて撮り直すこと）`);
  player.sendMessage(lines.join("\n"));
}

// ---------------------------------------------------------------- 戻す
/**
 * 指定した範囲を、記憶と見比べて直す。
 *
 * **戻すのは「空になっていた」ところだけ。**
 * 何か置かれているなら、誰かが意図して置いたもの。触らない。
 *
 * **記憶側が守る対象でなければ戻さない。**
 * 羊毛やコアまで戻すと、遊びが成立しなくなる。
 */
export function* repairArea(
  dim: Dimension,
  min: Vector3,
  max: Vector3,
  out: { restored: number; noMemory: number }
): Generator<void, void, void> {
  let seen = 0;

  for (const t of tilesIn(min, max)) {
    const structure = world.structureManager.get(tileId(t.tx, t.ty, t.tz));
    if (structure === undefined) {
      out.noMemory++;
      yield;
      continue;
    }
    const base: Vector3 = { x: t.tx * TILE, y: t.ty * TILE, z: t.tz * TILE };

    // **範囲と区画の重なりだけを見る。** 区画を丸ごと回さない
    const x0 = Math.max(0, Math.floor(min.x) - base.x);
    const x1 = Math.min(TILE - 1, Math.ceil(max.x) - base.x);
    const y0 = Math.max(0, Math.floor(min.y) - base.y);
    const y1 = Math.min(TILE - 1, Math.ceil(max.y) - base.y);
    const z0 = Math.max(0, Math.floor(min.z) - base.z);
    const z1 = Math.min(TILE - 1, Math.ceil(max.z) - base.z);

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (++seen % PER_TICK === 0) yield;
          try {
            const b = dim.getBlock({ x: base.x + x, y: base.y + y, z: base.z + z });
            // **先に世界の側を見る。** 空でなければここで打ち切り。
            // ほとんどの場所はここで終わるので、記憶を読む回数が激減する
            if (b === undefined || !b.isAir) continue;
            const want = structure.getBlockPermutation({ x, y, z });
            if (want === undefined || want.type.id === "minecraft:air") continue;
            if (!isMapBlock(want.type.id)) continue;
            b.setPermutation(want);
            out.restored++;
          } catch {
            /* 読み込まれていない。次の機会に */
          }
        }
      }
      yield;
    }
  }
}

// ---------------------------------------------------------------- 登録
function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

function* manualRepair(dim: Dimension, center: Vector3, radius: number, player: Player): Generator<void, void, void> {
  const out = { restored: 0, noMemory: 0 };
  yield* repairArea(
    dim,
    { x: center.x - radius, y: center.y - radius, z: center.z - radius },
    { x: center.x + radius, y: center.y + radius, z: center.z + radius },
    out
  );
  const msg = out.restored > 0 ? `§6マップを ${out.restored} マス直した` : "§7欠けは無し";
  player.sendMessage(out.noMemory > 0 ? `${msg}\n§c記憶の無い区画 ${out.noMemory}（先に /game:remember）` : msg);
  working = false;
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerRepairCommands(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:remember",
      description: "いまのマップの姿を記憶する（完成してから1回）",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      optionalParameters: [{ name: "radius", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, radius?: number): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const r = Math.max(1, Math.min(256, radius ?? 64));
      system.run(() => {
        system.runJob(rememberJob(player, r));
      });
      return { status: CustomCommandStatus.Success, message: `半径 ${r} を記憶中…` };
    }
  );

  registry.registerCommand(
    {
      name: "game:repair",
      description: "記憶と見比べて、欠けたマップを戻す",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      optionalParameters: [{ name: "radius", type: CustomCommandParamType.Integer }],
    },
    (origin: CustomCommandOrigin, radius?: number): CustomCommandResult => {
      const player = playerOf(origin);
      if (player === undefined) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      if (working) return { status: CustomCommandStatus.Failure, message: "まだ動いている" };
      // **既定を控えめにする。** 広く指定すると本当に重い
      const r = Math.max(1, Math.min(128, radius ?? 24));
      working = true;
      const dim = player.dimension;
      const at = player.location;
      system.run(() => {
        system.runJob(manualRepair(dim, at, r, player));
      });
      return { status: CustomCommandStatus.Success, message: `半径 ${r} を確認中…` };
    }
  );
}
