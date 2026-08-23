/**
 * クライアントと BDS の間に入るプロキシ（段階1: 素通し）。
 *
 * 仕様: docs/spec/06-relay.md
 *
 * ## いまは何もしない
 *
 * **段階1では一切書き換えない。** 素通しで普通に遊べることだけを確かめる。
 * 全員の通信がここを通るので、壊れると全員が落ちる。
 * 先に「通しても壊れない」ことを確定させてから、書き換えに進む。
 *
 * ## 認証の位置
 *
 *   参加者 --(Xbox 認証)--> Relay --(認証なし)--> BDS
 *
 * 認証が BDS から Relay へ移るだけで、参加者の手順は変わらない。
 * そのため **BDS 側は online-mode=false** にしておく必要がある。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bedrock from "bedrock-protocol";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, "relay.config.json"), "utf8"));

const relay = new bedrock.Relay({
  host: "0.0.0.0",
  port: config.port,
  // 参加者はここで Xbox 認証する
  offline: false,
  logging: config.logging,
  destination: {
    host: config.destination.host,
    port: config.destination.port,
    // BDS へは認証なしで繋ぐ（BDS は online-mode=false）
    offline: true,
  },
});

console.log(`[relay] 待受   : 0.0.0.0:${config.port}`);
console.log(`[relay] 転送先 : ${config.destination.host}:${config.destination.port}`);
console.log("[relay] 段階1（素通し）。書き換えは行いません。");

relay.on("connect", (player) => {
  console.log(`[relay] 接続: ${player.connection?.address ?? "?"}`);
  player.on("clientbound", () => {});
  player.on("serverbound", () => {});
});

relay.on("error", (e) => console.error("[relay] エラー:", e));

await relay.listen();
console.log("[relay] 開始しました。");

// 落ちた理由が分かるようにしておく
process.on("uncaughtException", (e) => console.error("[relay] 例外:", e));
process.on("unhandledRejection", (e) => console.error("[relay] 未処理:", e));
