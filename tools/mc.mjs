#!/usr/bin/env node
/**
 * BDS / bedrock-portal 統合管理ツール
 *
 *   node tools/mc.mjs <command> [args]
 *
 * 仕様: docs/spec/01-mc-tool.md
 * 自動起動はしない。すべて明示的に叩いて動かす。
 */
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync,
  readdirSync, statSync, openSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "tools", "mc.config.json");
const STATE = join(ROOT, "tools", ".state");

// ---------------------------------------------------------------- utilities

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
};

function die(msg) {
  console.error(c.r("エラー: ") + msg);
  process.exit(1);
}

function loadConfig() {
  if (!existsSync(CONFIG)) die(`設定がありません: ${CONFIG}`);
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}

function saveConfig(cfg) {
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n");
}

/** --server 指定、省略時は最初のサーバー */
function pickServer(cfg, name) {
  const names = Object.keys(cfg.servers ?? {});
  if (names.length === 0) die("mc.config.json にサーバーが定義されていません。");
  const key = name ?? names[0];
  if (!cfg.servers[key]) {
    die(`そんなサーバーはありません: ${key}\n定義済み: ${names.join(", ")}`);
  }
  const s = { name: key, ...cfg.servers[key] };
  if (!existsSync(s.dir)) die(`BDS のフォルダが見つかりません: ${s.dir}`);
  return s;
}

/** server.properties を key=value のオブジェクトとして読む */
function readProps(dir) {
  const p = join(dir, "server.properties");
  if (!existsSync(p)) die(`server.properties がありません: ${p}`);
  const map = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([a-z0-9-]+)=(.*)$/.exec(line);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

/** server.properties を書き換える（コメントと順序は保持） */
function writeProps(dir, changes) {
  const p = join(dir, "server.properties");
  let s = readFileSync(p, "utf8");
  const applied = [];
  for (const [k, v] of Object.entries(changes)) {
    const re = new RegExp("^" + k.replace(/-/g, "\\-") + "=.*$", "m");
    if (re.test(s)) {
      s = s.replace(re, `${k}=${v}`);
      applied.push(`${k}=${v}`);
    } else {
      s = s.replace(/\s*$/, `\n${k}=${v}\n`);
      applied.push(`${k}=${v} (追記)`);
    }
  }
  writeFileSync(p, s);
  return applied;
}

const pidFile = (name) => join(STATE, `${name}.pid`);
const logFile = (name) => join(STATE, `${name}.log`);

function runningPid(name) {
  const f = pidFile(name);
  if (!existsSync(f)) return null;
  const pid = parseInt(readFileSync(f, "utf8").trim(), 10);
  if (!pid) return null;
  try {
    process.kill(pid, 0); // 存在確認のみ
    return pid;
  } catch {
    return null;
  }
}

/** バックグラウンドで起動し、PID を記録する */
function launch(name, exe, argv, cwd, env) {
  mkdirSync(STATE, { recursive: true });
  const out = logFile(name);
  writeFileSync(out, "");
  const fd = openSync(out, "a");
  const child = spawn(exe, argv, {
    cwd, detached: true, stdio: ["ignore", fd, fd],
    env: env ? { ...process.env, ...env } : process.env,
  });
  child.unref();
  writeFileSync(pidFile(name), String(child.pid));
  return child.pid;
}

function terminate(name) {
  const pid = runningPid(name);
  if (!pid) return null;
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // 既に落ちている
  }
  rmSync(pidFile(name), { force: true });
  return pid;
}

// ------------------------------------------------------------ client worlds

function clientWorldDirs() {
  const base = join(process.env.APPDATA ?? "", "Minecraft Bedrock", "Users");
  if (!existsSync(base)) return [];
  const out = [];
  for (const user of readdirSync(base)) {
    const mw = join(base, user, "games", "com.mojang", "minecraftWorlds");
    if (!existsSync(mw)) continue;
    for (const id of readdirSync(mw)) {
      const dir = join(mw, id);
      if (!statSync(dir).isDirectory()) continue;
      let name = "(levelname.txt なし)";
      const ln = join(dir, "levelname.txt");
      if (existsSync(ln)) name = readFileSync(ln, "utf8").trim();
      out.push({ user, id, dir, name });
    }
  }
  return out;
}

