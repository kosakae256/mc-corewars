/**
 * 出題モードのお題（ひらがな）を、生成用の英語プロンプトにする（`docs/spec/17-modes.md` 3 章）。**答えには関わらない**
 * （答えはお題そのもの。ひらがな完答——本人・2026-09-22）。
 *
 * **言語モデルだけで作る**（本人「LLM 解釈だけで良い。思考コスト高くてもいいので、しっかりしたプロンプトを」）。
 * 和英辞書（JMdict）は「辞書では せんしゃ = tank」というヒントとして添えるだけ（9b でも「せんしゃ」を wheelchair と読んだ）。
 * 落ちていれば、お題をそのまま genlab に渡す（genlab が辞書・機械翻訳で英語にする）。
 * 外から来る JSON は信用しない（型ガード）。
 */

import { readFileSync } from "node:fs";

import { kataToHira, normalizeAnswer } from "./normalize.js";
import { romajiVariants } from "./romaji.js";
import { styleOf, type Style, type Word } from "./words.js";

export type LlmConfig = { url: string; model: string; keepAlive: string; timeoutMs: number; enabled: boolean };

export type Interpreted = {
  /** genlab に渡す英語の描写（200 文字以内） */
  en: string;
  style: Style | "auto";
  /** どう作ったか（ログ用）。list = 単語リストの裏プロンプト、dict = 和英辞書、detail = 詳細だけ、fallback = ローマ字 */
  source: "list" | "llm" | "dict" | "wiki" | "detail" | "unknown" | "fallback";
  /** 言語モデルが「混同しやすい」と言った物（ログ用） */
  confusable: string[];
  /** genlab に別々に翻訳させる詳細（日本語のまま）。en に織り込み済みなら空 */
  detail: string;
};

/** 和英辞書（ヒント用）。表記 → 英語 */
export type Dict = Map<string, string>;

export function loadDict(path: string): Dict | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof raw !== "object" || raw === null) return undefined;
    const dict: Dict = new Map();
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === "string" && v) dict.set(k, v);
    return dict;
  } catch {
    return undefined;
  }
}

/** genlab の `/build` が受ける長さ（画像モデルは先頭 77 トークンしか読まないが、入力としては通す） */
export const EN_MAX = 4000;

const STYLES: ReadonlySet<string> = new Set(["creature", "object", "food", "plant"]);

export function hiraToKata(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= 0x3041 && c <= 0x3096 ? String.fromCodePoint(c + 0x60) : ch;
  }
  return out;
}

/** Wikipedia の対訳（08-genlab 2-0b）: 空白を除いた題名 → 英語の題名。そのまま・カタカナで引く */
export function wikiName(wiki: Dict | undefined, topic: string): string | undefined {
  if (!wiki) return undefined;
  const t = topic.replace(/\s+/g, "");
  return wiki.get(t) ?? wiki.get(hiraToKata(t)) ?? wiki.get(kataToHira(t));
}

/** 辞書のヒント（そのまま・カタカナ・ひらがなで引いて、見つかった英語を並べる） */
export function dictHint(dict: Dict | undefined, topic: string): string[] {
  if (!dict) return [];
  const out = new Set<string>();
  for (const key of [topic, hiraToKata(topic), kataToHira(topic)]) {
    const g = dict.get(key);
    if (g) out.add(g);
  }
  return [...out];
}

