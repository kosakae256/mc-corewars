/**
 * 会話履歴。**その場の全員で1つの会話**として保持する（spec 7章）。
 *
 * プレイヤーごとに分けないのは、「同じ場にいる」感じを出すため。
 * 誰かの発言に対する返事を、他の人も文脈として追える。
 *
 * 状態と、それを操作する手続きがセットなのでクラスにしている
 * （docs/imp.md「要するに」3）。
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class ConversationHistory {
  /** system を含まない、user / assistant の並び。古い順 */
  private messages: ChatMessage[] = [];
  private lastUsedAt = 0;

  /**
   * @param maxMessages 保持する上限。user と assistant の合計本数
   * @param idleExpireMs この時間だけ無言が続いたら履歴を破棄する
   * @param now 時刻の取得。テストで差し替えられるようにしている
   */
  constructor(
    private readonly maxMessages: number,
    private readonly idleExpireMs: number,
    private readonly now: () => number = Date.now
  ) {}

  get length(): number {
    return this.messages.length;
  }

  /**
   * LLM に送る messages 配列を組み立てる。
   *
   * **失効の判定はここで行う。** タイマーで消すと、
   * 消えた瞬間を誰も観測しないまま状態が変わって分かりにくいため。
   *
   * @param speaker 発言者名。全員で1つの会話にするため、本文の前に付ける
   */
  messagesFor(systemPrompt: string, speaker: string, prompt: string): ChatMessage[] {
    const t = this.now();
    if (this.lastUsedAt !== 0 && t - this.lastUsedAt > this.idleExpireMs) {
      this.messages = [];
    }

    return [
      { role: "system", content: systemPrompt },
      ...this.messages,
      { role: "user", content: `${speaker}: ${prompt}` },
    ];
  }

  /**
   * 1往復を記録する。
   *
   * 失敗した応答は記録しない（呼び出し側で成功時のみ呼ぶ）。
   * 記録しないと、次回に「返事がない」が文脈として残ってしまう。
   */
  record(speaker: string, prompt: string, reply: string): void {
    this.messages.push({ role: "user", content: `${speaker}: ${prompt}` });
    this.messages.push({ role: "assistant", content: reply });

    // 上限を超えたら古い方から捨てる。
    // system プロンプトは履歴に含めず毎回先頭に付けるので、ここでは数えない
    while (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
    this.lastUsedAt = this.now();
  }

  clear(): void {
    this.messages = [];
    this.lastUsedAt = 0;
  }
}
