/**
 * 戦場を組む。**いまは 1 枚だけ**（`basin`）。
 *
 * 仕様は `worlds/pve-v3/docs/02-map.md` と `spec/14-map-build.md`。
 *
 * ```
 * /pve:buildmap basin ok    0, 0, 0 に組む（**そこにあったものは消える**）
 * ```
 *
 * > ### 一覧は `core/maps.ts`
 * >
 * > **足すのはあちら。** ここは打ち方だけ。
 * > 気に入ったら `/pve:mapsave <名前>` で焼く（`19-map-store.md`）。
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { center, PLACES } from "../../core/places.js";
import { MAPS, mapIds } from "../../core/maps.js";
import { busy, start, step } from "../../services/builder.js";
import { storeCommands } from "./store.js";

function buildCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:mapdraft",
      description: "戦場を組む（**そこにあったものは消える**。`ok` が要る）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [
        { name: "マップ", type: CustomCommandParamType.String },
        { name: "確認", type: CustomCommandParamType.String },
      ],
    },
    (origin: CustomCommandOrigin, id: string, confirm: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const def = MAPS[id.trim().toLowerCase()];
      if (def === undefined) {
        return { status: CustomCommandStatus.Failure, message: `いまあるのは ${mapIds().join(" / ")}` };
      }
      if (confirm.trim().toLowerCase() !== "ok") {
        return { status: CustomCommandStatus.Failure, message: "0,0,0 の周りを全部消して建て直す。よければ ok" };
      }
      if (busy()) {
        return { status: CustomCommandStatus.Failure, message: "いま別のものを組んでいる" };
      }
      const player = e;
      system.run(() => {
        // **先に飛ぶ**——そこが読み込まれていないと組めない
        player.teleport(center(PLACES.field), { rotation: { x: 0, y: 0 } });
        const ops = def.ops();
        start(def.name, ops, { x: 0, y: 0, z: 0 }, player);
        player.sendMessage(`§7${def.name}を組んでいる… §8手順 ${ops.length}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const battlefield: Feature = {
  name: "map",
  commands: [buildCommand, ...storeCommands],
  // **組み立ては 1 か所で回す**（休憩所と共用）
  tick: { every: 1, run: step },
};