const SYSTEM = [
  "あなたは画像生成 AI（テキスト → 画像 → 3D）のためのプロンプト作成者です。",
  "日本語のクイズのお題（ひらがな）と、任意の詳細説明から、生成すべき対象を英語で正確に描写します。",
  "必ず JSON だけを返す:",
  '{"known": true|false, "subject": "<対象の正式な英語名>", "en": "<見た目の描写。12 語以内の名詞句。対象名 + 決定的な特徴（形・色・耳・尻尾・パーツ）をカンマ区切り>", "style": "creature|object|food|plant", "confusable": ["<混同しやすい物の英語名>"]}',
  "- known: そのお題が何か本当に知っているなら true。知らない言葉なら false にして、**動物や物を勝手に当てはめない**（subject は空、en は詳細の見た目だけ）。",
  "ルール:",
  "- en は画像生成 AI に渡す。**定義文・説明文ではなく、目に見える特徴だけ**を短く（例: \"fox, orange fur, pointed ears, bushy white-tipped tail\"）。文にしない。動詞を使わない。",
  "- お題の意味を取り違えないこと（きつね = fox であって cat ではない）。辞書のヒントがあれば、クイズの絵になる意味を選ぶ。",
  "- 日本のゲーム・アニメで有名な意味があればそれを優先する（すらいむ = ドラクエの青いしずく形のモンスター、であって粘液ではない）。",
  "- 詳細は見た目の補足であり、お題の意味を上書きしない（お題「ねこ」詳細「とがった耳」は cat のまま）。",
  "- 固有名詞（キャラクター名）は、その公式デザインの決定的な特徴（色・形・持ち物）を描写する。",
  "例:",
  'お題「らくだ」詳細「こぶがふたつ」→ {"known":true,"subject":"camel","en":"camel, two humps, long neck, sandy brown fur","style":"creature","confusable":["horse","llama"]}',
  'お題「すらいむ」→ {"subject":"slime (Dragon Quest monster)","en":"blue teardrop-shaped slime monster, big round eyes, smiling mouth, Dragon Quest style","style":"creature","confusable":["water drop","jelly"]}',
  'お題「しょうぼうしゃ」→ {"known":true,"subject":"fire truck","en":"red fire truck, extendable ladder on top, white cab, black wheels","style":"object","confusable":["ambulance","bus"]}',
  'お題「ぐにょらす」詳細「みどりで足が六本」→ {"known":false,"subject":"","en":"green creature, six legs","style":"creature","confusable":[]}',
  '- style は、動物・怪物・キャラクター・人なら "creature"、食べ物・飲み物なら "food"、木・花なら "plant"、それ以外（乗り物・建物・道具・家具）は "object"。',
].join("\n");

/** 起動時に一度呼んでモデルを読み込ませる（初回は数十秒かかり、時間切れで代用に落ちる） */
export async function warmUp(cfg: LlmConfig): Promise<boolean> {
  if (!cfg.enabled) return false;
  const r = await askLlm("お題: りんご", { ...cfg, timeoutMs: 180000 });
  return r !== undefined;
}

