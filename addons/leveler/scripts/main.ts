import { system } from "@minecraft/server";

import {
  enableCloneItems,
  enablePlayerPunch,
  registerLevelerCommands,
  registerLevelerTest,
} from "./features/leveler/index.js";

/**
 * leveler — SimulatedPlayer による整地ボット。
 *
 * 仕様: docs/spec/03-terrain-leveling.md
 * 調査: docs/research/05-simulated-player.md
 *
 * 使い方:
 *   /gametest run leveler:start   ボットを呼び出す
 *   /level:scan <半径>             走査だけ
 *   /level:go <半径>               整地する
 *   /level:stop                    中止
 *   /level:dismiss                 退場
 *
 * 前提:
 *   - ワールドで「Beta APIs」を有効にすること
 *     （@minecraft/server-gametest は beta のみ）
 *
 * ここは配線だけ。ロジックは features 以下に置く（docs/imp.md 2章）。
 */

// GameTest の登録は early execution で行う
registerLevelerTest();

system.beforeEvents.startup.subscribe((init) => {
  registerLevelerCommands(init);
});

// 人間のプレイヤーの殴りにも手応えを足す（spec 3-A-8）
enablePlayerPunch();

// スキン複製の検証（調査用 / docs/research/07-player-skin-clone.md）。
// **アイテム操作なので /reload だけで反映される**
enableCloneItems();
