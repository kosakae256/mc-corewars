/**
 * 機能の一覧。
 *
 * 仕様は `docs/imp.md` 10-3。
 *
 * > **足すときは、ここに 1 行。**
 * > 配線は `main.ts` が回すので、**呼び忘れが起きない。**
 *
 * **v2 から持ってきたのは 5 つ**——**ダメージ・弓・確認用のモブ・ネザーゲート（飾り）・HP 表示。**
 * 企画が決まった順に足す。
 */

import type { Feature } from "./types.js";
import { battlefield } from "./features/map/index.js";
import { boss } from "./features/boss/index.js";
import { bow } from "./features/bow/index.js";
import { growth } from "./features/growth/index.js";
import { damageSystem } from "./features/damage/index.js";
import { devTools } from "./features/devtools/index.js";
import { mob } from "./features/mob/index.js";
import { hud } from "./features/hud/index.js";
import { matchFlow } from "./features/match/index.js";
import { portal } from "./features/portal/index.js";
import { rest } from "./features/rest/index.js";
import { role } from "./features/role/index.js";
import { shop } from "./features/shop/index.js";

/** 動かすもの。**並びが tick の順番になる**（`loop.ts`） */
export const FEATURES: readonly Feature[] = [
  matchFlow,
  damageSystem,
  growth,
  bow,
  mob,
  boss,
  portal,
  rest,
  role,
  battlefield,
  shop,
  devTools,
  hud,
];
