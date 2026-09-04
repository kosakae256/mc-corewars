/**
 * 機能の一覧。
 *
 * 仕様は `docs/imp.md` 10-3。
 *
 * > **足すときは、ここに 1 行。**
 * > 配線は `main.ts` が回すので、**呼び忘れが起きない。**
 *
 * **いまは動作確認だけ。** 中身は企画が決まった順に足す
 *（`worlds/pve-v2/docs/00-concept.md`）。
 */

import type { Feature } from "./types.js";
import { bow } from "./features/bow/index.js";
import { damageSystem } from "./features/damage/index.js";
import { element } from "./features/element/index.js";
import { enchant } from "./features/enchant/index.js";
import { glow } from "./features/glow/index.js";
import { hud } from "./features/hud/index.js";
import { mob } from "./features/mob/index.js";
import { ping } from "./features/ping/index.js";
import { portal } from "./features/portal/index.js";
import { sheet } from "./features/sheet/index.js";
import { swing } from "./features/swing/index.js";
import { map } from "./features/map/index.js";
import { aura, status } from "./features/status/index.js";

/** 動かすもの。**並びが tick の順番になる**（`loop.ts`） */
export const FEATURES: readonly Feature[] = [
  damageSystem,
  element,
  enchant,
  status,
  aura,
  bow,
  mob,
  glow,
  map,
  portal,
  hud,
  sheet,
  swing,
  ping,
];
