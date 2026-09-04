/**
 * 手応えと数字の配線。
 *
 * 設計は `docs/spec/12-architecture.md` 2-4。
 *
 * **削る仕事そのものは `services/combat.ts`。**
 * ここは**「毎 tick 赤みを戻す」だけを輪に載せる**——
 * **輪は 1 本**（`docs/imp.md` 10-1）なので、services から自分で回さない。
 */

import type { Feature } from "../../types.js";
import { stepFeedback } from "../../services/feedback.js";
import { dmgTestCommand } from "./command.js";

export const damageSystem: Feature = {
  name: "damage",
  tick: { every: 1, run: stepFeedback },
  commands: [dmgTestCommand],
};
