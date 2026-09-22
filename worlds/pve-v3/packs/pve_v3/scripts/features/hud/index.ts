/**
 * 画面に出すもの。**配線だけ。**
 *
 * | 何 | どこ | 中身 |
 * | --- | --- | --- |
 * | モブ・味方の名札 | 全員に見える | [nameplate.ts](nameplate.ts) |
 * | 自分の画面 | 本人だけ | [own.ts](own.ts) |
 * | 狙っている敵 | — | [focus.ts](focus.ts) |
 *
 * **バニラのハートは消す**——**削られるのは独自 HP のほう**なので、
 * 出しっぱなしだと**減らないハート**が並んで嘘になる。
 */

import { world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { has } from "../../state/hp.js";
import { phase } from "../../services/match.js";
import { updateFoePlates } from "./foeplate.js";
import { updateNameplates } from "./nameplate.js";
import { forgetOwn, hideHearts, showFocus, showOwn } from "./own.js";

/** 何 tick ごとに書き直すか。**毎 tick 書くと文字が点滅する** */
const WRITE = 2;

/** ハートを消し直す間隔（tick）。**5 秒**（再入場や `/reload` で戻る） */
const HIDE = 100;

function subscribe(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => {
    forgetOwn(ev.player.id);
    hideHearts(ev.player);
  });
  world.afterEvents.playerLeave.subscribe((ev) => forgetOwn(ev.playerId));
}

export const hud: Feature = {
  name: "hud",
  subscribe,
  tick: {
    every: 1,
    run: (now) => {
      // HP・通貨は常時表示。建築道具の通知を妨げないよう、狙った敵の欄だけ試合中にする。
      const playing = phase() !== "idle" && phase() !== "build";
      if (now % WRITE === 0) {
        for (const p of world.getAllPlayers()) {
          if (has(p)) showOwn(p, now);
          if (playing && has(p)) showFocus(p, now);
        }
        updateNameplates();
        // **敵は人ごとに見せ先を選ぶ**（`10-implementation.md` 8-1）
        updateFoePlates();
      }
      if (now % HIDE === 0) {
        for (const p of world.getAllPlayers()) hideHearts(p);
      }
    },
  },
};