function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else total += st.size;
    }
  };
  try {
    walk(dir);
  } catch {
    // 読めないものは無視
  }
  return total;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

// ------------------------------------------------------------------ commands

const commands = {};

commands.status = (args, cfg) => {
  console.log(c.b("サーバー"));
  for (const [name, s] of Object.entries(cfg.servers ?? {})) {
    const pid = runningPid(name);
    const props = existsSync(s.dir) ? readProps(s.dir) : {};
    const state = pid ? c.g(`稼働中 (PID ${pid})`) : c.dim("停止");
    console.log(`  ${c.b(name.padEnd(12))} ${state}`);
    console.log(`    dir   ${s.dir}`);
    console.log(
      `    port  ${props["server-port"] ?? "?"}   world: ${props["level-name"] ?? "?"}` +
      `   cheats: ${props["allow-cheats"] ?? "?"}   allow-list: ${props["allow-list"] ?? "?"}`
    );
  }
  console.log();
  for (const svc of ["portal", "bots", "ws", "relay"]) {
    const pid = runningPid(svc);
    console.log(`${c.b(svc)}`);
    console.log(`  ${pid ? c.g(`稼働中 (PID ${pid})`) : c.dim("停止")}`);
  }
};

commands.start = (args, cfg) => {
  const s = pickServer(cfg, args._[0] ?? args.server);
  const existing = runningPid(s.name);
  if (existing) die(`${s.name} は既に稼働中です (PID ${existing})`);
  // BDS を直接ではなく監督プロセス経由で起動する。
  // こうしないとコンソール（stdin）に `op` や `reload all` を送れない
  const supervisor = join(ROOT, "tools", "supervisor", "supervisor.mjs");
  const pid = launch(
    s.name,
    process.execPath,
    [supervisor, s.dir, String(s.controlPort ?? 45600)],
    s.dir
  );
  const props = readProps(s.dir);
  console.log(
    `${c.g("起動")} ${s.name}  PID ${pid}  port ${props["server-port"]}  world ${props["level-name"]}`
  );
  console.log(c.dim(`ログ: node tools/mc.mjs logs ${s.name}`));
};

commands.stop = (args, cfg) => {
  const s = pickServer(cfg, args._[0] ?? args.server);
  const pid = terminate(s.name);
  console.log(pid ? `${c.y("停止")} ${s.name} (PID ${pid})` : `${s.name} は停止しています。`);
};

commands.restart = (args, cfg) => {
  commands.stop(args, cfg);
  commands.start(args, cfg);
};

commands.logs = (args, cfg) => {
  const raw = args._[0];
  const name = ["portal", "bots", "ws", "relay"].includes(raw) ? raw : pickServer(cfg, raw ?? args.server).name;
  const n = parseInt(args.n ?? "40", 10);
  const f = logFile(name);
  if (!existsSync(f)) die(`ログがありません: ${f}`);
  console.log(readFileSync(f, "utf8").split(/\r?\n/).slice(-n).join("\n"));
};

/**
 * BDS のコンソールにコマンドを送る。
 *
 * `op` / `allowlist` / `reload all` など、
 * コンソールでしか実行できない操作に使う。
 */
commands.console = (args, cfg) => {
  const s = pickServer(cfg, args.server);
  if (!runningPid(s.name)) die(`${s.name} が起動していません。`);
  const cmd = args._.join(" ");
  if (!cmd) die('コマンドを指定してください。例: node tools/mc.mjs console "op zerda256py"');

  const port = s.controlPort ?? 45600;
  void fetch(`http://127.0.0.1:${port}/command?cmd=${encodeURIComponent(cmd)}`)
    .then((r) => r.json())
    .then((r) => {
      console.log(r.ok ? c.g(r.message) : c.r(r.message));
      console.log(c.dim(`結果: node tools/mc.mjs logs ${s.name}`));
    })
    .catch((e) => die(`監督プロセスに繋がりません: ${e.message}`));
};

commands.worlds = (args, cfg) => {
  const s = pickServer(cfg, args._[0] ?? args.server);
  const wd = join(s.dir, "worlds");
  const cur = readProps(s.dir)["level-name"];
  if (!existsSync(wd)) {
    console.log("worlds フォルダがまだありません。");
    return;
  }
  console.log(c.b(`${s.name} のワールド`) + c.dim(`  (${wd})`));
  for (const d of readdirSync(wd)) {
    const p = join(wd, d);
    if (!statSync(p).isDirectory()) continue;
    const mark = d === cur ? c.g(" ← 使用中 (level-name)") : "";
    console.log(`  ${d.padEnd(24)} ${mb(dirSize(p)).padStart(10)}${mark}`);
  }
};

