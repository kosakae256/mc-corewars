/**
 * 暗転を回す。**中身は `services/dark.ts`。**
 *
 * **毎 tick 掛け直す**だけの薄い機能。
 * 暗くしたい側は `want()` / `done()` を呼ぶだけでよい。
 */

import type { Feature } from "../../types.js";
import { tick } from "../../services/dark.js";

export const darkness: Feature = {
  name: "dark",
  tick: { every: 1, run: () => tick() },
};
