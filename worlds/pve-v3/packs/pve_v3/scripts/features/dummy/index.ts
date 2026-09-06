/**
 * 訓練用のカカシ。**殴っても倒れない的。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/23-enemy-unit.md` 1-1。
 *
 * ```
 * /pve:dummy         足元に 1 体置く
 * /pve:dummy true    全部消す
 * ```
 *
 * **中身は `services/dummy.ts`。ここは輪に載せるだけ**（運営メニューからも呼ぶため）。
 */

import type { Feature } from "../../types.js";
import { stepDummies } from "../../services/dummy.js";
import { commands } from "./command.js";

export const dummy: Feature = {
  name: "dummy",
  commands,
  // **10 tick に 1 回で足りる**——倒れないことが分かればよい
  tick: { every: 10, run: stepDummies },
};
