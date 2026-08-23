/**
 * Minecraft の `/wsserver` プロトコル。
 *
 * **公式ドキュメントに詳細がない非公式の仕組み。**
 * Mojang の開発者いわく "unsupported surface"。
 * 形式が変わる可能性があるので、受信は必ず型ガードを通す。
 *
 * 仕様: docs/spec/04-ws-llm-chat.md
 */
import { randomUUID } from "node:crypto";

// ------------------------------------------------------------ 送信メッセージ

/** イベントの購読を要求する */
export function subscribeMessage(eventName: string): string {
  return JSON.stringify({
    header: {
      version: 1,
      requestId: randomUUID(),
      messageType: "commandRequest",
      messagePurpose: "subscribe",
    },
    body: { eventName },
  });
}

/** 購読を解除する */
export function unsubscribeMessage(eventName: string): string {
  return JSON.stringify({
    header: {
      version: 1,
      requestId: randomUUID(),
      messageType: "commandRequest",
      messagePurpose: "unsubscribe",
    },
    body: { eventName },
  });
}

/**
 * チャットへ発言させるコマンドを組み立てる。
 *
 * `/say` は **`[外部]` という接頭辞が付いてしまう**（実測）。
 * `/tellraw @a` なら本文だけを出せる。
 */
export function sayCommand(text: string): string {
  const payload = JSON.stringify({ rawtext: [{ text }] });
  return commandMessage(`tellraw @a ${payload}`);
}

/** コマンドを実行させる */
export function commandMessage(commandLine: string): string {
  return JSON.stringify({
    header: {
      version: 1,
      requestId: randomUUID(),
      messageType: "commandRequest",
      messagePurpose: "commandRequest",
    },
    body: {
      origin: { type: "player" },
      commandLine,
      version: 1,
    },
  });
}

// ------------------------------------------------------------ 受信メッセージ

/** チャット発言の通知 */
export type PlayerMessageEvent = {
  sender: string;
  message: string;
  type?: string;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 受信した JSON が PlayerMessage イベントかを判定し、中身を返す。
 *
 * 形が想定と違えば `null`。**信用せず必ずここを通す。**
 */
export function parsePlayerMessage(raw: unknown): PlayerMessageEvent | null {
  if (!isObject(raw)) return null;

  const header = raw.header;
  if (!isObject(header)) return null;
  if (header.messagePurpose !== "event") return null;
  if (header.eventName !== "PlayerMessage") return null;

  const body = raw.body;
  if (!isObject(body)) return null;
  if (typeof body.sender !== "string" || typeof body.message !== "string") return null;

  return {
    sender: body.sender,
    message: body.message,
    type: typeof body.type === "string" ? body.type : undefined,
  };
}

/** 受信 JSON の概要。ログとデバッグ用 */
export function describeMessage(raw: unknown): string {
  if (!isObject(raw)) return "(不正な形)";
  const header = isObject(raw.header) ? raw.header : {};
  const purpose = String(header.messagePurpose ?? "?");
  const event = header.eventName ? ` ${String(header.eventName)}` : "";
  return `${purpose}${event}`;
}

/**
 * `/say` に渡せる形に整える。
 *
 * 改行やコマンド注入を防ぐため、制御文字と改行を落とす。
 * `§` は色付けに使うので残す。
 */
export function sanitizeForSay(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // 制御文字（改行・タブ含む）を空白にする。コマンド注入と表示崩れを防ぐ
    if (code < 0x20 || code === 0x7f) {
      out += " ";
      continue;
    }
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}
