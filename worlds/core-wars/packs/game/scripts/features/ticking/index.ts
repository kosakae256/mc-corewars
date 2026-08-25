/**
 * マップを常時読み込む設定。
 *
 * 仕様は `docs/spec/11-match.md` 9章。
 *
 * ## スクリプトからは作れない
 *
 * `Dimension.runCommand("tickingarea add ...")` は
 * **例外も投げず、`successCount` も返すのに、実際には作られない**
 *（2026-08-25 に実測）。
 *
 * 同じコマンドを**プレイヤーが手で打つと作られる。**
 *
 * だから**張るのは人の仕事**にする。
 * ワールドに保存されるので、**一度打てば済む。**
 *
 * ## ここに残すもの
 *
 * 打つべきコマンドを組み立てて見せるだけ。
 * **座標は `lib/arena.ts` が唯一の正**なので、
 * 手で書き写して食い違うことがないようにする。
 */

import { ARENAS, type Arena, type Box } from "../../lib/arena.js";

/**
 * 1 つのティッキングエリアが覆えるチャンク数の上限。
 *
 * **多すぎると弾かれる。** 余裕を見て 96。
 */
const MAX_CHUNKS = 96;

/** チャンクの大きさ（ブロック） */
const CHUNK = 16;

/**
 * 戦闘範囲を、張れる大きさに切り分ける。
 *
 * ## なぜ島だけでは足りないのか
 *
 * 島だけを張っていた頃は、**島の外が読み込まれていなかった。**
 *
 * ブロックを読めない場所は「何も無い」と同じ扱いになるので、
 * **置かれたものが片付かず、数えるたびに結果が変わる。**
 */
function sweepBoxes(arena: Arena): Box[] {
  const b = arena.bounds;
  const zChunks = Math.ceil((b.max.z - b.min.z + 1) / CHUNK);
  const xPerBox = Math.max(1, Math.floor(MAX_CHUNKS / Math.max(1, zChunks)));
  const width = xPerBox * CHUNK;

  const out: Box[] = [];
  for (let x = b.min.x; x <= b.max.x; x += width) {
    out.push({
      min: { x, y: 0, z: b.min.z },
      max: { x: Math.min(b.max.x, x + width - 1), y: 0, z: b.max.z },
    });
  }
  return out;
}

/**
 * 打つべきコマンドを組み立てる。
 *
 * **y は 0 で渡す。** ティッキングエリアはチャンクの柱を丸ごと読み込むので、
 * 高さに意味は無い。範囲外の y を渡すと弾かれる。
 */
export function tickingAreaCommands(): string[] {
  const out: string[] = [];
  for (const arena of ARENAS) {
    sweepBoxes(arena).forEach((b, i) => {
      out.push(`/tickingarea add ${b.min.x} 0 ${b.min.z} ${b.max.x} 0 ${b.max.z} cw_${arena.id}_${i} true`);
    });
  }
  return out;
}

/**
 * 手順を見せる。
 *
 * **`/game:ticking` から呼ぶ。**
 * 掃除が「読めなかった」と言ったときに、ここを見て打ち直す。
 */
export function showTickingSetup(send: (line: string) => void): void {
  send("§e マップを常時読み込むには、下のコマンドを手で打ってください");
  send("§7 スクリプトからは作れません。§f一度打てばワールドに保存されます");
  for (const line of tickingAreaCommands()) send(`§f${line}`);
  send("§7 確認: §f/tickingarea list§7（見えないときは §f/gamerule sendcommandfeedback true§7）");
}
