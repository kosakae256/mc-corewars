/**
 * 最大人数を上げる。
 *
 * 仕様は `docs/01-rules.md` 3-C。
 *
 * > ### 既定のままだと入れない人が出る
 * >
 * > ホストしたワールドの上限は既定で小さい。
 * > **20 人まで入れるようにする**——毎回手で `/setmaxplayers` を打たない。
 *
 * ## なぜ少し待つのか
 *
 * **起動直後はコマンドが通らないことがある**（ワールドがまだ立ち上がりきっていない）。
 * **2 秒待ってから 1 度だけ**送る。
 *
 * **トップレベルから呼ぶこと**——`worldLoad` に置くと `/reload` で走らない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */

import { system, world } from "@minecraft/server";

/** 何人まで入れるか */
const MAX = 20;

/** 送るまでの待ち（tick）。**2 秒** */
const WAIT = 40;

export function startMaxPlayers(): void {
  system.runTimeout(() => {
    try {
      world.getDimension("overworld").runCommand(`setmaxplayers ${MAX}`);
    } catch (err) {
      // **失敗しても遊びは続く。** ログにだけ残す
      console.warn(`[game] setmaxplayers ${MAX} に失敗: ${String(err)}`);
    }
  }, WAIT);
}
