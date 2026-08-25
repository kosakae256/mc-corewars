/**
 * 発光を手で試す。
 *
 * 仕様は `docs/spec/15-presentation.md` 7-3。
 *
 * ## なぜ要るのか
 *
 * **発光の条件は「敵に 0.5 秒見られ続ける」で、一人では作れない。**
 *
 * 見えないとき、
 *
 * - 条件（角度・時間・距離）に届いていないのか
 * - 差し替えたアイテムが装備できていないのか
 * - attachable が描けていないのか
 *
 * のどれなのかが分からない。**条件を飛ばして最後だけ試せるようにする。**
 *
 * ## 使い方
 *
 *   /game:glow            自分を切り替える
 *   /game:glow <名前>     その人を切り替える
 *
 * **切り替えたあと、条件の見張り（`features/spotting`）が上書きする。**
 * 見られていなければ次の判定（2 tick 後）で消える。
 * だから **`/game:spotlock` で見張りごと止められるようにしてある。**
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Player,
} from "@minecraft/server";

import { isSpotted, setSpotted } from "../cosmetic/index.js";
import { spotLocked, toggleSpotLock } from "./index.js";
import { readout } from "./marker.js";

/** 名前で探す。**大文字小文字は無視する** */
function findPlayer(name: string): Player | undefined {
  const want = name.trim().toLowerCase();
  return world.getAllPlayers().find((p) => p.name.toLowerCase() === want);
}

export function registerSpotCommands(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:glow",
      description: "頭上の表示を手で切り替える（確認用）",
      permissionLevel: CommandPermissionLevel.Admin,
      optionalParameters: [{ name: "player", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, name?: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      const self = e?.typeId === "minecraft:player" ? (e as Player) : undefined;

      system.run(() => {
        const target = name === undefined ? self : findPlayer(name);
        if (target === undefined) {
          self?.sendMessage(name === undefined ? "§cプレイヤーから実行すること" : `§c「${name}」が見つかりません`);
          return;
        }
        const next = !isSpotted(target);
        setSpotted(target, next);
        // **何を試しているのかを出す。** 見えないときに切り分けられるように
        self?.sendMessage(
          `§7${target.name} を §f${next ? "見つかっている" : "見つかっていない"}§7 にした` +
            (spotLocked() ? "" : " §8（/game:spotlock で見張りを止めないと戻ります）")
        );
        // **実際の値も出す。** 数が合わないときに推測で追わせない
        self?.sendMessage(readout(target));
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "game:spotlock",
      description: "視認の自動判定を止める／戻す（確認用）",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      const self = e?.typeId === "minecraft:player" ? (e as Player) : undefined;
      system.run(() => {
        const stopped = toggleSpotLock();
        self?.sendMessage(
          stopped ? "§e発光の自動判定を止めた §7（/game:glow で手で切り替えられます）" : "§a発光の自動判定を戻した"
        );
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
