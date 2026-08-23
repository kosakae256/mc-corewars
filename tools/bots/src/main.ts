/**
 * 起動エントリ。設定を読み、マネージャを立て、初期ボットを接続する。
 *
 * ここは配線だけ。ロジックは BotManager 以下に置く（docs/imp.md 2章）。
 * 直接叩かず `node tools/mc.mjs bots start` から起動する。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BotManager } from "./BotManager.js";
import { ControlServer } from "./ControlServer.js";
import { parseConfig } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// dist/main.js から見た配置。設定はプロジェクト直下に置く
const CONFIG_PATH = resolve(HERE, "..", "bots.config.json");

async function main(): Promise<void> {
  const raw: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const config = parseConfig(raw);

  console.log("[manager] 起動");
  console.log(`[manager] 接続先 : ${config.server.host}:${config.server.port}`);
  console.log(`[manager] LLM    : ${config.llm.model} @ ${config.llm.url}`);
  console.log(`[manager] 反応語 : ${config.chat.mention}`);

  const manager = new BotManager(config);

  // CLI からの操作を受け付ける。
  // 同時に、全ボットを切ってもプロセスが終了しないための「錨」でもある
  const control = new ControlServer(manager, config.control.port);
  await control.start();

  for (const name of config.initialBots) {
    const r = await manager.summon(name);
    if (!r.ok) console.error(`[manager] ${name} の召喚に失敗: ${r.reason}`);
  }

  console.log(`[manager] 準備完了。ボット: ${manager.names.join(", ") || "(なし)"}`);
  console.log(`[manager] ゲーム内で ${config.chat.commandPrefix}bots と打つと一覧が出ます`);
  console.log("[manager] ボットが0体でも `node tools/mc.mjs bots summon` で復帰できます");

  const shutdown = () => {
    console.log("[manager] 停止します");
    manager.dismissAll();
    control.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error("[manager] 起動に失敗しました:", err);
  process.exit(1);
});
