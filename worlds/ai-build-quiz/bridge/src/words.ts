/**
 * 単語リストの読み込みと検証（`docs/spec/12-words.md`）。
 *
 * `words/<kind>.txt`（タブ区切り・人が書く）→ `Word[]`。
 * `accepted` は正規化済みの正解の集合（表記・読み・別名・英語・ローマ字の全部）。
 * ビルド（`tools/build-words.ts`）はこれを `words.json` に書き出し、bridge 本体はそれを読む。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeAnswer } from "./normalize.js";
import { romajiVariants } from "./romaji.js";

export const KINDS = ["animal", "vehicle", "building", "food", "object", "nature", "character", "person", "plant"] as const;
export type Kind = (typeof KINDS)[number];

/** 生き物として撮る（全身のフィギュア定型）か、物として撮るか */
/** 検証（tools/genlab/verify_words.py）と同じ既定 seed。語ごとの固定 seed は words/*.txt の seed 列 */
export const DEFAULT_SEED = 1;
/** ジャンル 1 つに要る最少の語数（spec 12 の 4-1） */
export const MIN_PER_GENRE = 3;

/** 固定カテゴリの番号（scoreboard `kind` = 1..7。spec 13 の 3 章）。BP の state/mode.ts と同じ並び */
export const KIND_ORDER = ["animal", "vehicle", "building", "food", "object", "nature", "character", "person", "plant"] as const;

export type Style = "creature" | "object" | "food" | "plant";

/** kind → genlab の定型（spec 12 の 4 章）。食べ物と植物は物の定型だと接写・風景になる */
export function styleOf(kind: Kind): Style {
  switch (kind) {
    case "animal":
    case "character":
    case "person":
      return "creature";
    case "food":
      return "food";
    case "nature": // 自然（地形・鉱物）も plant の定型のまま。検証したときの定型を変えない（変えると絵が変わる）
    case "plant":
      return "plant";
    default:
      return "object";
  }
}

export type Word = {
  ja: string;
  reading: string;
  en: string;
  kind: Kind;
  level: 1 | 2 | 3;
  seed?: number;
  /** ジャンル（10 秒のヒント。spec 12 の 4-1）。空なら 2 段目のヒントは出さない */
  hint: string;
  /** 英語の答え（spec 12 の 1-1）。`en` は裏プロンプトなので答えには使わない */
  english: string[];
  /** 明示した別名（元のまま。表示用） */
  aliases: string[];
  /** 正規化済みの正解の集合。BP はこれを受け取って完全一致で判定する */
  accepted: string[];
};

export function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

/** 1 ファイルを読む。`#` 行は無視。壊れた行は例外（黙って落とさない） */
export function parseWordFile(kind: Kind, text: string, file: string): Word[] {
  const out: Word[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim() || line.startsWith("#")) return;
    const cols = line.split("\t");
    const [ja, reading, en, aliasText = "", levelText = "2", seedText = "", hint = "", englishText = ""] = cols.map((c) => c.trim());
    const where = `${file}:${i + 1}`;
    if (!ja || !reading || !en) throw new Error(`${where}: ja / reading / en のどれかが空: ${line}`);
    if (!/^[ぁ-ゖー]+$/.test(reading)) throw new Error(`${where}: reading はひらがなだけ: "${reading}"`);
    // eslint-disable-next-line no-control-regex
    if (!/^[\x20-\x7e]+$/.test(en)) throw new Error(`${where}: en は ASCII だけ（機械翻訳に頼らない）: "${en}"`);
    const level = Number(levelText);
    if (![1, 2, 3].includes(level)) throw new Error(`${where}: level は 1〜3: "${levelText}"`);
    const seed = seedText ? Number(seedText) : DEFAULT_SEED; // 空なら検証と同じ seed。ゲームで出る絵 ＝ 目で確かめた絵
    if (seedText && !Number.isInteger(seed)) throw new Error(`${where}: seed は整数: "${seedText}"`);
    const aliases = aliasText.split(",").map((a) => a.trim()).filter(Boolean);
    const english = englishText.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
    if (english.length === 0) throw new Error(`${where}: english（英語の答え）が空。全語に英語の答えが要る（spec 12 の 1-1）`);
    for (const e of english) if (!/^[ -~]+$/.test(e)) throw new Error(`${where}: english に ASCII 以外: "${e}"`);
    out.push({ ja, reading, en, kind, level: level as 1 | 2 | 3, seed, hint, english, aliases, accepted: acceptedOf(ja, reading, english, aliases) });
  });
  return out;
}