commands["client-worlds"] = () => {
  const ws = clientWorldDirs();
  if (ws.length === 0) {
    console.log("クライアント側のワールドはありません。");
    return;
  }
  console.log(c.b("クライアント側のワールド"));
  console.log(c.dim("  import-world にはこの ID を渡す"));
  console.log();
  for (const w of ws) {
    console.log(`  ${c.b(w.id)}`);
    console.log(`    名前: ${w.name}`);
    console.log(`    ${c.dim(`${mb(dirSize(w.dir))}  user=${w.user}`)}`);
  }
};

commands["import-world"] = (args, cfg) => {
  const id = args._[0];
  if (!id) die("ワールド ID を指定してください。`node tools/mc.mjs client-worlds` で確認できます。");
  const s = pickServer(cfg, args.server);
  const pid = runningPid(s.name);
  if (pid) die(`${s.name} が稼働中です (PID ${pid})。先に stop してください。`);

  const src = clientWorldDirs().find((w) => w.id === id);
  if (!src) die(`そのワールドが見つかりません: ${id}`);

  const name = args.as ?? src.name.replace(/[^A-Za-z0-9_-]/g, "_");
  const dest = join(s.dir, "worlds", name);
  if (existsSync(dest)) {
    die(`既に存在します: ${dest}\n上書きはしません。--as で別名を指定してください。`);
  }

  cpSync(src.dir, dest, { recursive: true });
  writeFileSync(join(dest, "levelname.txt"), name);
  console.log(
    `${c.g("取り込み完了")}  "${src.name}" → ${s.name}/worlds/${name}  (${mb(dirSize(dest))})`
  );
  console.log(c.dim(`次: node tools/mc.mjs use-world ${name} --server ${s.name}`));
};

commands["use-world"] = (args, cfg) => {
  const name = args._[0];
  if (!name) die("ワールド名を指定してください。");
  const s = pickServer(cfg, args.server);
  const pid = runningPid(s.name);
  if (pid) die(`${s.name} が稼働中です (PID ${pid})。先に stop してください。`);
  if (!existsSync(join(s.dir, "worlds", name))) {
    die(`worlds/${name} がありません。\n（この名前で起動すると BDS が新規に通常世界を生成します）`);
  }
  writeProps(s.dir, { "level-name": name });
  console.log(`${c.g("切り替え")} ${s.name} の level-name → ${name}`);
};

/**
 * ワールドのバックアップ（docs/spec/07-world-tools.md）。
 *
 * **手で建てる作業には必須。** 消してしまった・壊してしまったを戻せるようにする。
 * 世代を残すので、いつのものかが分かる名前を付ける。
 */
commands.backup = (args, cfg) => {
  const s = pickServer(cfg, args._[0] ?? args.server);
  const world = readProps(s.dir)["level-name"];
  const src = join(s.dir, "worlds", world);
  if (!existsSync(src)) die(`ワールドが見つかりません: ${src}`);

  // **稼働中はコピーしない。** 書き込み途中のファイルを掴むと壊れたバックアップになる
  if (runningPid(s.name)) {
    die(`${s.name} が稼働中です。停止してから取ってください（node tools/mc.mjs stop ${s.name}）`);
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const label = args.label ? `_${args.label}` : "";
  const dest = join(ROOT, "world", "backups", `${world}_${stamp}${label}`);

  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`${c.g("保存")} ${dest}  ${mb(dirSize(dest))}`);
};

/** バックアップの一覧 */
commands.backups = () => {
  const dir = join(ROOT, "world", "backups");
  if (!existsSync(dir)) {
    console.log("バックアップはまだありません。");
    return;
  }
  const list = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
  if (list.length === 0) {
    console.log("バックアップはまだありません。");
    return;
  }
  console.log(c.b("バックアップ") + c.dim(`  (${dir})`));
  for (const d of list.sort().reverse()) {
    console.log(`  ${d.padEnd(40)} ${mb(dirSize(join(dir, d))).padStart(10)}`);
  }
};