async function askLlm(user: string, cfg: LlmConfig): Promise<Record<string, unknown> | undefined> {
  const body = {
    model: cfg.model,
    stream: false,
    format: "json",
    think: false, // 思考モードだと JSON が空で返る（qwen3.5:9b・2026-09-22 実測）
    keep_alive: cfg.keepAlive,
    options: { temperature: 0.2, num_predict: 600 },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
    if (!res.ok) return undefined;
    const j: unknown = await res.json();
    const content = (j as { message?: { content?: unknown } })?.message?.content;
    if (typeof content !== "string") return undefined;
    const parsed: unknown = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}

/** genlab の上限に収める（語の切れ目で切る） */
export function clip(en: string, max = EN_MAX): string {
  if (en.length <= max) return en;
  const cut = en.slice(0, max);
  const i = cut.lastIndexOf(" ");
  return (i > max / 2 ? cut.slice(0, i) : cut).replace(/[,;:\s]+$/, "");
}

/** 説明文で返ってきたら短くする。genlab の定型が {x} を包み、CLIP は 77 トークンで切れるので長文は逆効果（すらいむの定義文で発覚・2026-09-22） */
export function tighten(en: string, subject: string): string {
  const words = en.split(/\s+/);
  if (words.length <= 18) return en;
  const head = subject && !en.toLowerCase().startsWith(subject.toLowerCase()) ? `${subject}, ` : "";
  return head + words.slice(0, 12).join(" ").replace(/[,;:.]+$/, "");
}

/** 言語モデルの描写が辞書の英語と合っているか（辞書の語のどれかが入っていれば合っている） */
export function agreesWithDict(en: string, hints: string[]): boolean {
  if (hints.length === 0) return true;
  const low = en.toLowerCase();
  return hints.some((h) => h.toLowerCase().split(/[^a-z]+/).some((w) => w.length >= 3 && low.includes(w)));
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
}

/**
 * 言語モデルを使わない経路（本人・2026-09-22「やたらと狐が出てくる。LLM 外してやってた時は？」）:
 * 辞書に載っていれば辞書の英語、無ければカタカナ（genlab が機械翻訳・音写する）。詳細は日本語のまま添える（genlab が機械翻訳）。
 * 取り違えは起きないが、似た物との区別（決定的な特徴）は詳細に書いてもらうしかない
 */
/**
 * 詳細に「人・キャラを指す言葉」（少年・キャラクター・ロボット …）が入っているか。
 * 辞書に載っている語なのに詳細がキャラを指すなら、お題は作品名・固有名詞の同音異義（わんぴーす → dress）で、辞書の英語を使うと絵が壊れる（2026-09-22）。
 * その場合は詳細そのものを描写にする（「麦わら帽子をかぶった少年」→ a boy wearing a straw hat）。
 * **1 文字の語（人・犬・猫）は入れない**: 「飛んでいる人工物」の「人」に当たって、ひこうき（airplane）を捨てて人形が出た（2026-09-22）
 */
const SUBJECT_WORDS =
  /少年|少女|男の子|女の子|子供|こども|赤ちゃん|人間|人物|おじさん|おばさん|おじいさん|おばあさん|キャラ|きゃら|主人公|ヒーロー|戦士|海賊|忍者|侍|魔法使い|王様|お姫|姫様|ロボット|ろぼっと|モンスター|もんすたー|怪獣|妖精|幽霊|おばけ|宇宙人|エイリアン|神様|悪魔|天使|ゾンビ/;

/**
 * 辞書に無い言葉（キャラ名など）の英語: **ヘボン式ローマ字（長音は潰す）**を頭文字大文字で（じばにゃん → Jibanyan、ぴかちゅう → Pikachu、ととろ → Totoro）。
 * 機械翻訳の音写は崩れる（ジバニャン → "Zivagnan"。本人・2026-09-22「ローマ字でいい」）。
 * 外来語由来の名前（あるせうす → Aruseusu、正しくは Arceus）は当たらないが、日本発の名前はほぼ公式表記に一致する
 */
export function romajiName(topic: string): string {
  // 先頭がヘボン式（ん → n）。長音（uu / ou / oo / aa / ii / ee）は潰す（pikachuu → pikachu、doraemon はそのまま）
  const r = (romajiVariants(topic)[0] ?? topic).replace(/ou|oo/g, "o").replace(/uu/g, "u").replace(/aa/g, "a").replace(/ii/g, "i").replace(/ee/g, "e");
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/** 単語リストにその語があれば返す（読み・別名を正規化して比べる）。裏プロンプト（検証済み）と定型が使える */
export function findInList(words: readonly Word[], topic: string): Word | undefined {
  const n = normalizeAnswer(topic);
  return words.find((w) => normalizeAnswer(w.reading) === n || normalizeAnswer(w.ja) === n || w.aliases.some((a) => normalizeAnswer(a) === n));
}

/**
 * 定型（style）を**英語の中身で決める**（17-modes 3 章。本人・2026-09-22「a toy figurine of a って毎回ついてる？物体がちょっとむずかしくなってるかも」）。
 *
 * `creature` の定型は「a toy figurine of a ◯◯」で、**物に付けると主語を乗っ取る**（本 → ロボットのおもちゃ、剣 → 騎士）。
 * 生き物・キャラの語があれば `creature`、食べ物は `food`、植物は `plant`、乗り物・建物・道具は `object`、
 * どれでもなければ `auto`（genlab が WordNet で決める。1 語なら当たる）。
 */
export function styleFromText(text: string): Style | "auto" {
  if (CREATURE_CUE.test(text) || CREATURE_JA.test(text)) return "creature";
  if (FOOD_CUE.test(text) || FOOD_JA.test(text)) return "food";
  if (PLANT_CUE.test(text) || PLANT_JA.test(text)) return "plant";
  if (OBJECT_CUE.test(text) || OBJECT_JA.test(text)) return "object";
  return "auto";
}

const CREATURE_CUE =
  /\b(girl|boy|man|men|woman|women|person|people|human|humanoid|child|kid|character|mascot|hero|heroine|anime|manga|cartoon|robot|android|monster|creature|beast|animal|dragon|cat|kitten|dog|puppy|fox|wolf|bear|bird|penguin|rabbit|bunny|mouse|pig|frog|dinosaur|pokemon|kemonomimi|fairy|ghost|alien|doll|figurine|knight|soldier|pirate|witch|wizard|elf|angel|demon|zombie|skeleton)\b/i;
const FOOD_CUE = /\b(cake|bread|sushi|pizza|burger|noodle|ramen|rice|fruit|apple|banana|orange|strawberry|egg|cheese|candy|chocolate|donut|ice cream|food|meal|dish|drink|juice)\b/i;
const PLANT_CUE = /\b(tree|flower|plant|cactus|mushroom|leaf|leaves|grass|bamboo|rose|sunflower|tulip)\b/i;
const OBJECT_CUE =
  /\b(car|truck|bus|train|plane|airplane|jet|helicopter|ship|boat|submarine|bike|bicycle|motorcycle|rocket|tank|building|house|tower|castle|bridge|temple|shrine|sword|katana|gun|pistol|rifle|knife|axe|hammer|weapon|shield|armor|machine|engine|device|phone|computer|laptop|camera|clock|watch|lamp|chair|table|desk|sofa|bed|furniture|bottle|cup|mug|box|bag|book|ball|guitar|piano|drum|violin|instrument|hat|cap|shoe|boot|shirt|dress|umbrella|key|coin|ring|statue|sign|door|window|fence|wheel|tire)\b/i;

/** 名前（ローマ字）が主語のときの保険: 手がかりが無ければ生き物扱いに戻す */
function orCreature(style: Style | "auto"): Style | "auto" {
  return style === "auto" ? "creature" : style;
}

/** 日本語の詳細も見る（英語の \b が使えないので素の部分一致） */
const CREATURE_JA = /(少年|少女|男の子|女の子|人間|キャラ|ロボット|アンドロイド|怪獣|モンスター|妖怪|動物|いきもの|生き物|猫|ねこ|犬|いぬ|きつね|狐|鳥|とり|竜|ドラゴン|うさぎ|くま|熊|魚|さかな|虫|恐竜)/;
const FOOD_JA = /(ケーキ|パン|寿司|すし|ラーメン|ピザ|果物|くだもの|りんご|バナナ|たまご|卵|お菓子|おかし|料理|食べ物|たべもの|飲み物)/;
const PLANT_JA = /(木|樹|花|はな|植物|サボテン|きのこ|キノコ|草|竹)/;
const OBJECT_JA =
  /(車|くるま|自動車|電車|列車|飛行機|ひこうき|船|ふね|ロケット|戦車|建物|たてもの|家|いえ|塔|城|しろ|橋|神社|寺|剣|けん|刀|かたな|銃|じゅう|斧|ハンマー|武器|盾|機械|エンジン|道具|電話|パソコン|カメラ|時計|とけい|椅子|いす|机|つくえ|ベッド|家具|瓶|びん|コップ|箱|はこ|鞄|かばん|本|ほん|ボール|ギター|ピアノ|楽器|帽子|ぼうし|靴|くつ|服|ふく|傘|かさ|鍵|かぎ|像|看板|扉|ドア|窓|まど|車輪|タイヤ)/;

export function interpretWithoutLlm(topic: string, detail: string, dict: Dict | undefined, words: readonly Word[] = [], wiki?: Dict): Interpreted {
  // ① 単語リスト（787 語の検証済み裏プロンプト。キャラ名はここが一番強い: かーびぃ → "Kirby"、ぴかちゅう → "Pikachu"。2026-09-22）
  const listed = findInList(words, topic);
  if (listed) return { en: clip(listed.en), style: styleOf(listed.kind), source: "list", confusable: [], detail };
  const hint = dictHint(dict, topic)[0];
  // eslint-disable-next-line no-control-regex
  const englishDetail = /^[ -~]+$/.test(detail) && /[a-zA-Z]/.test(detail);
  const englishSubject = /\b(girl|boy|character|anime|manga|robot|monster|hero|heroine|woman|man|person|figure|mascot)\b/i.test(detail);
  if (detail && englishDetail && (!hint || englishSubject)) {
    // 英語の詳細（推奨）: お題がリストにも辞書にも無い、または詳細がキャラを描いている（ふぇねっく → fennec fox を捨てる）→ 詳細だけを描く（2026-09-22）
    // 定型は詳細の中身で決める（物に「toy figurine」を付けない。2026-09-22）
    return { en: clip(detail), style: orCreature(styleFromText(detail)), source: "detail", confusable: [], detail: "" };
  }
  if (hint && detail && SUBJECT_WORDS.test(detail)) {
    // 辞書にある語なのに詳細がキャラを指す → 同音異義（わんぴーす）とみなして詳細だけを描く。辞書に無い語は名前（ローマ字）＋詳細のまま
    return { en: clip(detail), style: orCreature(styleFromText(detail)), source: "detail", confusable: [], detail: "" };
  }
  // JMdict に無ければ Wikipedia の対訳（固有名詞: ジバニャン → Jibanyan）、それも無ければローマ字
  const wikiHit = hint ? undefined : wikiName(wiki, topic);
  const subject = hint ?? wikiHit ?? romajiName(topic);
  // 辞書にあれば auto（WordNet が決める）。無ければ**詳細に手がかりがあればそれで**、無ければ生き物の定型
  // （辞書に無い言葉はたいていキャラ名。中立の定型だと顔のアップやグリッドになった——かーびぃ・2026-09-22）
  const style: Style | "auto" = hint ? "auto" : detail ? orCreature(styleFromText(detail)) : "creature";
  return { en: clip(subject), style, source: hint ? "dict" : wikiHit ? "wiki" : "fallback", confusable: [], detail };
}

export async function interpretTopic(topic: string, detail: string, cfg: LlmConfig, dict: Dict | undefined, words: readonly Word[] = [], wiki?: Dict): Promise<Interpreted> {
  if (!cfg.enabled) return interpretWithoutLlm(topic, detail, dict, words, wiki);
  const listed = findInList(words, topic);
  if (listed) return { en: clip(listed.en), style: styleOf(listed.kind), source: "list", confusable: [], detail };
  const hints = dictHint(dict, topic);
  const user = [`お題: ${topic}`, detail ? `詳細: ${detail}` : "", hints.length ? `辞書では ${topic} = ${hints.join(" / ")}` : ""].filter(Boolean).join("\n");
  const r = await askLlm(user, cfg);
  const subject = typeof r?.["subject"] === "string" ? r["subject"].trim() : "";
  const desc = typeof r?.["en"] === "string" ? r["en"].trim() : "";
  const en = desc && subject && !desc.toLowerCase().startsWith(subject.toLowerCase()) ? `${subject}: ${desc}` : desc || subject;
  if (!r || !en) {
    // 落ちている・読めない: お題（と詳細）をそのまま genlab へ（genlab の辞書・機械翻訳が英語にする）
    return { en: clip(romajiName(topic)), style: "auto", source: "fallback", confusable: [], detail };
  }
  const style = typeof r["style"] === "string" && STYLES.has(r["style"]) ? (r["style"] as Style) : "auto";
  if (hints.length === 0 && r["known"] === false) {
    // 辞書にも無く、言語モデルも知らない言葉（あるせうす → fox と当てはめていた）: 詳細の見た目だけで描く。名前は絵にならない
    const look = desc && !subject ? desc : detail;
    return { en: clip(look || topic), style, source: "unknown", confusable: [], detail: "" };
  }
  if (!agreesWithDict(en, hints)) {
    // 小さいモデルが名詞を取り違えた（どらえもん → donut）。辞書の英語を主語にし、詳細はそのまま添える（genlab が機械翻訳する）
    const hint = hints[0] ?? topic;
    return { en: clip(hint), style: "auto", source: "dict", confusable: strArr(r["confusable"]), detail };
  }
  return { en: clip(tighten(en, subject)), style, source: "llm", confusable: strArr(r["confusable"]), detail: "" };
}
