/**
 * 累計のランキング板（`docs/spec/17-modes.md` 7 章）。
 *
 * (67, 2, 0) の空中に、累計正解の上位 10 人を出す。core-wars のロビーの掲示板と同じ仕組み（`services/floating.ts`）。
 * 1 秒ごとに見て、変わったときだけ書き換える。抜けている人も出る（scoreboard に残る）。
 */

import { system, world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { BOARD_AT } from "../../core/box.js";
import { MSG } from "../../lib/format.js";
import { rememberName, totalRanking } from "../../state/score.js";
import { FloatingText } from "../../services/floating.js";

const TOP = 10;
/** +z 側にあり、中心（−z）を向く。`DebugText` の yaw は −z が 0（research 11 の 6 章の表。x=67 時代は −x で 90） */
const YAW = 0;
const RENDER_DISTANCE = 96;

const sign = new FloatingText(BOARD_AT, YAW, RENDER_DISTANCE);

function text(): string {
  const rows = totalRanking(TOP);
  if (rows.length === 0) return `${MSG.boardTitle}\n${MSG.boardEmpty}`;
  return [MSG.boardTitle, "", ...rows.map((r, i) => MSG.boardLine(i + 1, r.name, r.score))].join("\n");
}

/** 参加した人の名前を覚える（抜けたあとも板に名前で出すため。17-modes 7 章） */
function subscribe(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => system.run(() => rememberName(ev.player)));
  system.run(() => {
    for (const p of world.getAllPlayers()) rememberName(p);
  });
}

function tick(): void {
  sign.set(text());
}

export const board: Feature = { name: "board", subscribe, tick: { every: 20, run: tick } };
