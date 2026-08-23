/**
 * ボットの集合を管理し、チャットを一元的に処理する。
 *
 * 全ボットが同じチャットを受信するため、そのまま処理すると
 * ボットの数だけ同じコマンドが実行される。ここで重複を捨てる（spec 5-3）。
 */
import { Bot } from "./Bot.js";
import { ConversationHistory } from "./ConversationHistory.js";
import { LlmQueue } from "./LlmQueue.js";
import { MSG, replyStyle } from "./format.js";
import {
  DuplicateFilter,
  extractMention,
  isValidBotName,
  parseCommand,
  randomBotName,
  sanitizeReply,
} from "./logic.js";
import type { BotsConfig } from "./types.js";

export class BotManager {
  private readonly bots = new Map<string, Bot>();
  private readonly dedupe = new DuplicateFilter(500);
  private readonly llmQueue: LlmQueue;
  private readonly history: ConversationHistory;

  constructor(private readonly config: BotsConfig) {
    this.llmQueue = new LlmQueue(config.llm);
    this.history = new ConversationHistory(
      config.history.maxMessages,
      config.history.idleExpireMinutes * 60 * 1000
    );
  }

  get names(): string[] {
    return [...this.bots.keys()];
  }

  has(name: string): boolean {
    return this.bots.has(name);
  }

  // ------------------------------------------------------------ 召喚・撤去

  /** ボットを召喚する。失敗したら理由を返す */
  async summon(name: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.bots.has(name)) return { ok: false, reason: "既にいます" };

    const bot = new Bot(
      name,
      this.config.server.host,
      this.config.server.port,
      (sender, message) => this.handleChat(sender, message)
    );

    // 接続の成否にかかわらず、まず登録する。
    // 登録前に接続すると、接続中に届いたチャットで
    // 「自分の発言かどうか」の判定ができないため
    this.bots.set(name, bot);
    try {
      await bot.connect();
      console.log(`[manager] 召喚: ${name}`);
      return { ok: true };
    } catch (e) {
      this.bots.delete(name);
      bot.disconnect();
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * 名前を決めて召喚する。**チャットからも CLI からも使う共通の入口。**
   *
   * @param given 省略するとランダムな名前を生成する
   */
  async summonByName(
    given?: string
  ): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
    let name: string;

    if (given === undefined) {
      const generated = randomBotName((n) => this.bots.has(n));
      if (generated === null) return { ok: false, reason: "空いている名前が見つかりませんでした" };
      name = generated;
    } else {
      if (!isValidBotName(given)) {
        return { ok: false, reason: "名前が不正です（空白・@・§・制御文字は不可、16文字まで）" };
      }
      if (this.bots.has(given)) return { ok: false, reason: `${given} は既にいます` };
      name = given;
    }

    const r = await this.summon(name);
    return r.ok ? { ok: true, name } : { ok: false, reason: r.reason };
  }

  /** 会話履歴を破棄する */
  forget(): void {
    this.history.clear();
  }

  dismiss(name: string): boolean {
    const bot = this.bots.get(name);
    if (!bot) return false;
    bot.disconnect();
    this.bots.delete(name);
    console.log(`[manager] 退出: ${name}`);
    return true;
  }

  dismissAll(): number {
    let n = 0;
    for (const name of [...this.bots.keys()]) {
      if (this.dismiss(name)) n++;
    }
    return n;
  }

  // -------------------------------------------------------------- チャット

  /** コマンドの結果を返すボット。cat を優先する */
  private speaker(): Bot | undefined {
    const cat = this.bots.get(this.catName());
    if (cat?.isSpawned) return cat;
    for (const b of this.bots.values()) if (b.isSpawned) return b;
    return undefined;
  }

  /** メンション文字列（`@cat`）から、対象ボットの名前（`cat`）を取り出す */
  private catName(): string {
    return this.config.chat.mention.replace(/^@/, "");
  }

  private handleChat(sender: string, message: string): void {
    // 自分たち（ボット）の発言には反応しない。
    // 反応するとボット同士・自分自身に反応して無限ループになる
    if (this.bots.has(sender)) return;

    // 全ボットが同じ発言を受け取るので、1回だけ処理する
    if (!this.dedupe.accept(sender, message, Date.now())) return;

    console.log(`[chat] <${sender}> ${message}`);

    const command = parseCommand(message, this.config.chat.commandPrefix);
    if (command) {
      void this.runCommand(command.name, command.args);
      return;
    }

    void this.maybeReply(sender, message);
  }

  // -------------------------------------------------------------- コマンド

  private async runCommand(name: string, args: string[]): Promise<void> {
    const reply = (text: string) => this.speaker()?.say(text);

    switch (name) {
      case "summon": {
        const r = await this.summonByName(args[0]);
        reply(r.ok ? MSG.summoned(r.name) : MSG.summonFailed(args[0] ?? "(自動)", r.reason));
        return;
      }

      case "dismiss": {
        const target = args[0];
        if (target === undefined) return reply(MSG.usage);
        if (target === "all") {
          // 切ると発言者がいなくなるので、先に伝えてから切る
          reply(MSG.dismissedAll(this.bots.size));
          this.dismissAll();
          return;
        }
        if (!this.dismiss(target)) return reply(MSG.notFound(target));
        reply(MSG.dismissed(target));
        return;
      }

      case "bots":
        reply(MSG.botList(this.names));
        return;

      case "forget":
        this.forget();
        reply(MSG.forgot);
        return;

      default:
        reply(MSG.usage);
        return;
    }
  }

  // ------------------------------------------------------------------ LLM

  /**
   * LLM に応答させる。以下の両方を満たすときだけ動く（spec 6-1）:
   *   1. cat という名前のボットが接続している
   *   2. 発言に @cat メンションが含まれる
   *
   * 満たさなければ沈黙する（エラーも出さない）。
   */
  private async maybeReply(speaker: string, message: string): Promise<void> {
    const cat = this.bots.get(this.catName());
    if (!cat?.isSpawned) return;

    const prompt = extractMention(message, this.config.chat.mention);
    if (prompt === null) return;

    console.log(`[llm] 要求(履歴${this.history.length}件): ${prompt}`);

    const messages = this.history.messagesFor(
      this.config.llm.systemPrompt,
      speaker,
      prompt
    );

    const pending = this.llmQueue.request(messages);
    if (pending === null) {
      // 待ち行列が上限。捨てたことはログにだけ残す
      console.warn("[manager] キューが一杯のため要求を破棄しました");
      return;
    }

    const result = await pending;
    if (!result.ok) return cat.say(MSG.noReply);

    const text = sanitizeReply(result.text, this.config.chat.replyMaxLength);
    if (text === null) {
      console.warn("[llm] 整形後に空になったため発言しません");
      return;
    }

    // 成功したものだけを記録する。
    // 失敗を記録すると「返事がない」が次回の文脈に残ってしまう
    this.history.record(speaker, prompt, text);

    console.log(`[llm] 応答: ${text}`);
    // 見やすさのため水色で出す。履歴には色なしの text を入れてある
    cat.say(replyStyle(text));
  }
}
