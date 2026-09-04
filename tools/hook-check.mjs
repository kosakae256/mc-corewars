/**
 * パックの TypeScript を直したら、**その場で `npm run check` を走らせる。**
 *
 * Claude Code の PostToolUse フックから呼ばれる（`.claude/settings.json`）。
 * **標準入力に、どのファイルを触ったかが JSON で来る。**
 *
 * ```
 * echo '{"tool_input":{"file_path":"…/scripts/main.ts"}}' | node tools/hook-check.mjs
 * ```
 *
 * ## なぜ要るのか
 *
 * **決まりは書いただけでは守られない**（`worlds/pve-v3/docs/spec/11-code-rules.md`）。
 * **型・層・行数・テストを、直した直後に機械が見る**——
 * 落ちたら**そのまま作業を止める**（終了コード 2）ので、
 * **壊れたまま次へ進めない。**
 *
 * ## 対象
 *
 * `worlds/<名>/packs/<パック>/` の下の `.ts` だけ。
 * **`npm run check` を持っているパックだけ**走らせる（無ければ何もしない）。
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 標準入力を全部読む */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * リポジトリの中か。
 *
 * **Windows はドライブ文字の大小が揺れる**（`c:\…` と `C:\…`）——
 * そのまま `startsWith` で比べると、**必ず外だと判定して何も走らなかった。**
 */
function inRepo(dir) {
  return dir.toLowerCase().startsWith(ROOT.toLowerCase());
}

/** そのファイルを含むパック（`package.json` に `check` があるもの）を探す */
function packOf(file) {
  let dir = path.dirname(file);
  // **上へたどる。** リポジトリの外へは出ない
  while (inRepo(dir) && dir.toLowerCase() !== ROOT.toLowerCase()) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8"));
        return json.scripts?.check === undefined ? undefined : dir;
      } catch {
        return undefined;
      }
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

const raw = await readStdin();
let file;
try {
  const input = JSON.parse(raw);
  file = input.tool_response?.filePath ?? input.tool_input?.file_path;
} catch {
  process.exit(0);
}
if (typeof file !== "string" || !file.endsWith(".ts")) process.exit(0);

const pack = packOf(path.resolve(file));
if (pack === undefined) process.exit(0);

try {
  execSync("npm run --silent check", { cwd: pack, stdio: "pipe", encoding: "utf8" });
} catch (err) {
  const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim().split("\n").slice(-40).join("\n");
  // **2 で返すと、Claude に「直せ」と伝わる**（`decision: block` と同じ扱い）
  console.error(`[check] ${path.relative(ROOT, pack)} で落ちた。直してから次へ進む。\n\n${out}`);
  process.exit(2);
}
