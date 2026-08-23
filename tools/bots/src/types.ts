/**
 * 設定と外部入力の型、およびその型ガード。
 *
 * 外から来る値（設定ファイル・Ollama のレスポンス・プロトコルのパケット）は
 * すべてここで検証してから使う（docs/imp.md 3.3）。
 */

// -------------------------------------------------------------------- 設定

export type BotsConfig = {
  server: { host: string; port: number };
  initialBots: string[];
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
    commandPrefix: string;
    replyMaxLength: number;
  };
  history: {
    maxMessages: number;
    idleExpireMinutes: number;
  };
  control: {
    port: number;
  };
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * 設定ファイルの内容を検証する。
 * 不正なら理由を投げる（起動時に落として気づけるようにする）。
 */
export function parseConfig(v: unknown): BotsConfig {
  if (!isObject(v)) throw new Error("設定がオブジェクトではありません");

  const { server, initialBots, llm, chat, history, control } = v;

  if (!isObject(server) || typeof server.host !== "string" || typeof server.port !== "number") {
    throw new Error("server.host (string) と server.port (number) が必要です");
  }
  if (!isStringArray(initialBots)) {
    throw new Error("initialBots は文字列の配列である必要があります");
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
  for (const k of ["mention", "commandPrefix"] as const) {
    if (typeof chat[k] !== "string" || chat[k].length === 0) {
      throw new Error(`chat.${k} は空でない文字列である必要があります`);
    }
  }
  if (typeof chat.replyMaxLength !== "number" || chat.replyMaxLength <= 0) {
    throw new Error("chat.replyMaxLength は正の数値である必要があります");
  }

  if (!isObject(control) || typeof control.port !== "number") {
    throw new Error("control.port (number) が必要です");
  }

  if (!isObject(history)) throw new Error("history がありません");
  for (const k of ["maxMessages", "idleExpireMinutes"] as const) {
    if (typeof history[k] !== "number" || history[k] <= 0) {
      throw new Error(`history.${k} は正の数値である必要があります`);
    }
  }

  return v as BotsConfig;
}

// ------------------------------------------------------- Ollama のレスポンス

/**
 * Ollama `/api/chat` の応答。必要な部分だけを型にしている。
 * 外部サービスの都合で形が変わりうるので、必ずこのガードを通す。
 */
export type OllamaChatResponse = { message: { content: string } };

export function isOllamaChatResponse(v: unknown): v is OllamaChatResponse {
  if (!isObject(v)) return false;
  const m = v.message;
  return isObject(m) && typeof m.content === "string";
}

// ------------------------------------------------------------ text パケット

/**
 * bedrock-protocol の `text` パケットのうち、使う項目だけ。
 * ライブラリの型に頼らず自前で検証する（プロトコル更新で形が変わりうるため）。
 */
export type TextPacket = {
  type: string;
  source_name?: string;
  message: string;
};

export function isTextPacket(v: unknown): v is TextPacket {
  if (!isObject(v)) return false;
  if (typeof v.type !== "string" || typeof v.message !== "string") return false;
  if (v.source_name !== undefined && typeof v.source_name !== "string") return false;
  return true;
}
