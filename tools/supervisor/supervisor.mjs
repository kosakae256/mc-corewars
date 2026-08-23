#!/usr/bin/env node
/**
 * BDS の監督プロセス。
 *
 * ## なぜ必要か
 *
 * BDS は**コンソール（標準入力）でしか実行できない操作**がある。
 *   - `op <名前>` … オペレーター権限の付与
 *   - `allowlist add <名前>` … 許可リスト
 *   - `reload all` … プロセスを落とさずにパックを再読み込み
 *
 * バックグラウンドで起動しただけでは stdin に書けないため、
 * 権限付与のたびにプロセスごと再起動する羽目になっていた。
 *
 * この監督プロセスが BDS を子プロセスとして抱え、**stdin を保持したまま**、
 * ローカル HTTP でコマンドを受け付ける。
 *
 * `127.0.0.1` にのみ bind する。外部に晒さない。
 *
 * 使い方（直接は叩かず mc.mjs 経由）:
 *   node supervisor.mjs <BDSのフォルダ> <制御ポート>
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";

const [, , serverDir, portArg] = process.argv;
if (!serverDir || !portArg) {
  console.error("使い方: node supervisor.mjs <BDSのフォルダ> <制御ポート>");
  process.exit(1);
}
const port = Number(portArg);

// stdin をパイプで保持する。これがコンソール入力の口になる
const bds = spawn(join(serverDir, "bedrock_server.exe"), [], {
  cwd: serverDir,
  stdio: ["pipe", "inherit", "inherit"],
});

bds.on("exit", (code) => {
  console.log(`[supervisor] BDS が終了しました (code=${code})`);
  process.exit(code ?? 0);
});

const control = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (url.pathname !== "/command") {
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, message: "/command?cmd=... のみ" }));
    return;
  }

  const cmd = url.searchParams.get("cmd");
  if (!cmd) {
    res.end(JSON.stringify({ ok: false, message: "cmd が空です" }));
    return;
  }

  // BDS のコンソールに1行流す。応答は BDS の標準出力に出るので、
  // 結果はログ側で確認する（HTTP では送信の成否だけ返す）
  const written = bds.stdin.write(cmd + "\n");
  console.log(`[supervisor] > ${cmd}`);
  res.end(JSON.stringify({ ok: written, message: `送信: ${cmd}` }));
});

control.listen(port, "127.0.0.1", () => {
  console.log(`[supervisor] 制御 127.0.0.1:${port} で待機`);
});

const shutdown = () => {
  console.log("[supervisor] 停止します");
  // BDS には stop を送って正常終了させる（ワールドの破損を避ける）
  try {
    bds.stdin.write("stop\n");
  } catch {
    bds.kill();
  }
  control.close();
  setTimeout(() => process.exit(0), 5000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
