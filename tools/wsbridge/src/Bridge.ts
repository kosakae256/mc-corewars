/**
 * 1つの Minecraft 接続を担当する。
 *
 * `/wsserver` で繋いできたクライアントに対し、
 * チャットを購読 → `@cat` を検出 → LLM に問い合わせ → `/say` で返す。
 *
 * 状態（履歴・キュー・接続）を持つのでクラスにしている
 * （docs/imp.md「要するに」3）。
 */
import type { WebSocket } from "ws";

import { ConversationHistory } from "./ConversationHistory.js";
import { LlmQueue } from "./LlmQueue.js";
import { extractMention, sanitizeReply } from "./logic.js";
import {
  describeMessage,
  parsePlayerMessage,
  sanitizeForSay,
  sayCommand,
  subscribeMessage,
} from "./protocol.js";
import type { BridgeConfig } from "./types.js";

export class Bridge {
  private readonly history: ConversationHistory;
  private readonly queue: LlmQueue;

  constructor(
    private readonly socket: WebSocket,
    private readonly config: BridgeConfig,
    private readonly label: string
  ) {
    this.queue = new LlmQueue(config.llm);
    this.history = new ConversationHistory(
      config.history.maxMessages,
      config.history.idleExpireMinutes * 60 * 1000
    );
  }

  /** 購読を開始する。接続直後に呼ぶ */
  start(): void {
    this.socket.send(subscribeMessage("PlayerMessage"));
    console.log(`[${this.label}] PlayerMessage を購読しました`);

    this.socket.on("message", (data) => this.onMessage(String(data)));
    this.socket.on("close", () => console.log(`[${this.label}] 切断されました`));
    this.socket.on("error", (e) => console.warn(`[${this.label}] エラー:`, e?.message ?? e));
  }

  /** チャットに発言させる */
  private say(text: string): void {
    const safe = sanitizeForSay(text);
    if (safe.length === 0) return;
    this.socket.send(sayCommand(safe));
  }

  private onMessage(raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      console.warn(`[${this.label}] JSON として読めませんでした`);
      return;
    }

    if (process.env.WSBRIDGE_TRACE === "1") {
      console.log(`[${this.label}] 受信: ${describeMessage(json)}  ${raw.slice(0, 300)}`);
    }

    const event = parsePlayerMessage(json);
    if (!event) return;

    // 自分の応答を自分で拾って無限ループになるのを防ぐ。
    // /say で出した発言は type が "say" で返ってくる（実測）。
    // プレイヤーの発言は "chat" なので、これで確実に区別できる。
    if (event.type !== "chat") return;

    console.log(`[chat] <${event.sender}> ${event.message}`);
    void this.maybeReply(event.sender, event.message);
  }

  private async maybeReply(speaker: string, message: string): Promise<void> {
    const prompt = extractMention(message, this.config.chat.mention);
    if (prompt === null) return;

    console.log(`[llm] 要求(履歴${this.history.length}件): ${prompt}`);

    const messages = this.history.messagesFor(this.config.llm.systemPrompt, speaker, prompt);

    const pending = this.queue.request(messages);
    if (pending === null) {
      console.warn("[llm] キューが一杯のため要求を破棄しました");
      return;
    }

    const result = await pending;
    if (!result.ok) {
      this.say(`${this.config.chat.replyColor}…（返事がない）`);
      return;
    }

    const text = sanitizeReply(result.text, this.config.chat.replyMaxLength);
    if (text === null) {
      console.warn("[llm] 整形後に空になったため発言しません");
      return;
    }

    // 成功したものだけ履歴に残す。
    // 失敗を残すと「返事がない」が次回の文脈になってしまう
    this.history.record(speaker, prompt, text);

    console.log(`[llm] 応答: ${text}`);
    this.say(`${this.config.chat.replyColor}${text}`);
  }
}
