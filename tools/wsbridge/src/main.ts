/**
 * 起動エントリ。WebSocket サーバーを立てて、Minecraft からの接続を待つ。
 *
 * **接続の向きに注意**: Minecraft 側から繋ぎに来る。
 * こちらを先に起動しておき、ゲーム内で `/wsserver ws://127.0.0.1:8765` を打つ。
 *
 * 仕様: docs/spec/04-ws-llm-chat.md
 * 直接叩かず `node tools/mc.mjs ws start` から起動する。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WebSocketServer } from "ws";

import { Bridge } from "./Bridge.js";
import { parseConfig } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(HERE, "..", "wsbridge.config.json");

const raw: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const config = parseConfig(raw);

const wss = new WebSocketServer({ host: config.server.host, port: config.server.port });

let seq = 0;

wss.on("listening", () => {
  console.log("[wsbridge] 起動しました");
  console.log(`[wsbridge] 待受   : ws://${config.server.host}:${config.server.port}`);
  console.log(`[wsbridge] LLM    : ${config.llm.model} @ ${config.llm.url}`);
  console.log(`[wsbridge] 反応語 : ${config.chat.mention}`);
  console.log("");
  console.log("ゲーム内で次を実行してください:");
  console.log(`  /wsserver ws://127.0.0.1:${config.server.port}`);
});

wss.on("connection", (socket, req) => {
  const label = `mc#${++seq}`;
  console.log(`[wsbridge] 接続: ${label} (${req.socket.remoteAddress})`);
  new Bridge(socket, config, label).start();
});

wss.on("error", (e) => {
  console.error("[wsbridge] サーバーエラー:", e?.message ?? e);
  process.exit(1);
});

const shutdown = () => {
  console.log("[wsbridge] 停止します");
  wss.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
