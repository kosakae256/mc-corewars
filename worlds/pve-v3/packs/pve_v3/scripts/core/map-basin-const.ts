/**
 * 岩山の窪地——**数だけ。**
 *
 * > ### 定数をここに出した理由（2026-09-05）
 * >
 * > 地形（`map-basin.ts`）と決まった場所（`map-basin-spots.ts`）が
 * > **互いを読み合っていた。**
 * > **読み込みの途中で定数が空のまま使われ、`DAIS` が NaN になった。**
 * >
 * > **数はどちらにも属さない口に置く。** これで輪が切れる。
 */

import { FIELD, GATE } from "./places.js";

/** 端。**x・z とも −50 〜 +50**（`spec/14-map-build.md` 0-1） */
export const HALF = FIELD.half;

/** 掘り抜く外側。**空を通すために、マップより少し広く取る** */
export const CLEAR = 64;
export const CLEAR_TOP = 150;

/** 中央の高さ。**足場の天面**（全マップ共通・**y ＝ 0**） */
export const GROUND = FIELD.groundY;

/** 地形の底。**ここに岩盤を敷く** */
export const BOTTOM = FIELD.bottomY;

/** 湧く所とポータル。**全マップ共通** */
export const SPAWN_Z = FIELD.spawnZ;
// **ゲートの面は z ＝ 39**（`20-portal.md` 0-1）。**到達したと見なすのは手前の +40**
export const PORTAL_Z = GATE.z;

/** 崖が始まる隔たりと、崖の天面（0-4） */
export const WALL_D = 38;
export const WALL_TOP = GROUND + 26;

/** 壇の高さ */
export const DAIS = GROUND + 4;

/** 種。**変えれば別の凹凸になる** */
export const SEED = 1337;
