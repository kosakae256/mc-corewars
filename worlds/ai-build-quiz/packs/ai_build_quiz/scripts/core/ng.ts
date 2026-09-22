/**
 * 下ネタの規制（**純粋関数**）。`docs/spec/18-moderation.md`。
 *
 * 言葉の一覧に当てるだけ（ルールベース。本人・2026-09-22「そんな複雑にしなくていい」）。
 * **「ちんこ」くらい以上のはっきりした下ネタ**を止める。うんこ程度の軽口・暴言は追わない。
 *
 * 日本語は正規化して**部分一致**（記号を落とした形・**伏字の形**・同じ字を潰した形の 3 通り）、
 * 英語は**語として**見る（部分一致だと cockpit / grass / analysis が引っかかる）。
 *
 * **`core/answer.ts` を import しない。** テストは `.ts` を直に読むので、core どうしの実行時 import は解決できない
 * （`order.ts` が `import type` だけにしているのと同じ理由）。正規化はここに閉じる。
 */

/** 伏字の穴（「どれか 1 文字」）を表す内部の印 */
const WILD = "\u0001";
/** 伏字に使う記号だけを穴にする。読点・空白を穴にすると「さんま、こんぶ」が「まんこ」に当たる（2026-09-22） */
const MASK = /[○〇◯●◎■□★☆*＊×✕✖]+/g;