/**
 * バックアップから戻す。
 *
 * **戻す前に今の状態も取っておく。** 戻した先が期待と違ったとき、
 * 元に戻せないと詰むため。
 */
commands.restore = (args, cfg) => {
  const name = args._[0];
  if (!name) die("restore <バックアップ名>  （一覧は backups）");

  const s = pickServer(cfg, args.server);
  if (runningPid(s.name)) {
    die(`${s.name} が稼働中です。停止してから戻してください`);
  }

  const src = join(ROOT, "world", "backups", name);
  if (!existsSync(src)) die(`見つかりません: ${src}`);

  const world = readProps(s.dir)["level-name"];
  const dest = join(s.dir, "worlds", world);

  // 戻す前に今の状態を退避する
  if (existsSync(dest)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
    const keep = join(ROOT, "world", "backups", `${world}_${stamp}_restore前`);
    cpSync(dest, keep, { recursive: true });
    console.log(c.dim(`  戻す前の状態を退避: ${keep}`));
    rmSync(dest, { recursive: true, force: true });
  }

  cpSync(src, dest, { recursive: true });
  console.log(`${c.g("復元")} ${name} → ${world}`);
};

commands.deploy = (args, cfg) => {
  const addon = args._[0];
  if (!addon) die("アドオン名を指定してください。");
  const addonDir = join(ROOT, "addons", addon);
  if (!existsSync(addonDir)) die(`addons/${addon} がありません。`);
  const s = pickServer(cfg, args.server);
  const level = readProps(s.dir)["level-name"];

  console.log(c.dim(`ビルド中: addons/${addon}`));
  execFileSync("npm", ["run", "build"], {
    cwd: addonDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const readManifest = (p) => JSON.parse(readFileSync(p, "utf8"));

  // BP
  const bpSrc = join(addonDir, "behavior_packs", addon);
  const bpDest = join(s.dir, "development_behavior_packs", addon);
  rmSync(bpDest, { recursive: true, force: true });
  cpSync(bpSrc, bpDest, { recursive: true });
  cpSync(join(addonDir, "dist", "scripts"), join(bpDest, "scripts"), { recursive: true });
  const bpUuid = readManifest(join(bpSrc, "manifest.json")).header.uuid;

  // RP
  const rpSrc = join(addonDir, "resource_packs", addon);
  let rpUuid = null;
  if (existsSync(rpSrc)) {
    const rpDest = join(s.dir, "development_resource_packs", addon);
    rmSync(rpDest, { recursive: true, force: true });
    cpSync(rpSrc, rpDest, { recursive: true });
    rpUuid = readManifest(join(rpSrc, "manifest.json")).header.uuid;
  }

  // ワールドへの適用定義
  const worldDir = join(s.dir, "worlds", level);
  if (!existsSync(worldDir)) {
    console.log(c.y(`警告: worlds/${level} がまだありません。一度起動すると生成されます。`));
  } else {
    const upsert = (file, uuid) => {
      const p = join(worldDir, file);
      const list = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
      const found = list.find((e) => e.pack_id === uuid);
      if (found) found.version = [1, 0, 0];
      else list.push({ pack_id: uuid, version: [1, 0, 0] });
      writeFileSync(p, JSON.stringify(list, null, 2) + "\n");
    };
    upsert("world_behavior_packs.json", bpUuid);
    if (rpUuid) upsert("world_resource_packs.json", rpUuid);
  }

  console.log(`${c.g("配置完了")} ${addon} → ${s.name} (world: ${level})`);
  console.log(c.dim("反映: スクリプトのみなら /reload、JSON や manifest を変えたなら restart"));
};

commands["add-server"] = (args, cfg) => {
  const name = args._[0];
  const port = parseInt(args.port ?? "0", 10);
  if (!name) die("サーバー名を指定してください。");
  if (!port) die("--port を指定してください。");
  if (cfg.servers[name]) die(`既に定義されています: ${name}`);
  const from = pickServer(cfg, args.from);

  const dest = args.dir ?? join(dirname(from.dir), name);
  if (existsSync(dest)) die(`既に存在します: ${dest}`);

  console.log(c.dim(`複製中: ${from.dir} → ${dest}`));
  cpSync(from.dir, dest, {
    recursive: true,
    filter: (src) => !/[\\/]worlds([\\/]|$)/.test(src) && !/\.(log|pid)$/.test(src),
  });

  const applied = writeProps(dest, {
    "server-port": port,
    "server-portv6": port + 1,
    // 2台目以降はポート衝突を避けるため必須（既定 true だと 19132/19133 にもバインドする）
    "enable-lan-visibility": "false",
    "level-name": name,
    "server-name": name,
  });

  cfg.servers[name] = { dir: dest, port };
  saveConfig(cfg);
  console.log(`${c.g("作成")} ${name}`);
  applied.forEach((a) => console.log(`    ${a}`));
  console.log(c.dim(`起動: node tools/mc.mjs start ${name}`));
};

commands.bots = (args) => {
  const sub = args._[0];
  const dir = join(ROOT, "tools", "bots");
  if (sub === "start") {
    const existing = runningPid("bots");
    if (existing) die(`bots は既に稼働中です (PID ${existing})`);
    if (!existsSync(join(dir, "node_modules"))) {
      die("tools/bots で npm install を実行してください。");
    }
    // TypeScript なので、起動前に必ずビルドする
    console.log(c.dim("ビルド中: tools/bots"));
    execFileSync("npm", ["run", "build"], {
      cwd: dir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    // --trace を付けると受信パケットまで記録する（切り分け用）
    const pid = launch(
      "bots", process.execPath, [join(dir, "dist", "main.js")], dir,
      args.trace ? { BOTS_TRACE: "1" } : undefined
    );
    console.log(`${c.g("起動")} bots  PID ${pid}`);
    console.log(c.dim("  node tools/mc.mjs logs bots   で状況を確認できます"));
  } else if (sub === "stop") {
    const pid = terminate("bots");
    console.log(pid ? `${c.y("停止")} bots (PID ${pid})` : "bots は停止しています。");
  } else if (["summon", "dismiss", "list", "forget"].includes(sub)) {
    // ボットが0体だとゲーム内のコマンドが誰にも届かないので、
    // CLI からマネージャの制御サーバーを直接叩く
    if (!runningPid("bots")) die("bots が起動していません。`node tools/mc.mjs bots start`");
    const cfgPath = join(dir, "bots.config.json");
    const port = JSON.parse(readFileSync(cfgPath, "utf8")).control?.port ?? 45500;
    const name = args._[1];
    const q = new URLSearchParams();
    if (name) q.set("name", name);
    const qs = q.toString();
    const url = `http://127.0.0.1:${port}/${sub}` + (qs ? `?${qs}` : "");
    void fetch(url)
      .then((r) => r.json())
      .then((r) => console.log(r.ok ? c.g(r.message) : c.r(r.message)))
      .catch((e) => die(`制御サーバーに繋がりません: ${e.message}`));
  } else {
    die("bots start | stop | summon [名前] | dismiss <名前|all> | list | forget");
  }
};

commands.ws = (args) => {
  const sub = args._[0];
  const dir = join(ROOT, "tools", "wsbridge");
  if (sub === "start") {
    const existing = runningPid("ws");
    if (existing) die(`ws は既に稼働中です (PID ${existing})`);
    if (!existsSync(join(dir, "node_modules"))) {
      die("tools/wsbridge で npm install を実行してください。");
    }
    console.log(c.dim("ビルド中: tools/wsbridge"));
    execFileSync("npm", ["run", "build"], {
      cwd: dir, stdio: "inherit", shell: process.platform === "win32",
    });
    const pid = launch(
      "ws", process.execPath, [join(dir, "dist", "main.js")], dir,
      args.trace ? { WSBRIDGE_TRACE: "1" } : undefined
    );
    console.log(`${c.g("起動")} ws  PID ${pid}`);
    const port = JSON.parse(readFileSync(join(dir, "wsbridge.config.json"), "utf8")).server?.port ?? 8765;
    console.log(c.dim(`  ゲーム内で /wsserver ws://127.0.0.1:${port} を実行してください`));
  } else if (sub === "stop") {
    const pid = terminate("ws");
    console.log(pid ? `${c.y("停止")} ws (PID ${pid})` : "ws は停止しています。");
  } else {
    die("ws start | ws stop");
  }
};

/**
 * クライアントと BDS の間に入るプロキシ（docs/spec/06-relay.md）。
 *
 * 段階1は素通し。全員の通信がここを通るので、
 * 使わないときは止めて portal の向き先を BDS に戻すこと。
 */
commands.relay = (args) => {
  const sub = args._[0];
  const dir = join(ROOT, "tools", "relay");
  if (sub === "start") {
    const existing = runningPid("relay");
    if (existing) die(`relay は既に稼働中です (PID ${existing})`);
    if (!existsSync(join(dir, "node_modules"))) {
      die("tools/relay で npm install を実行してください。");
    }
    const pid = launch("relay", process.execPath, [join(dir, "relay.mjs")], dir);
    console.log(`${c.g("起動")} relay  PID ${pid}`);
    console.log(c.dim("  portal の転送先を relay のポートに向けてください"));
  } else if (sub === "stop") {
    const pid = terminate("relay");
    console.log(pid ? `${c.y("停止")} relay (PID ${pid})` : "relay は停止しています。");
  } else {
    die("relay start | relay stop");
  }
};

commands.portal = (args) => {
  const sub = args._[0];
  const dir = join(ROOT, "tools", "portal");
  if (sub === "start") {
    const existing = runningPid("portal");
    if (existing) die(`portal は既に稼働中です (PID ${existing})`);
    if (!existsSync(join(dir, "node_modules"))) {
      die("tools/portal で npm install を実行してください。");
    }
    const pid = launch("portal", process.execPath, [join(dir, "portal.mjs")], dir);
    console.log(`${c.g("起動")} portal  PID ${pid}`);
    console.log(c.y("初回は Xbox Live のデバイスコード認証が必要です。"));
    console.log(c.dim("  node tools/mc.mjs logs portal   でコードを確認してください"));
  } else if (sub === "stop") {
    const pid = terminate("portal");
    console.log(pid ? `${c.y("停止")} portal (PID ${pid})` : "portal は停止しています。");
  } else {
    die("portal start | portal stop");
  }
};

// ---------------------------------------------------------------------- main

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      out[a.slice(2)] = next === undefined || next.startsWith("--") ? true : argv[++i];
    } else if (a === "-n") {
      out.n = argv[++i];
    } else {
      out._.push(a);
    }
  }
  return out;
}

const [, , cmd, ...rest] = process.argv;

if (!cmd || cmd === "help" || cmd === "--help") {
  console.log(`
${c.b("mc.mjs")} — BDS / bedrock-portal 管理ツール  ${c.dim("(docs/spec/01-mc-tool.md)")}

  ${c.b("status")}                                    全体の稼働状況
  ${c.b("start")} <server>                            BDS を起動
  ${c.b("stop")} <server>                             BDS を停止
  ${c.b("restart")} <server>                          再起動
  ${c.b("logs")} <server|portal|bots|ws|relay> [-n N] ログ（既定 40 行）
  ${c.b("console")} "<コマンド>"                      BDS のコンソールに送る（op / reload all 等）

  ${c.b("deploy")} <addon> [--server s]               アドオンをビルドして配置
  ${c.b("backup")} [server] [--label 名前]           ワールドを保存（停止中のみ）
  ${c.b("backups")}                              バックアップ一覧
  ${c.b("restore")} <名前>                        バックアップから戻す
  ${c.b("worlds")} [--server s]                       BDS 側のワールド一覧
  ${c.b("client-worlds")}                             クライアント側のワールド一覧
  ${c.b("import-world")} <id> [--as n] [--server s]   クライアントのワールドを取り込む
  ${c.b("use-world")} <name> [--server s]             level-name を切り替える
  ${c.b("add-server")} <name> --port <p>              新しいサーバーを作る

  ${c.b("ws start")} / ${c.b("ws stop")}                        通常ワールド用 LLM 中継
  ${c.b("portal start")} / ${c.b("portal stop")}                bedrock-portal（フレンド欄）
  ${c.b("relay start")} / ${c.b("relay stop")}                  クライアントと BDS の間のプロキシ
  ${c.b("bots start")} / ${c.b("bots stop")}                    偽プレイヤー + LLM
  ${c.b("bots summon")} [名前] / ${c.b("bots dismiss")} <名前|all>
  ${c.b("bots list")} / ${c.b("bots forget")}                     一覧 / 会話履歴の破棄
`);
  process.exit(0);
}

if (!commands[cmd]) die(`不明なコマンド: ${cmd}\n\`node tools/mc.mjs help\` で一覧が出ます。`);
commands[cmd](parseArgs(rest), loadConfig());
