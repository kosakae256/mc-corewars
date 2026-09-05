/**
 * ロビーの進捗ボード。
 *
 * 中身は `worlds/pve-v3/docs/05-progress.md`（表は `core/progress.ts`）。
 *
 * > ### 出しっぱなしにする
 * >
 * > **試合の状態に関係なく、いつでも掛かっている。**
 * > 中身が変わるのは**こちらが表を直したとき**だけなので、
 * > **同じなら描き直さない**（毎周期作り直すと点滅する）。
 */

import { world } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import type { Feature } from "../../types.js";
import { boardText } from "../../core/progress.js";

/** 掛ける場所（ロビー） */
const AT = { x: 1248, y: 15, z: 711 };

/** どこまで見えるか（マス） */
const RENDER_DISTANCE = 64;

/** いま出しているもの */
let shown: DebugText | undefined;

/** いま出している中身の見分け */
let signature = "";

function clear(): void {
  if (shown === undefined) return;
  try {
    debugDrawer.removeShape(shown);
  } catch {
    /* 既に消えている */
  }
  shown = undefined;
}

function draw(body: string): void {
  clear();
  try {
    const shape = new DebugText(AT, body);
    // **向きを固定する。** 立てないとカメラに追従して、掛かって見えない
    shape.useRotation = true;
    shape.rotation = { x: 0, y: 0, z: 0 };
    shape.depthTest = false;
    shape.color = { red: 1, green: 1, blue: 1, alpha: 1 };
    shape.maximumRenderDistance = RENDER_DISTANCE;
    debugDrawer.addShape(shape, world.getDimension("overworld"));
    shown = shape;
  } catch {
    /* 読み込まれていない。次の機会に */
  }
}

function tick(): void {
  const body = boardText();
  // **同じなら触らない**
  if (body === signature && shown !== undefined) return;
  signature = body;
  draw(body);
}

export const progress: Feature = {
  name: "progress",
  // **1 秒に 1 回で足りる**（変わるのは書き換えたときだけ）
  tick: { every: 20, run: tick },
};
