/**
 * LLM 呼び出しの直列キュー。
 *
 * VRAM に載るモデルは1つだけで同時実行できないため、
 * リクエストは1件ずつ処理する（spec 6-3）。
 *
 * 待ち行列に上限を設けているのは、連投されたときに
 * 何十秒も前の発言へ今さら返事をするのを防ぐため。
 */
import type { ChatMessage } from "./ConversationHistory.js";
import { askLlm, describeError, type LlmResult } from "./ollama.js";
import type { BotsConfig } from "./types.js";

type Job = {
  messages: ChatMessage[];
  resolve: (r: LlmResult) => void;
};

export class LlmQueue {
  private readonly waiting: Job[] = [];
  private running = false;

  constructor(private readonly llm: BotsConfig["llm"]) {}

  /** 現在の待ち件数（実行中を含まない） */
  get pending(): number {
    return this.waiting.length;
  }

  /**
   * 応答を要求する。
   *
   * 待ち行列が上限に達している場合は**この要求を捨てて** `null` を返す。
   * 古いものを捨てないのは、既に順番を待っている人の返事を
   * 横取りしない方が体験として自然なため。
   */
  request(messages: ChatMessage[]): Promise<LlmResult> | null {
    if (this.waiting.length >= this.llm.maxQueue) return null;

    return new Promise<LlmResult>((resolve) => {
      this.waiting.push({ messages, resolve });
      void this.drain();
    });
  }

  /** 溜まっているジョブを1件ずつ処理する */
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const job = this.waiting.shift();
        if (!job) break;

        const result = await askLlm(this.llm, job.messages);
        if (!result.ok) {
          // 詳細はコンソールにのみ出す。チャットには出さない（URL 等が漏れる）
          console.warn(`[llm] 失敗: ${describeError(result.error)}`);
        }
        job.resolve(result);
      }
    } finally {
      this.running = false;
    }
  }
}
