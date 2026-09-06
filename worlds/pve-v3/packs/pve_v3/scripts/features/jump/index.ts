/**
 * 大ジャンプ。**マップの設定で入る**（`02-map.md` 5-0-4）。
 *
 * **中身は `services/jump.ts`。** 効果は 2 秒に 1 度掛け直すだけなので軽い。
 */

import type { Feature } from "../../types.js";
import { stepJump } from "../../services/jump.js";
import { phase } from "../../services/match.js";
import { phaseOf } from "../../services/presence.js";
import { commands } from "./command.js";

export const bigJump: Feature = {
  name: "jump",
  commands,
  tick: {
    every: 5,
    // **戦場に立っている人だけ**
    run: (now) => stepJump(now, (p) => phaseOf(p) === "field" && phase() === "wave"),
  },
};
