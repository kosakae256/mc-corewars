/**
 * 画面に出すもの。**配線だけ。**
 *
 * 仕様は `docs/spec/12-hud.md`。
 *
 * | 何 | どこ | 中身 |
 * | --- | --- | --- |
 * | モブの名札 | 全員に見える | [nameplate.ts](nameplate.ts) |
 * | 自分の画面 | 本人だけ | [own.ts](own.ts) |
 * | 狙っている敵 | — | [focus.ts](focus.ts) |
 * | デバッグ | — | [debug.ts](debug.ts) |
 *
 * **入ったダメージの数字は出さない**（`docs/spec/12-hud.md` 4 章）。
 */

import { world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { has } from "../../state/hp.js";
import { debugCommand } from "./debug.js";
import { updateNameplates } from "./nameplate.js";
import { hideHearts, showOwn } from "./own.js";

/** 何 tick ごとに書き直すか。**毎 tick 書くと文字が点滅する** */
const WRITE = 2;

/** ハートを消し直す間隔（tick）。**5 秒**（再入場や `/reload` で戻る） */
const HIDE = 100;

function subscribe(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => {
    hideHearts(ev.player);
  });
}

export const hud: Feature = {
  name: "hud",
  subscribe,
  commands: [debugCommand],
  tick: {
    every: 1,
    run: (now) => {
      if (now % WRITE === 0) {
        for (const p of world.getAllPlayers()) {
          if (has(p)) showOwn(p, now);
        }
        updateNameplates();
      }
      if (now % HIDE === 0) {
        for (const p of world.getAllPlayers()) hideHearts(p);
      }
    },
  },
};
