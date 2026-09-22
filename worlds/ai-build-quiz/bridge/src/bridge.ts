/**
 * 1 つの Minecraft 接続を担当する。`docs/spec/13-transport.md`。
 *
 * ## 何をするか
 *
 * 1 秒ごとに scoreboard の `phase` を読む。**0（お題待ち）のときだけ**:
 *   単語を選ぶ → genlab に頼む → `/scriptevent quiz:round` `quiz:accept`×n `quiz:palette`×n `quiz:chunk`×N `quiz:go`（各 440 バイト以内）
 * 送ったら BP が `phase` を 1 にするまで待つ。9（受信失敗）なら 1 回だけ送り直す。
 *
 * 出題モード（spec 17 の 3 章）: 単語の代わりに scoreboard `quiz_topic` の**キューの先頭**（`0:<id>` `1:<お題>` `2..:<詳細>`）を使う。
 * **ゲーム中（phase 1〜3）も先頭を見て、裏で 1 件先読みして生成しておく**（リアルタイム。待ちになった瞬間に送れる）。
 * 先頭の id が変わっていたら（抜けた・空にした）先読みは捨てて作り直す。
 *
 * ゲームの進行（30 秒・答え合わせ・得点）は全部 BP。**ここは運び屋。**
 *
 * 状態（接続・進行中のラウンド・単語の山）を持つのでクラス（imp.md「要するに」3）。
 */
import type { WebSocket } from "ws";

import { Genlab, PROFILES, type Generated, type Profile } from "./genlab.js";
import { commandMessage, parseCommandResponse, parsePhase, parsePlayerMessage, parseTrackedNames, subscribeMessage } from "./protocol.js";
import { assertFits, splitArray, splitText } from "./pack.js";
import { encodeRle } from "./rle.js";
import { normalizeAnswer } from "./normalize.js";
import { interpretTopic, type Dict, type LlmConfig } from "./topic.js";
import { KIND_ORDER, styleOf, type Kind, type Word } from "./words.js";

export type BridgeConfig = {
  genlab: string;
  size: number;
  steps: number;
  pollMs: number;
  maxCommandBytes: number;
  sendGapMs: number;
  responseTimeoutMs: number;
  llm: LlmConfig;
  /** 和英辞書（お題の英語に使う。無ければ言語モデル → genlab の翻訳） */
  dict?: Dict;
  /** Wikipedia の対訳（固有名詞。08-genlab 2-0b） */
  wiki?: Dict;
};

/** BP に送る 1 ラウンドぶん */
type Outgoing = { round: number; messages: string[] };

/** 出題キューの先頭（scoreboard `quiz_topic`。spec 13 の 3 章） */
type Topic = { id: number; topic: string; detail: string };
/** 生成が済んで送るのを待っている出題（先読み。spec 17 の 3 章） */
type Prepared = Topic & { profile: Profile; gen: Generated; t: number };
/** 生成に失敗した id は、この間は作り直さない（毎秒 genlab を叩かない。2026-09-22 に 500 で詰まった） */
const PREFETCH_RETRY_MS = 30_000;

const PHASE = { waiting: 0, building: 1, answering: 2, reveal: 3, idle: 8, failed: 9 } as const;
const MODE = { free: 0, versus: 1, custom: 2 } as const;

export class Bridge {
  private readonly genlab: Genlab;
  private readonly pending = new Map<string, { resolve: (m: string) => void; timer: NodeJS.Timeout }>();
  private timer: NodeJS.Timeout | undefined;
  private busy = false;
  private round = 0;
  private last: Outgoing | undefined;
  private resent = false;
  private deck: Word[] = [];
  private unreadable = 0;
  private loggedRawPhase = false;
  /** 出題モード: 先読み済み（未送信）・先読み中・失敗した id */
  private prepared: Prepared | undefined;
  private preparing: Promise<void> | undefined;
  private prefetchFailed: { id: number; at: number } | undefined;

  constructor(
    private readonly socket: WebSocket,
    private readonly config: BridgeConfig,
    private readonly words: readonly Word[],
    private readonly label: string
  ) {
    this.genlab = new Genlab(config.genlab);
  }

  start(): void {
    this.socket.on("message", (data) => this.onMessage(String(data)));
    this.socket.on("close", () => this.stop("切断"));
    this.socket.on("error", (e) => console.warn(`[${this.label}] エラー:`, e.message));
    this.socket.send(subscribeMessage("PlayerMessage")); // ログ用。判定は BP
    this.timer = setInterval(() => void this.poll(), this.config.pollMs);
    console.log(`[${this.label}] 接続。${this.words.length} 語。phase を ${this.config.pollMs} ms ごとに見る`);
  }

