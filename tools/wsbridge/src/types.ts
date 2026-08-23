/**
 * 設定と外部入力の型、およびその型ガード。
 *
 * 外から来る値は必ずここで検証してから使う（docs/imp.md 3.3）。
 * BDS 版（tools/bots）と構造を揃えてある。
 */

export type BridgeConfig = {
  /** WebSocket サーバーの待受。127.0.0.1 に限定する */
  server: { host: string; port: number };
  llm: {
    url: string;
    model: string;
    keepAlive: string;
    numPredict: number;
    temperature: number;
    timeoutSec: number;
    maxQueue: number;
    think: boolean;
    systemPrompt: string;
  };
  chat: {
    mention: string;
    replyMaxLength: number;
    /** 応答の色。§b など */
    replyColor: string;
  };
  history: {
    maxMessages: number;
    idleExpireMinutes: number;
  };
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseConfig(v: unknown): BridgeConfig {
  if (!isObject(v)) throw new Error("設定がオブジェクトではありません");

  const { server, llm, chat, history } = v;

  if (!isObject(server) || typeof server.host !== "string" || typeof server.port !== "number") {
    throw new Error("server.host (string) と server.port (number) が必要です");
  }

  if (!isObject(llm)) throw new Error("llm がありません");
  for (const k of ["url", "model", "keepAlive", "systemPrompt"] as const) {
    if (typeof llm[k] !== "string") throw new Error(`llm.${k} は文字列である必要があります`);
  }
  for (const k of ["numPredict", "temperature", "timeoutSec", "maxQueue"] as const) {
    if (typeof llm[k] !== "number" || !Number.isFinite(llm[k])) {
      throw new Error(`llm.${k} は数値である必要があります`);
    }
  }
  if (typeof llm.think !== "boolean") throw new Error("llm.think は真偽値である必要があります");

  if (!isObject(chat)) throw new Error("chat がありません");
  if (typeof chat.mention !== "string" || chat.mention.length === 0) {
    throw new Error("chat.mention は空でない文字列である必要があります");
  }
  if (typeof chat.replyMaxLength !== "number" || chat.replyMaxLength <= 0) {
    throw new Error("chat.replyMaxLength は正の数値である必要があります");
  }
  if (typeof chat.replyColor !== "string") {
    throw new Error("chat.replyColor は文字列である必要があります");
  }

  if (!isObject(history)) throw new Error("history がありません");
  for (const k of ["maxMessages", "idleExpireMinutes"] as const) {
    if (typeof history[k] !== "number" || history[k] <= 0) {
      throw new Error(`history.${k} は正の数値である必要があります`);
    }
  }

  return v as BridgeConfig;
}

// ------------------------------------------------------- Ollama のレスポンス

export type OllamaChatResponse = { message: { content: string } };

export function isOllamaChatResponse(v: unknown): v is OllamaChatResponse {
  if (!isObject(v)) return false;
  const m = v.message;
  return isObject(m) && typeof m.content === "string";
}
