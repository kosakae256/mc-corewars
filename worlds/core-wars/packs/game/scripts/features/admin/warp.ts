/**
 * マップ移動。
 *
 * 仕様は `docs/spec/15-presentation.md`（ロビー）。
 *
 * ## なぜ要るのか
 *
 * ロビーは戦場から離れた場所にある（x 0 と x 1000）。
 * **歩いて行ける距離ではない。**
 *
 * 運営はマップを直しに行き来するので、
 * **一発で飛べないと仕事にならない。**
 *
 * ## 座標は持たない
 *
 * 行き先は `lib/arena.ts` と `lib/lobby.ts` から組み立てる。
 * **マップを直したら、こちらは何もしなくても付いてくる。**
 */

import { system, type Player, type Vector3 } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { ARENAS } from "../../lib/arena.js";
import { lobbyPoint } from "../../lib/lobby.js";

interface Spot {
  readonly name: string;
  readonly at: Vector3;
}

/** 行き先。**上から順に並ぶ** */
function spots(): Spot[] {
  const a = ARENAS[0];
  return [
    { name: "§fロビー", at: lobbyPoint() },
    // **中央は上空。** 建物の中に埋まらない
    { name: "§e中央（上空）", at: a.celebration },
    { name: "§9青の拠点", at: a.spawns.blue },
    { name: "§c赤の拠点", at: a.spawns.red },
    { name: "§9青のコア", at: above(a.cores.blue) },
    { name: "§c赤のコア", at: above(a.cores.red) },
  ];
}

/** コアの真上。**中に埋まらないように 2 マス上げる** */
function above(at: Vector3): Vector3 {
  return { x: at.x + 0.5, y: at.y + 2, z: at.z + 0.5 };
}

/** 行き先を選ばせる */
export function showWarp(player: Player): void {
  const list = spots();
  const form = new ActionFormData().title("マップ移動").body("§7飛び先を選んでください");
  for (const s of list) form.button(s.name);

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      const spot = list[res.selection];
      if (spot === undefined) return;
      system.run(() => {
        try {
          player.teleport(spot.at, { dimension: player.dimension });
          player.sendMessage(`§7${spot.name}§7 へ移動しました`);
        } catch {
          player.sendMessage("§c移動できませんでした（読み込まれていない）");
        }
      });
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}
