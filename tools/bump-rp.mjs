/**
 * リソースパックの版を 1 つ上げる。
 *
 * ## なぜ要るのか
 *
 * **参加してきた人は、パックをネットワーク越しに受け取って手元に貯める。**
 * 貯めたものの見分けは **UUID と版**でしかしていない。
 *
 * > 版が同じなら、中身が変わっていても取り直さない。
 *
 * `version` を `[1, 0, 0]` のまま配り続けると、
 * 一度でも参加した人は**最初に受け取った版をずっと見続ける。**
 * **ホストにだけ見えて、他の人には見えない**という形で出る。
 *
 * 経緯は `docs/research/02-hot-reload.md` 7章。
 *
 * ## 上げるのは RP だけ
 *
 * **BP は参加者に配られない。** サーバ側でしか動かないので、
 * 版を上げても誰の手元も変わらない。
 *
 * ## 手で叩くものではない（2026-08-25 変更）
 *
 * **配るたびに自動で上がる。**
 * `npm run local-deploy` と `npm run mcaddon` が
 * `--if-changed` を付けてこれを呼ぶ（各パックの `just.config.ts`）。
 *
 * 手順に「忘れなければ大丈夫」を残さない。
 * **忘れたときに壊れ方が分かりにくい**——他人の画面でだけ古いまま——ので、
 * 人の記憶に預けてよい類のものではない。
 *
 * ### 中身が変わったときだけ上げる
 *
 * `--if-changed` は `resource_packs/<名>/` を丸ごと数え上げて指紋を取り、
 * 前回と違うときだけ上げる。
 *
 * **`--watch` で回している間、保存のたびに上がっては困る。**
 * TypeScript を直しただけなら RP の中身は変わらないので、版も動かない。
 *
 * 指紋は `<パック>/.rp-version.json` に残す。**git に入れる。**
 * 手元にしか無いと、別の機械で必ず 1 回ずれる。
 *
 * ## 使い方
 *
 *   node tools/bump-rp.mjs                  すべての RP を上げる
 *   node tools/bump-rp.mjs game             指定したパックだけ上げる
 *   node tools/bump-rp.mjs game --if-changed  中身が変わったときだけ上げる
 *   node tools/bump-rp.mjs --dry-run        上げずに、どうなるかだけ見る
 *
 * ## 版を上げたあと
 *
 * ワールドの `world_resource_packs.json` は UUID と版の組で書いてある。
 * **食い違ってパックが消えたら** `node tools/attach-packs.mjs --write`
 * で付け直す（要ワールド閉）。
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * リポジトリの根。
 *
 * **cwd に頼らない。** この道具はビルドの途中からも呼ばれるので、
 * どこから叩かれても同じ場所を指す必要がある。
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 対象。**`tools/attach-packs.mjs` の `PACKS` と揃えること** */
const PACKS = [
  { dir: "worlds/core-wars/packs/game", name: "game" },
  { dir: "worlds/core-wars/packs/kit", name: "kit" },
  { dir: "worlds/pve-v3/packs/pve_v3", name: "pve_v3" },
];

const DRY = process.argv.includes("--dry-run");
const IF_CHANGED = process.argv.includes("--if-changed");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/** patch（3 つ目）だけ上げる。**意味のある区切りは人が決める** */
function bumped(version) {
  const [major, minor, patch] = version;
  return [major, minor, patch + 1];
}

/** 下にあるファイルを全部、道順の順に並べる */
function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

/**
 * RP の中身の指紋。
 *
 * **manifest の版そのものは数に入れない。**
 * 入れると、上げた次の回に「変わった」と見えて永久に上がり続ける。
 * 版以外（依存や名前）の変更は拾いたいので、版だけ 0 に潰して混ぜる。
 */
function fingerprint(rpDir) {
  const hash = createHash("sha256");
  for (const path of filesUnder(rpDir)) {
    hash.update(relative(rpDir, path).replace(/\\/g, "/"));
    if (path.endsWith("manifest.json")) {
      const m = JSON.parse(readFileSync(path, "utf8"));
      m.header.version = [0, 0, 0];
      for (const mod of m.modules ?? []) mod.version = [0, 0, 0];
      hash.update(JSON.stringify(m));
    } else {
      hash.update(readFileSync(path));
    }
  }
  return hash.digest("hex");
}

let changed = 0;
let looked = 0;

for (const pack of PACKS) {
  if (only.length > 0 && !only.includes(pack.name)) continue;
  looked++;

  const rpDir = join(ROOT, pack.dir, "resource_packs", pack.name);
  const manifestPath = join(rpDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.log(`  ${pack.name.padEnd(6)} （RP なし・飛ばす）`);
    continue;
  }

  // ---- 中身が変わっていないなら何もしない
  const stampPath = join(ROOT, pack.dir, ".rp-version.json");
  const now = fingerprint(rpDir);
  if (IF_CHANGED && existsSync(stampPath)) {
    const before = JSON.parse(readFileSync(stampPath, "utf8"));
    if (before.fingerprint === now) {
      console.log(`  ${pack.name.padEnd(6)} RP  ${before.version.join(".")}（中身に変化なし）`);
      continue;
    }
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const before = manifest.header.version;
  const after = bumped(before);

  // **header と modules を揃える。**
  // 片方だけ上げると、どちらを見ているのか分からなくなる
  manifest.header.version = after;
  for (const mod of manifest.modules ?? []) mod.version = after;

  console.log(`  ${pack.name.padEnd(6)} RP  ${before.join(".")} → ${after.join(".")}`);
  if (!DRY) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    // **版を潰して数えているので、書き換えた後も指紋は同じ**
    writeFileSync(stampPath, JSON.stringify({ version: after, fingerprint: now }, null, 2) + "\n");
  }
  changed++;
}

if (looked === 0) {
  console.log(`対象が無かった: ${only.join(" ")}`);
  process.exit(1);
}

if (DRY) console.log("\n--dry-run なので書いていない。");
