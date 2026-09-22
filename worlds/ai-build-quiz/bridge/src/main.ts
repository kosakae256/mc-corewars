/**
 * 起動。`docs/spec/10-architecture.md` 4 章。
 *
 *   npm start            → ws://127.0.0.1:8766 で待つ
 *   Minecraft で        /wsserver ws://127.0.0.1:8766
 *
 * 設定は `config.json`。単語は `words.json`（`npm run words` で作る）。
 */
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import { Bridge, type BridgeConfig } from "./bridge.js";
import { loadDict, warmUp } from "./topic.js";
import type { Word } from "./words.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readConfig(): BridgeConfig & { port: number; host: string } {
  const raw: unknown = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
  if (typeof raw !== "object" || raw === null) throw new Error("config.json が不正");
  const o = raw as Record<string, unknown>;
  const num = (k: string, d: number): number => (typeof o[k] === "number" ? (o[k] as number) : d);
  const str = (k: string, d: string): string => (typeof o[k] === "string" ? (o[k] as string) : d);
  return {
    host: str("host", "127.0.0.1"),
    // 本番の bridge を止めずに横で試すため、環境変数で port を変えられる（spec 13 の 5-1）
    port: process.env["BRIDGE_PORT"] ? Number(process.env["BRIDGE_PORT"]) : num("port", 8766),
    genlab: str("genlab", "http://127.0.0.1:8770"),
    size: num("size", 60),
    steps: num("steps", 4),
    pollMs: num("pollMs", 1000),
    maxCommandBytes: num("maxCommandBytes", 440),
    sendGapMs: num("sendGapMs", 50),
    responseTimeoutMs: num("responseTimeoutMs", 3000),
    dict: loadDict(join(ROOT, str("jmdict", "../../../tools/genlab/pipeline/jmdict_min.json"))),
    wiki: loadDict(join(ROOT, str("wikititles", "../../../tools/genlab/pipeline/wikititles_ja_en.json"))),
    llm: {
      url: str("llmUrl", "http://127.0.0.1:11434/api/chat"),
      model: str("llmModel", "qwen2.5:1.5b"),
      keepAlive: str("llmKeepAlive", "30s"),
      timeoutMs: num("llmTimeoutMs", 20000),
      enabled: typeof o["llmEnabled"] === "boolean" ? o["llmEnabled"] : false, // 既定は使わない（狐が出続けた・2026-09-22）
    },
  };
}

function readWords(): Word[] {
  const raw: unknown = JSON.parse(readFileSync(join(ROOT, "words.json"), "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("words.json が空。npm run words");
  return raw as Word[];
}

// 画面に出すものは bridge.log にも残す（ゲームが落ちたときに後から読むため）。
// **答え・お題は画面に出さない**（ホストは同じ PC で遊ぶ。spec 13 の 4-1）: console.debug はファイル専用
const LOG = join(ROOT, "bridge.log");
console.debug = (...args: unknown[]) => {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} [secret] ${args.map(String).join(" ")}
`);
  } catch {
    // ログが書けなくても動かす
  }
};
for (const level of ["log", "warn", "error"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    orig(...args);
    try {
      appendFileSync(LOG, `${new Date().toISOString()} [${level}] ${args.map(String).join(" ")}
`);
    } catch {
      // ログが書けなくても動かす
    }
  };
}

const config = readConfig();
const words = readWords();
// 出題モード用の言語モデルを温める（spec 17 の 3 章）。無ければ代用（お題をそのまま genlab へ）で動く
if (config.llm.enabled) void warmUp(config.llm).then((ok) => console.log(ok ? `llm: ${config.llm.model} 準備できた` : `llm: ${config.llm.model} が使えない（出題モードは辞書翻訳で代用）`));
else console.log("llm: 使わない（出題モードは辞書 → 無ければカタカナ → genlab の翻訳。config.json の llmEnabled で切り替え）");
const wss = new WebSocketServer({ host: config.host, port: config.port });
wss.on("error", (e) => {
  // 前の bridge が残っていると port が取れない。黙って死なずに言う（古い単語リストの bridge に繋がって気づかなかった）
  console.error(`bridge: ws://${config.host}:${config.port} を開けない: ${e.message}。前の bridge が動いていないか確認`);
  process.exit(1);
});
let n = 0;
wss.on("connection", (socket) => {
  n++;
  new Bridge(socket, config, words, `mc#${n}`).start();
});
console.log(`bridge: ws://${config.host}:${config.port} で待機（genlab ${config.genlab}、${words.length} 語、size ${config.size}、和英辞書 ${config.dict ? `${config.dict.size} 語` : "無し"}、Wikipedia 対訳 ${config.wiki ? `${config.wiki.size} 件` : "無し"}）`);
console.log("Minecraft で: /wsserver ws://127.0.0.1:" + config.port);
