/**
 * `words/*.txt` → `words.json`。正規化後の衝突（1 つの答えは 1 語）・ジャンル名の漏れ・空欄・非 ASCII の英語を検査して止める。
 *
 *   npm run words
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWords } from "../words.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { words, problems, warnings } = loadWords(join(ROOT, "words"));
if (problems.length) {
  console.error("単語リストに問題:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
for (const w of warnings) console.log(w);
writeFileSync(join(ROOT, "words.json"), JSON.stringify(words, null, 0) + "\n", "utf8");
const byKind = new Map<string, number>();
for (const w of words) byKind.set(w.kind, (byKind.get(w.kind) ?? 0) + 1);
console.log(`${words.length} 語 → words.json`, Object.fromEntries(byKind));
const genres = new Map<string, number>();
for (const w of words) genres.set(`${w.kind}/${w.hint || "（なし）"}`, (genres.get(`${w.kind}/${w.hint || "（なし）"}`) ?? 0) + 1);
console.log(`ジャンル ${genres.size} 種:`, [...genres].map(([g, n]) => `${g} ${n}`).join(", "));
const sample = words.find((w) => w.ja === "りんご");
if (sample) console.log("例 りんご:", sample.accepted.join(" | "));
