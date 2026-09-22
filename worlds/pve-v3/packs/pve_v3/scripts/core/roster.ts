/**
 * **敵と軍団の表。** データだけ。
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md` と `docs/08-enemy-power.md`。
 *
 * > ### ここは「値」だけ置く
 * >
 * > **計算は `core/enemy.ts`。** **見た目は `entities/<id>.json`。**
 * > **1 体足すときは、ここに 1 行足して `node tools/pve3-newmob.mjs <id> --look <バニラ>` を叩く。**
 */

import { STAR1 } from "./roster/star1.js";
import { STAR2 } from "./roster/star2.js";
import { STAR3 } from "./roster/star3.js";
import { STAR4 } from "./roster/star4.js";
import { STAR5 } from "./roster/star5.js";
import type { EnemyDef } from "./enemy.js";

/**
 * 敵の一覧。**★ごとのファイルを 1 つに束ねるだけ。**
 *
 * > ### **中身はここに書かない**（2026-09-08）
 * >
 * > **敵は `core/roster/star1.ts` 〜 `star5.ts` に、★ごとに置く。**
 * > **1 ファイル 300 行という決まりがあり、50 体は 1 枚に入らない。**
 * > **★ごとに分ければ、別の★を足す人と手がぶつからない。**
 */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  ...STAR1,
  ...STAR2,
  ...STAR3,
  ...STAR4,
  ...STAR5,
};

export { DEFAULT_LEGION, LEGIONS } from "./roster/legion.js";
