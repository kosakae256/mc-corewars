/**
 * TNT は置いた瞬間に着火する。
 *
 * 仕様は `docs/03-content.md` 1-4。
 *
 * ## なぜそうするのか
 *
 * **置いてから火を点ける手順を挟むと、戦闘中に使えない。**
 * 火打石を別に買わせるのも、持ち物の枠を 1 つ潰すだけで面白くならない。
 *
 * **置いた = 投げた**にすれば、TNT は「時間差の攻撃」という
 * 分かりやすい 1 つの道具になる。
 *
 * ## 置いたブロックとして残らない
 *
 * 一瞬でブロックでなくなるので、後片付けの対象にならない。
 * 消し忘れの心配が無い。
 */

import { system, world } from "@minecraft/server";

import { ARENAS, inBox } from "../../lib/arena.js";

/** 置かれたときに着火するブロック */
const TNT_BLOCK = "minecraft:tnt";

/** 着火した TNT の実体。**ブロックと同じ名前だが別物** */
const TNT_ENTITY = "minecraft:tnt";

/** 拠点に入り込んだ TNT を探す間隔（tick） */
const SWEEP = 5;

/**
 * 拠点の中か。
 *
 * **ブロックを置けない範囲**をそのまま使う
 *（`docs/spec/11-match.md` 6-G）。
 * 別に持つと必ずずれる。
 */
function inNoBuild(at: { x: number; y: number; z: number }): boolean {
  for (const arena of ARENAS) {
    for (const box of arena.noBuild) if (inBox(box, at)) return true;
  }
  return false;
}

/**
 * 拠点に入り込んだ TNT を消す。
 *
 * ## なぜ要るのか
 *
 * **置けなくても、投げ込める。**
 * 拠点の外で着火して、爆風や坂で転がり込ませることができる。
 *
 * 拠点は**置けない場所**として守っているのに、
 * 爆破だけ通ってしまうと、守っている意味が無くなる。
 *
 * **消すのは実体だけ。** 拠点の外で爆発するぶんには何も起きない。
 */
export function startTntGuard(): void {
  system.runInterval(() => {
    for (const arena of ARENAS) {
      const dim = world.getDimension("overworld");
      for (const box of arena.noBuild) {
        const mid = {
          x: (box.min.x + box.max.x) / 2,
          y: (box.min.y + box.max.y) / 2,
          z: (box.min.z + box.max.z) / 2,
        };
        let found;
        try {
          found = dim.getEntities({
            type: TNT_ENTITY,
            location: mid,
            maxDistance: Math.hypot(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 2 + 2,
          });
        } catch {
          continue;
        }
        for (const e of found) {
          if (!inNoBuild(e.location)) continue;
          try {
            e.remove();
          } catch {
            /* 既に消えている */
          }
        }
      }
    }
  }, SWEEP);
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function registerTntFuse(): void {
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    if (ev.block.typeId !== TNT_BLOCK) return;
    const dim = ev.dimension;
    const at = { x: ev.block.x, y: ev.block.y, z: ev.block.z };
    system.run(() => {
      try {
        dim.setBlockType(at, "minecraft:air");
        // **ブロックの真ん中に湧かす。** 角に置くと隣のマスへずれる
        dim.spawnEntity(TNT_ENTITY, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
      } catch {
        // 読み込まれていない、など。**ブロックのまま残る**だけで害は無い
      }
    });
  });
}
