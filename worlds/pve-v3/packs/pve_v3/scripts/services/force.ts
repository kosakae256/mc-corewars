/**
 * 運営の手当て。**進行を手で押す。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 7-0。
 *
 * > ### 2 つに分ける
 * >
 * > **「敵だけ消したい」と「先に進めたい」は別。**
 * > 殲滅の演出やゲートの色を確かめるときは**前者**、
 * > 何戦も回して次を見たいときは**後者。**
 */

import { clearEnemies } from "./field.js";
import { phase, toPhase } from "./match.js";
import { stopSpawning } from "./spawn.js";

/**
 * そのウェーブの敵を、もう積んだか。
 *
 * > ### ここに置いた理由
 * >
 * > **`features/match` の中に持っていると、外から触れない。**
 * > **手で全滅させたときに「積んだことにする」**必要がある——
 * > そうしないと、10 秒後にまた湧く。
 */
let queued = false;

export function isQueued(): boolean {
  return queued;
}

export function setQueued(value: boolean): void {
  queued = value;
}

/**
 * **いま場に居る敵を消す。** 湧き待ちも止める。
 *
 * **あとは普通の流れ**——殲滅の合図が出て、ゲートが灯る。
 *
 * @returns 消した数
 */
export function killEnemies(): number {
  stopSpawning();
  // **積んだことにする。** でないと 10 秒後にまた湧く
  queued = true;
  return clearEnemies();
}

/**
 * **ウェーブを終わらせる。**
 *
 * 敵を消したうえで、**ポータルまで歩くのを飛ばす。**
 *
 * @returns 終わらせたか（戦場に居なければ false）
 */
export function endWave(now: number): boolean {
  if (phase() !== "wave") return false;
  killEnemies();
  return toPhase("interlude", now);
}
