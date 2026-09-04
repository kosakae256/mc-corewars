/**
 * 休憩所の設計図。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/14-map-build.md` 6 章。
 *
 * > ### クォーツとガラスの神殿（2026-09-04 決定）
 * >
 * > **砂岩はやめた。** 白いクォーツと淡いガラス、明かりは海のランタンと端の棒。
 * > **左右対称にしない**——入口は広く低く、ポータル側は狭く高く。
 *
 * ```
 * core/build.ts         箱・円・輪を塗る部品
 * core/rest-shaft.ts    外殻（すり鉢状に空へ開く）
 * core/rest-temple.ts   中身（床・列柱・中央の光・置き物）
 * ここ                   その 2 つを繋ぐ
 * ```
 *
 * **床は y ＝ 0。** 地表は 60 マス以上上なので、
 * **上へ行くほど広がる段丘**で抜いて、井戸に見えないようにする。
 */

import type { BuildOp } from "./build.js";
import { decorOps } from "./rest-decor.js";
import { gateOps } from "./rest-gate.js";
import { shaftOps } from "./rest-shaft.js";
import { RADIUS, templeOps } from "./rest-temple.js";

export { volumeOf, type BuildOp } from "./build.js";
export { RADIUS } from "./rest-temple.js";

/** 床の高さ。**指定どおり y ＝ 0** */
export const FLOOR = 0;

/** 円の中心（立つ所から見た奥行き）。**立つ所は円の手前の縁** */
export const CENTER_Z = RADIUS;

/** 組む手順。**外殻 → 中身 → 装飾の順** */
export function restOps(): BuildOp[] {
  return [...shaftOps(CENTER_Z), ...templeOps(CENTER_Z), ...decorOps(CENTER_Z), ...gateOps(CENTER_Z)];
}
