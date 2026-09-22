/**
 * 機能の一覧（`docs/imp.md` 10-3）。**足すときは、ここに 1 行。** 並びが tick の順番になる（`loop.ts`）。
 */

import type { Feature } from "./types.js";
import { admin } from "./features/admin/index.js";
import { quiz } from "./features/quiz/index.js";
import { build } from "./features/build/index.js";
import { answer } from "./features/answer/index.js";
import { hud } from "./features/hud/index.js";
import { flight } from "./features/flight/index.js";
import { border } from "./features/border/index.js";
import { dash } from "./features/dash/index.js";
import { setter } from "./features/setter/index.js";
import { rules } from "./features/rules/index.js";
import { board } from "./features/board/index.js";
import { health } from "./features/health/index.js";

export const FEATURES: readonly Feature[] = [
  admin, // /quiz:start /quiz:stop
  quiz, // bridge からの受信（scriptevent）
  build, // 置く（毎 tick）
  answer, // 答え合わせ・時計（20 tick）
  hud, // 表示（10 tick）
  flight, // 常時飛行（参加時に 1 回）
  border, // 行動範囲（2 tick）
  dash, // 羽のダッシュ（100 tick）
  setter, // 出題モード: ボタン→UI→キュー、キューの板（10 tick）
  rules, // サイドバーの現在のルール（20 tick）
  board, // 累計のランキング板（20 tick）
  health, // 体力を常に 1 に（10 tick）
];