/** カタカナをひらがなに */
function toHira(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

/**
 * 照合用の正規化: NFKC → 小文字 → カタカナをひらがなに → 長音記号を落とす → 文字と数字以外を落とす。
 *
 * - **「っ」は残す**（落とすと「えっち」→「えち」がエチオピアに、「ぼっき」→「ぼき」が募金に当たる）。繰り返しは 1 つに潰す
 * - **長音記号は母音にせず落とす**（「おっぱーい」→「おっぱい」で当てたい）
 * - `mask` を立てると、伏字の記号の並びを**穴 1 つ**にして残す（「ちん◯ん」＝ちんちん）
 */
export function normalizeNg(s: string, mask = false): string {
  const nfkc = s.normalize("NFKC").toLowerCase();
  const hira = toHira(mask ? nfkc.replace(MASK, WILD) : nfkc);
  const keep = mask ? new RegExp(`[^\\p{L}\\p{N}${WILD}]`, "gu") : /[^\p{L}\p{N}]/gu;
  return hira
    .replace(/[ー－]/g, "")
    .replace(/ゔぁ/g, "ば")
    .replace(/ゔぃ/g, "び")
    .replace(/ゔぇ/g, "べ")
    .replace(/ゔぉ/g, "ぼ")
    .replace(/[ゔ]/g, "ぶ")
    .replace(/[ぢ]/g, "じ")
    .replace(/[づ]/g, "ず")
    .replace(/[を]/g, "お")
    .replace(keep, "")
    .replace(/っ+/g, "っ");
}

/** 日本語（正規化した形で部分一致） */
const JA = [
  // 性器・性行為
  "せっくす",
  "えっち",
  "ちんこ",
  "ちんぽ",
  "ちんぼ",
  "ちんちん",
  "ちんげ",
  "ちんかす",
  "まんこ",
  "おめこ",
  "まんげ",
  "まんかす",
  "まんぐり",
  "ちんぐり",
  "ぽこちん",
  "やりまん",
  "あなる",
  "けつあな",
  "しりあな",
  "こうもん",
  "ちつ",
  "ぺにす",
  "ばぎな",
  "いんけい",
  "いんぶ",
  "いんもう",
  "おっぱい",
  "ぱいずり",
  "ぱいぱん",
  "ちくび",
  "ふぇら",
  "くんに",
  "おなに",
  "おなほ",
  "せんずり",
  "ぶっかけ",
  "ざめん", // ザーメン（長音は落とす）
  "せいえき",
  "なかだし",
  "ぼっき",
  "きんたま",
  "たまぶくろ",
  "せいこうい",
  "せいよく",
  "しこる",
  "ずりねた",
  "せくはら",
  "びっち",
  // 下ネタの語り口・業種
  "すけべ",
  "へんたい",
  "えろい",
  "えろす",
  "ろりこん",
  "ぺど",
  "ぽるの",
  "ぬど", // ヌード
  "あへがお",
  "ふたなり",
  "じゅくじょ",
  "せふれ",
  "どうてい",
  "しょじょ",
  "そぷらんど",
  "ふうぞくてん",
  "ろしゅつきょう",
  // 性犯罪
  "きんしんそうかん",
  "ごうかん",
  "れいぷ",
  "ちかん",
  // 排泄（「うんこ」より下品な言い方）
  "しょうべん",
  "だいべん",
].map((w) => normalizeNg(w));

/** 規制語を含んでしまう普通の言葉。**照合の前に消す**（18-moderation 3-3） */
const ALLOW = [
  "ぱちんこ",
  "フェラーリ",
  "万華鏡",
  "まんげきょう",
  "ちつじょ",
  "しょじょさく",
  "ぶっかけうどん",
  "ぶっかけそば",
  "びっちり",
].map((w) => normalizeNg(w));

/** 英語・ローマ字（**語として**一致したら） */
const EN = new Set([
  "sex",
  "sexy",
  "sexual",
  "nude",
  "nudes",
  "naked",
  "porn",
  "porno",
  "nsfw",
  "xxx",
  "r18",
  "hentai",
  "ecchi",
  "erotic",
  "erotica",
  "lewd",
  "boob",
  "boobs",
  "tits",
  "titty",
  "nipple",
  "nipples",
  "penis",
  "dick",
  "cock",
  "balls",
  "testicle",
  "testicles",
  "scrotum",
  "boner",
  "erection",
  "vagina",
  "pussy",
  "clit",
  "clitoris",
  "cunt",
  "anal",
  "anus",
  "butthole",
  "cum",
  "jizz",
  "semen",
  "orgasm",
  "blowjob",
  "handjob",
  "cumshot",
  "creampie",
  "gangbang",
  "fetish",
  "bdsm",
  "bondage",
  "rape",
  "incest",
  "pedophile",
  "lolicon",
  "shota",
  "futanari",
  "shemale",
  "milf",
  "slut",
  "whore",
  "prostitute",
  "brothel",
  "stripper",
  "striptease",
  "dildo",
  "vibrator",
  "condom",
  "viagra",
  "topless",
  "fuck",
  "fucking",
  "manko",
  "omanko",
  "chinko",
  "chinpo",
  "chinchin",
  "oppai",
  "anaru",
  "paizuri",
  "nakadashi",
  "bukkake",
  "senzuri",
  "sukebe",
  "ahegao",
]);

/** 語の頭で見るもの（masturbate / masturbation … を 1 つで） */
const EN_PREFIX = ["masturbat", "ejacul", "pornograph", "fellati", "cunnilin", "fornicat"];

/** `WILD` を「どれか 1 文字」として含むか見る */
function includesWild(hay: string, word: string): boolean {
  if (!hay.includes(WILD)) return hay.includes(word);
  const h = [...hay];
  const w = [...word];
  for (let i = 0; i + w.length <= h.length; i++) {
    let ok = true;
    for (let j = 0; j < w.length; j++) {
      const c = h[i + j];
      if (c !== WILD && c !== w[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function strip(text: string, allow: readonly string[]): string {
  let out = text;
  for (const a of allow) if (a) out = out.split(a).join("");
  return out;
}

/** 下ネタが入っているか（18-moderation 1 章。チャットと出題の両方で使う） */
export function isBanned(text: string): boolean {
  const plain = strip(normalizeNg(text), ALLOW);
  const masked = strip(normalizeNg(text, true), ALLOW); // 伏字（ちん◯ん）
  const squeezed = plain.replace(/(.)\1+/gu, "$1"); // 同じ字の連続（まんんこ）
  for (const w of JA) {
    if (!w) continue;
    if (plain.includes(w) || squeezed.includes(w) || includesWild(masked, w)) return true;
  }
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!token) continue;
    if (EN.has(token)) return true;
    for (const p of EN_PREFIX) if (token.startsWith(p)) return true;
  }
  return false;
}
