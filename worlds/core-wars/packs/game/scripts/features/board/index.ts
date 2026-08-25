/**
 * ロビーの掲示板。
 *
 * 仕様は `docs/spec/15-presentation.md` 4-6。
 *
 * ## 何を出すか
 *
 * **前回の試合の、部門ごとの 1 位。**
 * チャットに流す戦績（4-4）と同じ部門を並べる。
 *
 * ## なぜ空中に浮かせるのか
 *
 * **看板では入らない。** 4 行しか書けず、色も付かない。
 * ブロックで文字を作る手も採らない——直すたびに建て直すことになる。
 *
 * `DebugText` なら**壁越しに描け、遠くから読め、
 * 書き換えるのは文字列の差し替えだけ。**
 * 頭上の表示（`features/spotting/marker.ts`）と同じ仕組み。
 *
 * ## 向きは固定する（2026-08-25 変更）
 *
 * **`x, z = 0, 0` の方を向いたまま動かない。**
 *
 * カメラ追従にしていたが、**板ではなくついて回る文字**になっていた。
 * 掲示板はそこに掛かっているもので、近づくと向きが変わるのでは掛かって見えない。
 *
 * ## 箱は 1 つ（2026-08-25 変更）
 *
 * 行ごとに 1 つ作っていたので、**板が行数ぶん並んでいた。**
 * 間隔も自分で決めることになり、詰まったり離れたりする。
 *
 * **改行を含めた 1 つの文字列**にすれば、間隔は向こうが決める。
 */

import { system, world, type RGBA } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import { BOARD_AT, BOARD_YAW } from "../../lib/lobby.js";
import { lastAwards, type Award } from "../../lib/stats.js";
import type { Team } from "../../lib/match-state.js";

/** 見張る間隔（tick）。**1 秒。** 中身が変わるのは試合の終わりだけ */
const INTERVAL = 20;

/** どこまで見えるか（マス） */
const RENDER_DISTANCE = 96;

/** 地の色 */
const COLOR: RGBA = { red: 1, green: 1, blue: 1, alpha: 1 };

/** チームの色記号 */
const TAG: Readonly<Record<Team, string>> = { red: "§c", blue: "§9" };

/** いま出している板。**メモリだけ。** `/reload` では作り直す */
let shown: DebugText | undefined;

/** いま出している中身の見分け。**変わったときだけ作り直す** */
let signature = "";

/**
 * 1 行ぶんの文字列。
 *
 * **空白で頭をそろえたりしない**（2026-08-25 変更）。
 * 字の幅が等幅ではないので、**数えて埋めてもそろわない。**
 * そろえたつもりの空白だけが残る。
 */
function lineOf(a: Award): string {
  const tag = a.team === "red" || a.team === "blue" ? TAG[a.team] : "§f";
  return `§e${a.title}  ${tag}${a.name}  §7${a.value}`;
}

/**
 * 出す中身を組む。
 *
 * **何も無いときも黙らない。**
 * 空だと、壊れているのか、まだ 1 試合も終わっていないのかが分からない。
 */
function text(): string {
  const awards = lastAwards();
  if (awards.length === 0) return "§6§l前回の記録\n§7まだ試合が終わっていません";
  return ["§6§l前回の記録", "", ...awards.map(lineOf)].join("\n");
}

/** 出しているものを消す */
function clear(): void {
  if (shown === undefined) return;
  try {
    debugDrawer.removeShape(shown);
  } catch {
    /* 既に消えている */
  }
  shown = undefined;
}

/** 描き直す */
function draw(body: string): void {
  clear();
  try {
    const shape = new DebugText(BOARD_AT, body);
    // ---- **向きを固定する**（docs/spec/15-presentation.md 4-6）
    //
    // 立てないとカメラに追従する。**掛かっている板にしたい**
    shape.useRotation = true;
    shape.rotation = { x: 0, y: BOARD_YAW, z: 0 };
    // **壁越しに描く。** 既定でこちらだが、意図として書いておく
    shape.depthTest = false;
    shape.color = COLOR;
    shape.maximumRenderDistance = RENDER_DISTANCE;
    debugDrawer.addShape(shape, world.getDimension("overworld"));
    shown = shape;
  } catch {
    /* 読み込まれていない。次の機会に */
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startBoard(): void {
  system.runInterval(() => {
    const body = text();
    // **同じなら触らない。** 毎秒作り直すと点滅する
    if (body === signature && shown !== undefined) return;
    signature = body;
    draw(body);
  }, INTERVAL);
}

/** その場で作り直す。**掲示板が消えたときの逃げ道** */
export function refreshBoard(): void {
  signature = "";
}