/** 正解として受け付ける文字列の集合（正規化済み） */
export function acceptedOf(ja: string, reading: string, english: string[], aliases: string[]): string[] {
  const raw = new Set<string>([ja, reading, ...english, ...aliases]);
  // 英語: 空白なし・複数形・冠詞なしも受ける
  for (const a of [...english, ...aliases]) {
    if (!/^[\x20-\x7e]+$/.test(a)) continue;
    const core = a.replace(/\([^)]*\)/g, "").trim();
    raw.add(core);
    raw.add(core.replace(/^(a|an|the)\s+/i, ""));
    if (!/s$/i.test(core)) raw.add(core + "s");
  }
  for (const r of romajiVariants(reading)) raw.add(r);
  const out = new Set<string>();
  for (const r of raw) {
    const n = normalizeAnswer(r);
    if (n.length > 0) out.add(n);
  }
  return [...out].sort();
}

/** ディレクトリ全部を読み、**正規化後の衝突**（別の語が同じ答えを受け付ける）とジャンル名を検査する。problems があればビルドは止まる */
export function loadWords(dir: string): { words: Word[]; problems: string[]; warnings: string[] } {
  const words: Word[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()) {
    const kind = f.replace(/\.txt$/, "");
    if (!isKind(kind)) throw new Error(`知らないカテゴリ: ${f}`);
    words.push(...parseWordFile(kind, readFileSync(join(dir, f), "utf8"), f));
  }
  const problems: string[] = [];
  const warnings: string[] = [];
  // 別の語と受理語が重なるのは許す（物の 1 段上の呼び名: スニーカーも靴も「靴」を受ける。spec 12 の 2-3。判定は 1 ラウンド 1 語）。
  // 数だけ見せる。ジャンル名にその語の受理語が入る「ヒントを言えば当たる」は下で止める
  const owner = new Map<string, string[]>();
  for (const w of words) for (const a of w.accepted) owner.set(a, [...(owner.get(a) ?? []), w.ja]);
  const shared = [...owner].filter(([, ws]) => ws.length > 1);
  if (shared.length) warnings.push(`別の語と重なる受理語: ${shared.length} 個（例: ${shared.slice(0, 5).map(([a, ws]) => `${a}=${ws.join("/")}`).join(", ")}）`);
  const seen = new Map<string, number>();
  for (const w of words) seen.set(w.ja, (seen.get(w.ja) ?? 0) + 1);
  for (const [ja, n] of seen) if (n > 1) problems.push(`「${ja}」が ${n} 回ある`);
  // ジャンル名にその語の正解が入っていたらエラー（spec 12 の 4-1。「キャンディ」に「お菓子・キャンディ」、「卵」に「卵」）。
  // 1 文字の漢字（木・花・卵・車）も答えなので数える。1 文字の英字・数字だけは除く（"a" など）。黙ってヒントを消さない
  for (const w of words) {
    if (!w.hint) continue;
    const g = normalizeAnswer(w.hint);
    const hit = w.accepted.filter((a) => !/^[a-z0-9]$/.test(a) && g.includes(a));
    if (hit.length) problems.push(`ジャンル名「${w.hint}」に ${w.ja} の答え（${hit.join(" ")}）が入っている（ジャンル名を付け替える）`);
  }
  // ジャンル（10 秒のヒント）は 1 つにつき 3 語以上（spec 12 の 4-1。2 語以下だと二択になってバレる）
  const genre = new Map<string, number>();
  for (const w of words) if (w.hint) genre.set(`${w.kind}/${w.hint}`, (genre.get(`${w.kind}/${w.hint}`) ?? 0) + 1);
  for (const [g, n] of genre) if (n < MIN_PER_GENRE) problems.push(`ジャンル「${g}」が ${n} 語しかない（${MIN_PER_GENRE} 語以上に）`);
  return { words, problems, warnings };
}
