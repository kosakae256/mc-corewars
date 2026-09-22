/**
 * `/wsserver` 経由の `/scriptevent` が、何文字まで落ちずに届くかを測る（`docs/spec/13-transport.md` 5-2）。
 *
 *   node tools/probe.ts              # ws://127.0.0.1:8767 で待つ
 *   Minecraft で  /wsserver ws://127.0.0.1:8767
 *
 * 長さを段階的に上げて `scriptevent quiz:echo <文字列>` を送り、BP が scoreboard の `echo` に書いた長さを読み戻す。
 * 届かなかった／ワールドが落ちたら、その直前の長さが上限。結果は画面と probe.log に出る。
 * bridge（8766）とは別のポートなので、bridge を止めなくてよい。
 */
import { appendFileSync } from "node:fs";
import { WebSocketServer, type WebSocket } from "ws";

import { commandMessage, parseCommandResponse } from "../src/protocol.ts";

const PORT = 8767;
const STEPS = [400, 410, 420, 430, 440, 450, 460, 470, 480];

function log(s: string): void {
  console.log(s);
  appendFileSync("probe.log", `${new Date().toISOString()} ${s}\n`);
}

const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });
log(`probe: ws://127.0.0.1:${PORT} で待機。Minecraft で /wsserver ws://127.0.0.1:${PORT}`);

wss.on("connection", (socket: WebSocket) => {
  log("接続");
  const pending = new Map<string, (m: string) => void>();
  socket.on("message", (data) => {
    const res = parseCommandResponse(JSON.parse(String(data)));
    if (res) pending.get(res.requestId)?.(res.statusMessage);
  });
  socket.on("close", () => log("切断（ワールドが落ちた？ 最後に成功した長さが上限）"));
  const send = (line: string): Promise<string> =>
    new Promise((resolve) => {
      const { requestId, text } = commandMessage(line);
      const t = setTimeout(() => {
        pending.delete(requestId);
        resolve("(応答なし)");
      }, 4000);
      pending.set(requestId, (m) => {
        clearTimeout(t);
        pending.delete(requestId);
        resolve(m);
      });
      socket.send(text);
    });
  void (async () => {
    await send("scoreboard players set echo quiz 0");
    for (const n of STEPS) {
      const payload = "x".repeat(n);
      const line = `scriptevent quiz:echo ${payload}`;
      const r1 = await send(line);
      await new Promise((r) => setTimeout(r, 300));
      const r2 = await send("scoreboard players list echo");
      const got = r2.match(/quiz:\s*(-?\d+)/)?.[1] ?? "?";
      log(`message ${n} 文字（コマンド全体 ${line.length}）: 送信応答「${r1.slice(0, 60)}」 → BP が受けた長さ ${got}`);
      if (got !== String(n)) {
        log(`× ${n} 文字は届いていない。直前の長さが上限`);
        break;
      }
    }
    // 中身の種類も見る（JSON・日本語）
    const json = JSON.stringify({ round: 1, answer: "マカロン", accepted: ["まかろん", "macaron"], kind: "food", hint: "洋菓子", size: 60, count: 1, chunks: 1, paletteSize: 2 });
    const r = await send(`scriptevent quiz:echo ${json}`);
    await new Promise((r2) => setTimeout(r2, 300));
    const got = (await send("scoreboard players list echo")).match(/quiz:\s*(-?\d+)/)?.[1] ?? "?";
    log(`JSON（日本語・引用符・${json.length} 文字）: 送信応答「${r.slice(0, 60)}」 → 受けた長さ ${got}（一致なら ${json.length}）`);
    log("計測おわり。/wsserver \"\" で切ってよい");
  })();
});
