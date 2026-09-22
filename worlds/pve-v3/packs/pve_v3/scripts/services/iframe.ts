/**
 * **バニラの無敵時間を、通り抜ける。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 2-4。
 *
 * > ### 無敵時間そのものは消せない
 * >
 * > **10 tick はエンジンに埋め込まれている。** ビヘイビアからは触れない。
 *
 * > ### **前より大きければ通る**
 * >
 * > 無敵中でも、**前の一撃より大きいダメージなら入る**（ダメージのオーバーフロー）。
 * > **1 → 2 → 3 と増やしていけば、振るたびに通る。**
 * >
 * > **体力は同じ tick で戻す**ので、増えても害はない
 * > （プレイヤーもモブも、バニラの体力は 1000。`entities/*.json`）。
 *
 * **窓が明けたら 1 に戻す**——増え続けないように。
 */

import { system } from "@minecraft/server";

/** バニラの無敵時間（tick） */
const WINDOW = 10;

/**
 * **これ以上は増やさない。**
 *
 * > ### **24 では足りなかった**（実測・2026-09-08）
 * >
 * > **汚染の円は 2 tick ごとに当たる。** **窓（10 tick）が一度も明けない。**
 * > **24 回＝約 2.4 秒で天井に着き、そこから先は全部バニラに弾かれていた。**
 * > **音だけ鳴って、赤くも光らず、画面も揺れない。**
 *
 * **999 まで伸ばした**（2026-09-08 決定）。
 * **バニラの体力は 5000**（`entities/player.json` ほか）なので、
 * **999 を入れても、同じ tick で戻せば足りる。**
 */
const CAP = 999;

/** id → 最後に入れた時刻と量 */
const last = new Map<string, { at: number; amount: number }>();

/**
 * **次に入れる量。**
 *
 * **窓の中なら 1 大きく、外なら 1 から。**
 */
/**
 * @param room **いま入れられる上限**（バニラの体力 − 1）。
 *   **ここを超えると `damage` が通らない**ので、**超える前に窓を待つ。**
 */
export function nextAmount(id: string, room = CAP): number | undefined {
  const now = system.currentTick;
  const prev = last.get(id);
  // > ### **体力の残りが天井になる**（実測・2026-09-08）
  // >
  // > **バニラの体力が 20 しかない相手だと、19 回で頭打ち。**
  // > **2 tick ごとに当たる汚染では、たった 2 秒で止まっていた。**
  // > **`CAP` を 999 に伸ばしても、体力が足りなければ同じ**——**残りで測る。**
  const top = Math.max(1, Math.min(CAP, Math.floor(room)));
  // **窓の外なら 1 から。** ここで必ず通る
  if (prev === undefined || now - prev.at >= WINDOW) {
    last.set(id, { at: now, amount: 1 });
    return 1;
  }
  if (prev.amount >= top) return undefined;
  // > ### **天井では出さない**（2026-09-08 に足した）
  // >
  // > **`CAP` に着いたら、それ以上大きくできない。**
  // > **同じ量ではバニラの無敵時間に弾かれる**ので、出しても何も起きない。
  // > **窓が明けるのを待つ**——**`at` を進めないので、`WINDOW` 経てば 1 に戻る。**
  const amount = prev.amount + 1;
  last.set(id, { at: now, amount });
  return amount;
}

/** 覚えを捨てる。**溜まりすぎないように、たまに呼ぶ** */
export function forgetOld(): void {
  const now = system.currentTick;
  for (const [id, v] of last) {
    if (now - v.at > WINDOW * 4) last.delete(id);
  }
}
