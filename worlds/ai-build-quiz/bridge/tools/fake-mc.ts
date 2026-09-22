/**
 * 偽の Minecraft。bridge に `/wsserver` のふりをして繋ぎ、届いた `/scriptevent` を
 * **BP の解析コードそのもの**（packs/ai_build_quiz/scripts/core/*）で受けて検証する。
 *
 *   node tools/fake-mc.ts [rounds=1] [custom]      （BRIDGE_PORT=8768 で port を変えられる）
 *
 * bridge（`npm start`）と genlab（server.py）を先に起動しておく。
 * 確かめること: **コマンド全体が 440 バイト以内**（超えるとワールドが落ちる。spec 13）・accept/palette/chunk が揃う・展開した長さが size³・palette が許可リスト・個数が header と一致。
 * `/wsserver` の実物とのずれ（scoreboard の応答の形など）は、ここでは確かめられない。
 */
import WebSocket from "ws";

import { parseChunk, parseRoundHeader, parseRoundNumber, parseStringArrayPart, parseTextPart } from "../../packs/ai_build_quiz/scripts/core/messages.ts";
import { decodeRle } from "../../packs/ai_build_quiz/scripts/core/rle.ts";
import { resolvePalette } from "../../packs/ai_build_quiz/scripts/core/palette.ts";
import { placementOrder, perTick } from "../../packs/ai_build_quiz/scripts/core/order.ts";

const roundsWanted = Number(process.argv[2] ?? "1");
const custom = process.argv[3] === "custom"; // 出題モードの模擬: mode=2、キューの先頭「ピカチュウ／黄色い」を id 付きで出す。go で id が進む（先読みの確認）
let phase = 0; // お題待ち
let topicId = 1; // キューの先頭の id（go で BP が外すのを模す）
let pending: { header: ReturnType<typeof parseRoundHeader>; accepts: Map<number, string[]>; palettes: Map<number, string[]>; chunks: Map<number, string> } | undefined;
let roundsDone = 0;
let maxLen = 0;