  stop(reason: string): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    console.log(`[${this.label}] 停止: ${reason}`);
  }

  // ---------------------------------------------------------------- 受信

  private rawLogged = 0;

  private onMessage(raw: string): void {
    if (this.rawLogged < 5) {
      // 最初の数件は生で残す（プロトコルの形が想定と違ったときの手掛かり）
      this.rawLogged++;
      console.log(`[${this.label}] 受信（生）: ${raw.slice(0, 300)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const res = parseCommandResponse(parsed);
    if (res) {
      const p = this.pending.get(res.requestId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(res.requestId);
        p.resolve(res.statusMessage);
      }
      return;
    }
    const chat = parsePlayerMessage(parsed);
    if (!chat) return;
    console.debug(`[${this.label}] <${chat.sender}> [${chat.type}] ${chat.message}`); // 発言（答えを含む）も画面には出さない（spec 13 の 4-1）
  }

  /** コマンドを送り、応答の statusMessage を待つ。応答が無ければ "" */
  private send(commandLine: string): Promise<string> {
    const { requestId, text } = commandMessage(commandLine);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve("");
      }, this.config.responseTimeoutMs);
      this.pending.set(requestId, { resolve, timer });
      this.socket.send(text);
    });
  }

  // ---------------------------------------------------------------- 進行

  /** scoreboard `quiz` の偽プレイヤーの数を読む（mode / kind） */
  private async readNumber(name: string): Promise<number | null> {
    return parsePhase(await this.send(`scoreboard players list ${name}`));
  }

  /** 出題キューの先頭（`quiz_topic` の偽プレイヤー名 `0:<id>` `1:<お題>` `2:<詳細>`…）。空なら null。spec 13 の 3 章 */
  private async readTopic(): Promise<Topic | null> {
    const msg = await this.send("scoreboard players list");
    const names = parseTrackedNames(msg);
    const id = Number(names.find((n) => /^0:\d+$/.test(n))?.slice(2) ?? NaN);
    const topic = names.find((n) => n.startsWith("1:"))?.slice(2).trim() ?? "";
    // 詳細は `2:` `3:` … に 50 文字ずつ割られている（spec 13 の 3 章）。番号順に繋ぐ
    const pieces = names
      .map((n) => n.match(/^(\d+):([\s\S]*)$/))
      .filter((m): m is RegExpMatchArray => m !== null && Number(m[1]) >= 2)
      .sort((a, b) => Number(a[1]) - Number(b[1]))
      .map((m) => m[2] ?? "");
    const detail = pieces.join("").trim();
    return topic && Number.isInteger(id) ? { id, topic, detail } : null;
  }

  /** 生成プロファイル（scoreboard `gen`。0 = v1 / 1 = v2。spec 13 の 3 章） */
  private async readProfile(): Promise<Profile> {
    const n = (await this.readNumber("gen")) ?? 0;
    return PROFILES[n] ?? "v1";
  }

  private async readPhase(): Promise<number | null> {
    const msg = await this.send("scoreboard players list phase");
    if (!this.loggedRawPhase && msg) {
      // 応答の形は未確認（spec 13 の 5 章）。最初の 1 回は生で残す
      console.log(`[${this.label}] phase の応答（生）: ${JSON.stringify(msg)}`);
      this.loggedRawPhase = true;
    }
    return parsePhase(msg);
  }

  private async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // 生存の合図。BP はこれを 5 秒以内に受けていないと /quiz:start を断る（spec 13）
      await this.send("scriptevent quiz:ping");
      const phase = await this.readPhase();
      if (phase === null) {
        this.unreadable++;
        if (this.unreadable === 5) console.warn(`[${this.label}] phase が 5 回続けて読めない。BP が入っているか、/wsserver で繋いだか`);
        return;
      }
      this.unreadable = 0;
      if (phase === PHASE.waiting) {
        const mode = (await this.readNumber("mode")) ?? MODE.free;
        if (mode === MODE.custom) {
          await this.customRound(await this.readProfile()); // キューの先頭を送る（空なら待つ）
          return;
        }
        const kindNo = (await this.readNumber("kind")) ?? 0;
        await this.nextRound(KIND_ORDER[kindNo - 1], await this.readProfile());
      } else if (phase === PHASE.building || phase === PHASE.answering || phase === PHASE.reveal) {
        // ゲーム中: 出題モードなら次の先頭を先読み（裏で生成。poll は止めない）
        const mode = (await this.readNumber("mode")) ?? MODE.free;
        if (mode === MODE.custom) await this.prefetch(await this.readProfile());
      } else if (phase === PHASE.failed && this.last && !this.resent) {
        console.warn(`[${this.label}] BP が受信に失敗。round ${this.last.round} を送り直す`);
        this.resent = true;
        await this.deliver(this.last);
      }
    } catch (err) {
      console.warn(`[${this.label}] poll:`, err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
    }
  }

  private pick(kind: Kind | undefined): Word {
    if (kind) {
      // 固定カテゴリ: その中からランダム（山は使わない。固定を外したら山に戻る）
      const pool = this.words.filter((w) => w.kind === kind);
      const w = pool[Math.floor(Math.random() * pool.length)];
      if (w) return w;
    }
    if (this.deck.length === 0) {
      this.deck = [...this.words];
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const a = this.deck[i] as Word;
        this.deck[i] = this.deck[j] as Word;
        this.deck[j] = a;
      }
    }
    return this.deck.pop() as Word;
  }

  private async nextRound(kind: Kind | undefined, profile: Profile): Promise<void> {
    if (!(await this.genlab.ready())) {
      await this.send("scriptevent quiz:status 生成サーバーを待っています…");
      return;
    }
    const word = this.pick(kind);
    const round = this.round + 1;
    const t = Date.now();
    // 答えは画面に出さない（ホストに見える。spec 13 の 4-1）。bridge.log にだけ
    console.log(`[${this.label}] round ${round}: 生成中${kind ? `（カテゴリ固定: ${kind}）` : ""}${profile !== "v1" ? `（生成 ${profile}）` : ""}（答えは bridge.log）`);
    console.debug(`[${this.label}] round ${round}: ${word.ja} (${word.en})`);
    if (this.preparing) await this.preparing; // 出題モードの先読みが走っていたら終わるのを待つ（genlab は 1 件ずつ）
    let gen;
    try {
      gen = await this.genlab.build(word.en, this.config.size, styleOf(word.kind), word.seed, this.config.steps, "", profile, word.ja);
    } catch (err) {
      // 生成に失敗した語は山に戻し、round も進めない（429 で毎秒 1 語ずつ捨てていた。fake-mc.ts で発覚）
      this.deck.push(word);
      throw err;
    }
    await this.sendRound(round, word.ja, word.accepted, word.kind, word.hint, gen, t);
  }

  /** 出題モード（spec 17 の 3 章）: キューの先頭を送る。先読み済みならそれを、無ければいま生成する */
  private async customRound(profile: Profile): Promise<void> {
    const head = await this.readTopic();
    if (!head) return; // キューが空。待つ（actionbar「出題を待っています」は BP）
    if (this.preparing) await this.preparing; // 先読みの途中なら終わるのを待つ（genlab は 1 件ずつ）
    if (this.prefetchFailed?.id === head.id && Date.now() - this.prefetchFailed.at < PREFETCH_RETRY_MS) {
      // 直前に失敗した件。30 秒は作り直さない（genlab を毎秒叩かない）
      await this.send("scriptevent quiz:status お題の生成に失敗しました。少し待ってやり直します…");
      return;
    }
    let p = this.prepared;
    if (p && (p.id !== head.id || p.profile !== profile)) {
      console.log(`[${this.label}] 先読み（id ${p.id}, ${p.profile}）は先頭（id ${head.id}, ${profile}）と違うので捨てる`);
      p = undefined;
    }
    this.prepared = undefined;
    this.prefetchFailed = undefined;
    if (p) {
      console.log(`[${this.label}] id ${p.id}: 先読み済み。すぐ送る`);
    } else {
      if (!(await this.genlab.ready())) {
        await this.send("scriptevent quiz:status 生成サーバーを待っています…");
        return;
      }
      await this.send("scriptevent quiz:status お題を解釈しています…");
      try {
        p = await this.generate(head, profile);
      } catch (err) {
        this.prefetchFailed = { id: head.id, at: Date.now() }; // 次の poll ですぐ叩き直さない
        throw err;
      }
    }
    await this.sendRound(this.round + 1, p.topic, [normalizeAnswer(p.topic)], "custom", "", p.gen, p.t, p.id);
  }

  /** ゲーム中（phase 1〜3）にキューの先頭を裏で生成しておく（spec 17 の 3 章「先読み」）。1 件だけ。失敗した id は 30 秒は再挑戦しない */
  private async prefetch(profile: Profile): Promise<void> {
    if (this.preparing) return;
    const head = await this.readTopic();
    if (!head) return;
    if (this.prepared?.id === head.id && this.prepared.profile === profile) return;
    if (this.prefetchFailed?.id === head.id && Date.now() - this.prefetchFailed.at < PREFETCH_RETRY_MS) return;
    if (!(await this.genlab.ready())) return;
    console.log(`[${this.label}] id ${head.id}: 先読みで生成中（${profile}）`);
    this.preparing = this.generate(head, profile)
      .then((p) => {
        this.prepared = p;
        console.log(`[${this.label}] id ${p.id}: 先読み完了・${((Date.now() - p.t) / 1000).toFixed(1)} 秒`);
      })
      .catch((err) => {
        this.prefetchFailed = { id: head.id, at: Date.now() };
        console.warn(`[${this.label}] id ${head.id}: 先読みに失敗:`, err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        this.preparing = undefined;
      });
  }

  /** お題を解釈して genlab で生成する（送りはしない） */
  private async generate(head: Topic, profile: Profile): Promise<Prepared> {
    const t = Date.now();
    const it = await interpretTopic(head.topic, head.detail, this.config.llm, this.config.dict, this.words, this.config.wiki);
    // お題は画面に出さない（spec 13 の 4-1）。bridge.log にだけ
    console.log(`[${this.label}] id ${head.id}: 出題モード。英語にした [${it.source}]（お題は bridge.log）`);
    const how =
      profile === "v3"
        ? `→ 日本語のまま「${head.detail ? `${head.topic}、${head.detail}` : head.topic}」（v3。翻訳なし）`
        : `→ "${it.en}"${it.detail ? ` + 詳細「${it.detail}」（genlab が別に翻訳）` : ""} style ${it.style} [${it.source}]${it.confusable.length ? ` 混同: ${it.confusable.join(", ")}` : ""}`;
    console.debug(`[${this.label}] id ${head.id}: 出題「${head.topic}」${head.detail ? `（${head.detail}）` : ""} ${how}`);
    const gen = await this.genlab.build(it.en, this.config.size, it.style, undefined, this.config.steps, it.detail, profile, head.detail ? `${head.topic}、${head.detail}` : head.topic);
    return { ...head, profile, gen, t };
  }

  private async sendRound(round: number, answer: string, accepted: readonly string[], kind: string, hint: string, gen: Generated, t: number, topicId?: number): Promise<void> {
    this.round = round;
    const rle = encodeRle(gen.voxels);
    const max = this.config.maxCommandBytes;
    // 1 コマンド 440 バイト以内に分割（spec 13 の 2 章。超えるとワールドが落ちる）
    const accepts = splitArray((i, n) => `scriptevent quiz:accept ${round} ${i}/${n} `, accepted, max);
    const palettes = splitArray((i, n) => `scriptevent quiz:palette ${round} ${i}/${n} `, gen.palette, max);
    const chunks = splitText((i, n) => `scriptevent quiz:chunk ${round} ${i}/${n} `, rle, max);
    // 出題モードだけ: 画像モデルに渡したプロンプトを発表で見せる（spec 13 の 2 章）。改行は潰す
    const promptText = kind === "custom" ? (gen.prompt ?? gen.english ?? "").replace(/\s+/g, " ").trim() : "";
    const prompts = promptText ? splitText((i, n) => `scriptevent quiz:prompt ${round} ${i}/${n} `, promptText, max) : [];
    const header = {
      round,
      answer,
      kind,
      hint,
      size: gen.size,
      count: gen.count,
      chunks: chunks.length,
      accepts: accepts.length,
      palettes: palettes.length,
      paletteSize: gen.palette.length,
      prompts: prompts.length,
      ...(topicId !== undefined ? { topicId } : {}), // 出題モード: BP が go でキューから外す件（spec 13 の 2 章）
    };
    const messages = [`scriptevent quiz:round ${JSON.stringify(header)}`, ...accepts, ...palettes, ...prompts, ...chunks, `scriptevent quiz:go ${round}`];
    assertFits(messages, max);
    this.last = { round, messages };
    this.resent = false;
    console.log(
      `[${this.label}] round ${round}: ${gen.count} 個・rle ${rle.length} 文字・chunk ${chunks.length}・accept ${accepts.length}・palette ${palettes.length}・生成 ${((Date.now() - t) / 1000).toFixed(1)} 秒`
    );
    await this.deliver(this.last);
  }

  /**
   * 1 つずつ送り、**応答を待ってから次**を送る（spec 13 の 2-2）。
   * 応答を待たずに 100 件以上を投げると、クライアントが接続を切る（未応答の commandRequest の上限）。
   */
  private async deliver(out: Outgoing): Promise<void> {
    for (const m of out.messages) {
      await this.send(m);
      await new Promise((r) => setTimeout(r, this.config.sendGapMs));
    }
    // BP が受け取って phase を 1 にするまで待つ（最大 15 秒）。0 のままなら次の poll がまた送ってしまうので
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const p = await this.readPhase();
      if (p !== null && p !== PHASE.waiting) return;
    }
    console.warn(`[${this.label}] round ${out.round}: BP が受け取った気配が無い（phase が 0 のまま）`);
  }
}
