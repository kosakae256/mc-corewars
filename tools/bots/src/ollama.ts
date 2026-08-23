/**
 * Ollama への HTTP 呼び出し。
 *
 * URL とモデル名は設定ファイル由来で、チャット入力からは組み立てない
 * （docs/imp.md 8章）。
 */
import type { ChatMessage } from "./ConversationHistory.js";
import { isOllamaChatResponse, type BotsConfig } from "./types.js";

export type LlmError =
  | { kind: "timeout" }
  | { kind: "http"; status: number }
  | { kind: "network"; detail: string }
  | { kind: "malformed" };

export type LlmResult =
  | { ok: true; text: string }
  | { ok: false; error: LlmError };

/**
 * 応答を取得する。
 *
 * @param messages system + 会話履歴 + 今回の発言。組み立ては
 *                 ConversationHistory が担う（ここでは加工しない）
 */
export async function askLlm(
  llm: BotsConfig["llm"],
  messages: ChatMessage[]
): Promise<LlmResult> {
  const body = JSON.stringify({
    model: llm.model,
    messages,
    stream: false,
    // 思考モデル（qwen3.5 等）は既定で <think> に大量のトークンを使い、
    // num_predict の枠を使い切って本文が空で返る（実測: 600トークン全部が思考）。
    // チャット用途では思考は不要なので明示的に切る。
    think: llm.think,
    // モデルを常駐させる。これが無いと放置後の初回だけ約13秒かかる（実測）
    keep_alive: llm.keepAlive,
    options: {
      num_predict: llm.numPredict,
      temperature: llm.temperature,
    },
  });

  // AbortController でタイムアウトを掛ける。
  // 掛けないと、応答が来ないままキューが止まる
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), llm.timeoutSec * 1000);

  try {
    const res = await fetch(llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });

    if (!res.ok) return { ok: false, error: { kind: "http", status: res.status } };

    const json: unknown = await res.json();
    // 外部サービスの応答は信用せず、必ず型ガードを通す
    if (!isOllamaChatResponse(json)) return { ok: false, error: { kind: "malformed" } };

    return { ok: true, text: json.message.content };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, error: { kind: "timeout" } };
    }
    return {
      ok: false,
      error: { kind: "network", detail: e instanceof Error ? e.message : String(e) },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** ログに出すための短い説明 */
export function describeError(e: LlmError): string {
  switch (e.kind) {
    case "timeout":
      return "タイムアウト";
    case "http":
      return `HTTP ${e.status}`;
    case "network":
      return `通信失敗: ${e.detail}`;
    case "malformed":
      return "応答の形式が不正";
  }
}
