/**
 * Minecraft の `/wsserver` プロトコル（`docs/spec/04-ws-llm-chat.md` 2 章、`tools/wsbridge` から写した）。
 *
 * **公式ドキュメントに詳細がない非公式の仕組み。** 受信は必ず型ガードを通す。
 */
import { randomUUID } from "node:crypto";

export type CommandRequest = { requestId: string; text: string };

/** コマンドを実行させるメッセージ。requestId を返すので、応答と突き合わせられる */
export function commandMessage(commandLine: string): CommandRequest {
  const requestId = randomUUID();
  const text = JSON.stringify({
    header: { version: 1, requestId, messageType: "commandRequest", messagePurpose: "commandRequest" },
    body: { origin: { type: "player" }, commandLine, version: 1 },
  });
  return { requestId, text };
}

export function subscribeMessage(eventName: string): string {
  return JSON.stringify({
    header: { version: 1, requestId: randomUUID(), messageType: "commandRequest", messagePurpose: "subscribe" },
    body: { eventName },
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** コマンドの応答。`statusMessage` に人間向けの文が入る（scoreboard の値もここから読む） */
export type CommandResponse = { requestId: string; statusCode: number; statusMessage: string };

export function parseCommandResponse(raw: unknown): CommandResponse | null {
  if (!isObject(raw)) return null;
  const header = raw["header"];
  const body = raw["body"];
  if (!isObject(header) || !isObject(body)) return null;
  if (header["messagePurpose"] !== "commandResponse") return null;
  const requestId = header["requestId"];
  if (typeof requestId !== "string") return null;
  const statusCode = typeof body["statusCode"] === "number" ? body["statusCode"] : 0;
  const statusMessage = typeof body["statusMessage"] === "string" ? body["statusMessage"] : "";
  return { requestId, statusCode, statusMessage };
}

/**
 * `scoreboard players list phase` の応答から数を読む。
 *
 * 実物の文は未確認（`docs/spec/13-transport.md` 5 章）。想定:
 *   "Showing 1 tracked objective(s) for phase:" ＋ "- quiz: 2 (quiz)" のような行。
 * **数字が 1 つも無ければ null**（読めなかった、として扱う）。
 */
export function parsePhase(statusMessage: string): number | null {
  const m = statusMessage.match(/quiz[^\d-]*(-?\d+)/);
  if (m?.[1] !== undefined) return Number(m[1]);
  const any = statusMessage.match(/(-?\d+)\s*\(quiz\)/);
  if (any?.[1] !== undefined) return Number(any[1]);
  return null;
}

/** チャットの通知（ログ用）。`type` は `chat` / `me` / `say` / `tell`（18-moderation 6 章） */
export type PlayerMessageEvent = { sender: string; message: string; type: string };

export function parsePlayerMessage(raw: unknown): PlayerMessageEvent | null {
  if (!isObject(raw)) return null;
  const header = raw["header"];
  const body = raw["body"];
  if (!isObject(header) || !isObject(body)) return null;
  if (header["eventName"] !== "PlayerMessage") return null;
  const sender = body["sender"];
  const message = body["message"];
  if (typeof sender !== "string" || typeof message !== "string") return null;
  const type = typeof body["type"] === "string" ? body["type"] : "chat";
  return { sender: sender.replace(/§./g, ""), message, type };
}

/**
 * `scoreboard players list` の応答から、追跡中の名前を読む。
 * 想定: "§a追跡対象のプレイヤーが 3 人います: phase, 1:ピカチュウ, 2:黄色い"（英語なら "There are 3 tracked players: …"）。
 * **最初の ":" より後**を ", " で切る。名前にカンマは無い（BP が落とす）。
 */
export function parseTrackedNames(statusMessage: string): string[] {
  const i = statusMessage.indexOf(":");
  if (i < 0) return [];
  return statusMessage
    .slice(i + 1)
    .split(",")
    .map((s) => s.replace(/§./g, "").trim())
    .filter((s) => s.length > 0);
}
