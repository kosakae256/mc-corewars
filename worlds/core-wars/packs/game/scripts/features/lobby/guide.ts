/**
 * 説明板。**遊び方の絵を、壁として建てる。**
 *
 * 仕様は `docs/spec/15-presentation.md` 1-B。
 *
 * ## なぜ絵画をやめたのか
 *
 * **サバイバルで壊せた**（2026-08-25）。
 *
 * 絵画は実体なので、ブロックの保護が届かない。
 * ダメージを打ち消す形で守ったが、**それを通らずに消える経路があった。**
 *
 * | 試したこと | 結果 |
 * | --- | --- |
 * | ダメージを打ち消す | **効かない** |
 * | 実体の削除を打ち消す | **打ち消せない**（そういう仕組みが無い） |
 * | 絵画の定義を差し替える | **バニラに定義が無い** |
 *
 * **ブロックなら掘れなくできる。** 遊ぶ人に壊されようが無い。
 *
 * ## 1 つの種類を、状態で出し分ける
 *
 * 絵を 8 × 4 に切って、**タイルごとに違う面を出す。**
 * 種類を 32 個作るのではなく、**状態で出し分ける。**
 *
 * **状態は 2 つに割る**（列と行）。
 * 1 つの状態に持てる値は**16 個まで**で、32 個は入らない。
 *
 * ## 置くのはコマンドから
 *
 * 32 枚を手で並べるのは現実的でない。
 * **立っている場所と向きから、一息に建てる。**
 */

import {
  BlockPermutation,
  CommandPermissionLevel,
  CustomCommandStatus,
  system,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Player,
  type Vector3,
} from "@minecraft/server";

import { isOp } from "../../lib/op.js";

/** 説明板のブロック */
const BLOCK = "game:guide";

/**
 * 状態の名前。**2 つに割ってある。**
 *
 * 1 つの状態に 32 個の値を並べていたが、**上限は 16**（2026-08-25 修正）。
 * 超えると**定義ごと読み込まれない**——置こうとしても何も起きなかった。
 */
const STATE_COL = "game:col";
const STATE_ROW = "game:row";

/**
 * 横に何枚・縦に何枚。
 *
 * **4 × 2**（2026-08-25 変更）。絵画のときと同じ大きさに合わせた。
 * 1 枚あたりを大きくして（256 × 256）、枚数を減らしても読める。
 */
const COLS = 4;
const ROWS = 2;

/** 建てる場所を、立っている所からどれだけ前にするか（マス） */
const AHEAD = 3;

/** 足元からどれだけ上に建て始めるか（マス） */
const BOTTOM = 1;

/** 向き（東西南北）に丸める */
function cardinal(yaw: number): { fx: number; fz: number; rx: number; rz: number } {
  // **見ている向きを 4 方向に丸める。** 斜めに建てられない
  const y = ((yaw % 360) + 360) % 360;
  if (y < 45 || y >= 315) return { fx: 0, fz: 1, rx: -1, rz: 0 };
  if (y < 135) return { fx: -1, fz: 0, rx: 0, rz: -1 };
  if (y < 225) return { fx: 0, fz: -1, rx: 1, rz: 0 };
  return { fx: 1, fz: 0, rx: 0, rz: 1 };
}

/**
 * 建てる。
 *
 * **立っている場所の前に、見ている向きへ正対して並べる。**
 * 左上が 0 番、右下が 31 番。
 */
function build(player: Player): string {
  let at: Vector3;
  let yaw = 0;
  try {
    at = player.location;
    yaw = player.getRotation().y;
  } catch {
    return "§c建てられませんでした";
  }

  const d = cardinal(yaw);
  const dim = player.dimension;
  const originX = Math.floor(at.x) + d.fx * AHEAD;
  const originZ = Math.floor(at.z) + d.fz * AHEAD;
  const originY = Math.floor(at.y) + BOTTOM;

  let placed = 0;
  let why = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // **左上から並べる。** 見る側から見て左が 0 列目になるように
      const off = c - Math.floor(COLS / 2);
      const x = originX + d.rx * off;
      const z = originZ + d.rz * off;
      const y = originY + (ROWS - 1 - r);
      try {
        dim.setBlockPermutation({ x, y, z }, BlockPermutation.resolve(BLOCK, { [STATE_COL]: c, [STATE_ROW]: r }));
        placed++;
      } catch (e) {
        // **黙って諦めない。** 置けない理由が分からないと直しようが無い
        if (why === "") why = String(e);
      }
    }
  }
  return placed === COLS * ROWS
    ? `§a説明板を建てた §7(${placed} マス)`
    : `§e一部だけ建った §7(${placed}/${COLS * ROWS})`;
}

/**
 * 建てるコマンド。
 *
 * **トップレベルの `startup` から呼ぶこと。**
 * **運営だけ。** 遊ぶ人が建てるものではない。
 */
export function registerGuideCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:guide",
      description: "遊び方の説明板を建てる（運営のみ）",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e as Player;
      if (!isOp(player)) {
        return { status: CustomCommandStatus.Failure, message: "運営だけが使えます" };
      }
      system.run(() => player.sendMessage(build(player)));
      return { status: CustomCommandStatus.Success };
    }
  );
}
