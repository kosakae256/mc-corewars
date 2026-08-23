/**
 * 参加・退出の通知を一瞬だけ止める（spec 05 の 4章）。
 *
 * ## なぜ要るか
 *
 * `SimulatedPlayer` を湧かせると「○○ がゲームに参加しました」が出る。
 * 分身としては致命的だが、**ゲームルールにも通常の API にも抑止手段が無い**
 * （ゲームルール37個を確認済み。`playerJoin` は after イベントでキャンセル不可）。
 *
 * ## どう止めるか
 *
 * BDS 限定で `@minecraft/server-net` のパケットイベントが使える。
 *
 * > npm の型定義は 1.19 系で止まっていて、この API が載っていない。
 * > 実機には存在するので、型は `scripts/types/server-net-packets.d.ts` で補っている。
 * 通知は `TextPacket` で配られるので、**送信を握りつぶす。**
 *
 * ## 乱暴なやり方であることの断り
 *
 * パケットイベントで見えるのは**種類だけで、本文は取れない**。
 * よって「参加通知だけ狙って消す」ことはできず、
 * **その瞬間の `TextPacket` を全部止める**ことになる。
 *
 * だから**窓を極力短くする**。`SUPPRESS_TICKS` の間だけ立てて、すぐ下ろす。
 * 長くすると普通のチャットまで消える。
 */
import { system } from "@minecraft/server";
import { PacketId, beforeEvents } from "@minecraft/server-net";

import { SUPPRESS_TICKS } from "./config.js";

/**
 * 止めている間の入れ子の深さ。
 *
 * 複数人が同時に使うと窓が重なる。
 * 真偽値だと先に終わった方が窓を閉じてしまうので、数で持つ。
 */
let depth = 0;

let subscribed = false;

/** 購読を始める。何度呼んでも1つ */
export function enableQuiet(): void {
  if (subscribed) return;
  subscribed = true;

  beforeEvents.packetSend.subscribe(
    (event) => {
      if (depth > 0) event.cancel = true;
    },
    // **この種類だけ購読する。** 全部受けると無駄に重い
    { monitoredPacketIds: [PacketId.TextPacket] }
  );
}

/**
 * 通知を止めた状態で処理を行う。
 *
 * 分身を出す・戻すのは複数 tick にまたがるので、
 * 呼び出しの後も `SUPPRESS_TICKS` の間は止めたままにする。
 */
export function quietly(action: () => void): void {
  depth++;
  try {
    action();
  } finally {
    // 通知はこの tick の後に流れることがある。少し待ってから窓を閉じる
    system.runTimeout(() => {
      depth = Math.max(0, depth - 1);
    }, SUPPRESS_TICKS);
  }
}
