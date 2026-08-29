/**
 * 機能の一覧。
 *
 * 仕様は `docs/imp.md` 10-3、`docs/spec/11-structure.md`。
 *
 * > **足すときは、ここに 1 行。**
 * > 配線は `main.ts` が回すので、**呼び忘れが起きない。**
 */

import type { Feature } from "./types.js";
import { bow } from "./features/bow/index.js";
import { damageSystem } from "./features/damage/index.js";
import { element } from "./features/element/index.js";
import { hud } from "./features/hud/index.js";
import { mob } from "./features/mob/index.js";

/** 動かすもの。**並びが tick の順番になる**（`loop.ts`） */
export const FEATURES: readonly Feature[] = [damageSystem, element, bow, mob, hud];