const port = process.env["BRIDGE_PORT"] ?? "8766"; // bridge と同じ環境変数で port を合わせる
const ws = new WebSocket(`ws://127.0.0.1:${port}`);
ws.on("open", () => console.log("[fake-mc] bridge に接続"));
ws.on("message", (data) => {
  const msg = JSON.parse(String(data));
  if (msg.header?.messagePurpose === "subscribe") return;
  if (msg.header?.messagePurpose !== "commandRequest") return;
  const line: string = msg.body.commandLine;
  const reply = (statusMessage: string): void => {
    ws.send(JSON.stringify({ header: { requestId: msg.header.requestId, messagePurpose: "commandResponse", version: 1 }, body: { statusCode: 0, statusMessage } }));
  };
  if (line.startsWith("scoreboard players list phase")) {
    reply(`§a選択された 1 個のオブジェクトを phase に表示:\n- quiz: ${phase} (quiz)`);
    return;
  }
  if (line.startsWith("scoreboard players list mode")) {
    reply(`§a選択された 1 個のオブジェクトを mode に表示:\n- quiz: ${custom ? 2 : 0} (quiz)`);
    return;
  }
  if (line.startsWith("scoreboard players list kind")) {
    reply(`§a選択された 1 個のオブジェクトを kind に表示:\n- quiz: 0 (quiz)`);
    return;
  }
  if (line === "scoreboard players list") {
    reply(`§a追跡対象のプレイヤーが 6 人います: phase, mode, kind, 0:${topicId}, 1:ピカチュウ, 2:黄色い`);
    return;
  }
  const m = line.match(/^scriptevent (quiz:[a-z]+) (.*)$/s);
  if (!m) {
    reply("");
    return;
  }
  const id = m[1] as string;
  const message = m[2] as string;
  const bytes = Buffer.byteLength(line, "utf8");
  maxLen = Math.max(maxLen, bytes);
  if (bytes > 440) console.error(`[fake-mc] NG: ${id} のコマンド全体が ${bytes} バイト（440 を超えるとワールドが落ちる）`);
  if (id === "quiz:round") {
    const header = parseRoundHeader(message);
    if (!header) console.error("[fake-mc] NG: round が読めない: " + message.slice(0, 120));
    pending = { header, accepts: new Map(), palettes: new Map(), chunks: new Map() };
    console.log(`[fake-mc] round ${header?.round}: 答え「${header?.answer}」 kind ${header?.kind} hint「${header?.hint}」 size ${header?.size} count ${header?.count} chunks ${header?.chunks} accepts ${header?.accepts} palettes ${header?.palettes}${header?.topicId !== undefined ? ` topicId ${header.topicId}` : ""}`);
    if (custom && header?.topicId !== topicId) console.error(`[fake-mc] NG: topicId が先頭と違う: ${header?.topicId} != ${topicId}`);
  } else if (id === "quiz:accept" || id === "quiz:palette") {
    const p = parseStringArrayPart(message);
    if (!p || !pending) console.error(`[fake-mc] NG: ${id} が読めない: ` + message.slice(0, 80));
    else (id === "quiz:accept" ? pending.accepts : pending.palettes).set(p.index, p.data);
  } else if (id === "quiz:prompt") {
    const p = parseTextPart(message);
    if (!p || !pending) console.error("[fake-mc] NG: prompt が読めない: " + message.slice(0, 80));
    else console.log(`[fake-mc] prompt ${p.index}/${p.total}: ${p.data.slice(0, 100)}`);
  } else if (id === "quiz:chunk") {
    const c = parseChunk(message);
    if (!c || !pending) console.error("[fake-mc] NG: chunk が読めない: " + message.slice(0, 60));
    else pending.chunks.set(c.index, c.data);
  } else if (id === "quiz:go") {
    const n = parseRoundNumber(message);
    const h = pending?.header;
    if (!pending || !h || n !== h.round) {
      console.error("[fake-mc] NG: go が round と合わない");
    } else {
      let rle = "";
      for (let i = 1; i <= h.chunks; i++) rle += pending.chunks.get(i) ?? "";
      const palette: string[] = [];
      for (let i = 1; i <= h.palettes; i++) palette.push(...(pending.palettes.get(i) ?? []));
      const accepted: string[] = [];
      for (let i = 1; i <= h.accepts; i++) accepted.push(...(pending.accepts.get(i) ?? []));
      try {
        resolvePalette(palette);
        const cells = decodeRle(rle, h.size ** 3);
        const { order, count, height } = placementOrder(cells, h.size, h.round);
        const ok = count === h.count && palette.length === h.paletteSize && pending.chunks.size === h.chunks && pending.accepts.size === h.accepts && accepted.length > 0;
        console.log(`[fake-mc] round ${h.round}: chunk ${pending.chunks.size}/${h.chunks}, accept ${accepted.length} 語, palette ${palette.length}, 展開 ${cells.length}, 個数 ${count} (header ${h.count}), 高さ ${height}, N/tick ${perTick(count)}, 最初のセル y=${order[0]?.y} → ${ok ? "OK" : "NG"}`);
      } catch (e) {
        console.error("[fake-mc] NG: 展開に失敗: " + String(e));
      }
    }
    pending = undefined;
    roundsDone++;
    if (custom) topicId++; // go で先頭が外れ、次の件が先頭になる
    phase = 1; // 置いている
    setTimeout(() => {
      phase = roundsDone >= roundsWanted ? 8 : 0; // 次を要求 or idle
      if (roundsDone >= roundsWanted) {
        console.log(`[fake-mc] ${roundsDone} ラウンド検証完了。コマンドの最大 ${maxLen} バイト（上限 440）`);
        setTimeout(() => process.exit(0), 1500);
      }
    }, custom ? 12000 : 2000); // 出題モードは phase 1 の間に先読みが終わるだけ待つ
  } else if (id === "quiz:status") {
    console.log(`[fake-mc] status: ${message}`);
  }
  reply("");
});
ws.on("error", (e) => {
  console.error("[fake-mc] 接続できない（bridge を起動した？）: " + e.message);
  process.exit(1);
});
