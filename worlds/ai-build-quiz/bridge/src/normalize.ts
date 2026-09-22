/**
 * 答えの正規化と照合（**純粋関数**）。`docs/spec/12-words.md` 2 章。
 *
 * **BP の `core/answer.ts` と同じ内容にしておくこと。** 片方だけ変えると、
 * bridge が作った `accepted` と BP の判定がずれて「正解なのに不正解」になる。
 * 同じ検証ベクタ（`src/tools/test.ts` と BP の `tests/core.test.ts`）を両方で通す。
 * bridge が使うのは normalizeAnswer だけ（accepted を作る）。isCorrect は検証ベクタのためにある。
 */

const VOWEL_OF: Record<string, string> = {};
for (const [vowel, kanas] of [
  ["あ", "あかさたなはまやらわがざだばぱぁゃ"],
  ["い", "いきしちにひみりぎじぢびぴぃ"],
  ["う", "うくすつぬふむゆるぐずづぶぷぅゅっゔ"],
  ["え", "えけせてねへめれげぜでべぺぇ"],
  ["お", "おこそとのほもよろをごぞどぼぽぉょ"],
] as const) {
  for (const k of kanas) VOWEL_OF[k] = vowel;
}

/** 紛らわしいかなを寄せる（2-1）。「っ」は落とす */
const KANA_FOLD: Record<string, string> = {
  ぢ: "じ",
  づ: "ず",
  を: "お",
  ゔ: "ぶ",
  ゐ: "い",
  ゑ: "え",
  ぁ: "あ",
  ぃ: "い",
  ぅ: "う",
  ぇ: "え",
  ぉ: "お",
  っ: "",
};

/** 末尾から繰り返し落とす語尾（正規化後のひらがな／英字）。長いものから */
const TAILS = [
  "かもしれない",
  "でしょうか",
  "だとおもう",
  "だと思う",
  "でしょう",
  "とおもう",
  "と思う",
  "でしょ",
  "じゃない",
  "じゃん",
  "じゃね",
  "ました",
  "でした",
  "みたい",
  "ですか",
  "ますか",
  "ですね",
  "ですよ",
  "かなあ",
  "かもね",
  "のかな",
  "だろう",
  "です",
  "ます",
  "だよ",
  "だね",
  "だな",
  "だろ",
  "だわ",
  "かな",
  "かも",
  "やん",
  "やろ",
  "かい",
  "かと",
  "なあ",
  "ぽい",
  "す",
  "だ",
  "か",
  "ね",
  "よ",
  "わ",
  "ぞ",
  "ぜ",
  "な",
];
/** 先頭から落とす前置き（正規化後。「っ」「ー」は正規化で消える・母音になる） */
const HEADS = [
  "こたえは",
  "答えは",
  "せいかいは",
  "正解は",
  "ひょとして",
  "もしかして",
  "もしや",
  "たぶん",
  "多分",
  "ぜたい",
  "絶対",
  "たしか",
  "確か",
  "これは",
  "それは",
  "あれは",
  "きっと",
  "えと",
  "ええと",
  "ううん",
  "ああ",
  "いや",
  "うん",
  "はい",
  "theansweris",
  "itsa",
  "itsan",
  "its",
  "itis",
  "thisis",
  "maybe",
  "a",
  "an",
  "the",
];

export function kataToHira(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
  }
  return out;
}

export function expandLongVowel(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch === "ー" || ch === "－" || ch === "-") {
      const prev = out.at(-1);
      const v = prev ? VOWEL_OF[prev] : undefined;
      if (v) out += v;
      continue;
    }
    out += ch;
  }
  return out;
}

/** NFKC → 小文字 → カタカナをひらがなに → 長音を母音に → 紛らわしいかなを寄せる → 文字と数字以外を落とす */
export function normalizeAnswer(s: string): string {
  const nfkc = s.normalize("NFKC").toLowerCase();
  const hira = expandLongVowel(kataToHira(nfkc))
    .replace(/ゔぁ/g, "ば")
    .replace(/ゔぃ/g, "び")
    .replace(/ゔぇ/g, "べ")
    .replace(/ゔぉ/g, "ぼ");
  let folded = "";
  for (const ch of hira) folded += KANA_FOLD[ch] ?? ch;
  return folded.replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * 語尾・前置きを 1 段ずつ落とした形を全部返す（元の形が先頭）。
 * 「きつねかな」→ きつねかな, きつね, きつ。**どこで止めるべきかは語による**（「きつね」の「ね」は語尾ではない）ので、
 * 全部の形で照合する。空になる形は入れない
 */
export function chatterVariants(n: string): string[] {
  const out = [n];
  let s = n;
  for (const h of HEADS) {
    if (s.length > h.length && s.startsWith(h)) {
      s = s.slice(h.length);
      out.push(s);
      break;
    }
  }
  const laugh = s.replace(/(w+|笑+)$/, "");
  if (laugh.length > 0 && laugh !== s) {
    s = laugh;
    out.push(s);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of TAILS) {
      if (s.length > t.length && s.endsWith(t)) {
        s = s.slice(0, -t.length);
        out.push(s);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** 語尾・前置きを落とし切った形（互換用。照合は `chatterVariants` で全部の形を見る） */
export function stripChatter(n: string): string {
  const v = chatterVariants(n);
  return v[v.length - 1] ?? n;
}

/** 編集距離（挿入・削除・置換）。上限 max を超えたら max+1 を返す */
export function editDistance(a: string, b: string, max: number): number {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > max) return max + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      const v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[y.length] as number;
}

/** 打ち間違いを何文字まで許すか（12-words 2-4）。短い語は許さない（別の語になる） */
function allowedEdits(tl: number): number {
  if (tl >= 10) return 3;
  if (tl >= 7) return 2;
  if (tl >= 4) return 1;
  return 0;
}

/** 正規化＋語尾落とし済みの発言 n が、正規化済みの正解 t に当たるか（2-4 の表。本人「結構緩くしていい」） */
export function matchesTerm(n: string, t: string): boolean {
  if (n === t) return true;
  const tc = [...t];
  const nc = [...n];
  const tl = tc.length;
  const nl = nc.length;
  // 含む: 2 文字以上（「日本人形」に「人形」、「こいぬ」に「いぬ」）。1 文字（犬・木）は含まない
  if (tl >= 2 && n.includes(t)) return true;
  // **前半だけ**: 3 文字以上で、正解の半分以上を**頭から**打っている（「しょうぼう」で「しょうぼうしゃ」）。
  // **後ろだけは受けない**（「ボール」で「テニスボール」、「船」で「漁船」。本人・2026-09-23「意味が分かってたら ok のレベルに」）
  if (nl >= 3 && nl * 2 >= tl && t.startsWith(n)) return true;
  const edits = allowedEdits(tl);
  if (edits === 0) return false;
  // 打ち間違い（全体）
  if (nl >= 3 && editDistance(n, t, edits) <= edits) return true;
  // 文の中の打ち間違い: t と同じ長さ±1 の窓のどれかが近い（「たぶんぴかちゆうだ」）
  if (nl > tl) {
    for (const len of [tl - 1, tl, tl + 1]) {
      if (len < 3 || len > nl) continue;
      for (let i = 0; i + len <= nl; i++) {
        if (editDistance(nc.slice(i, i + len).join(""), t, edits) <= edits) return true;
      }
    }
  }
  return false;
}

/** 発言が正解か。accepted は正規化済みの集合。語尾を落とす途中の形も全部見る */
export function isCorrect(message: string, accepted: ReadonlySet<string>): boolean {
  const raw = normalizeAnswer(message);
  if (raw.length === 0) return false;
  const variants = chatterVariants(raw);
  for (const v of variants) if (accepted.has(v)) return true;
  for (const t of accepted) for (const v of variants) if (matchesTerm(v, t)) return true;
  return false;
}

/**
 * 出題モード（17-modes 3 章）: 発言は**ひらがなと数字だけ**（カタカナ・漢字・ローマ字は不正解。本人・2026-09-22）。
 * **お題が入っていれば正解**（「はるくだああああ」→ はるく。本人・2026-09-23）。
 * ただし**お題が 1 文字なら完全一致だけ**（どんな発言にも当たる）。**逆向きは不正解**（「きつ」で「きつね」は当たらない）
 */
export function isExact(message: string, accepted: ReadonlySet<string>): boolean {
  const letters = message.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  if (letters.length === 0 || !/^[ぁ-ゖー0-9]+$/.test(letters)) return false; // NFKC 済みなので数字は半角。数字も可（本人・2026-09-22）
  const variants = chatterVariants(normalizeAnswer(letters));
  for (const t of accepted) {
    if (t.length === 0) continue;
    for (const v of variants) {
      if (v === t) return true;
      if (t.length >= 2 && v.includes(t)) return true; // お題が入っていれば正解（本人・2026-09-23）
    }
  }
  return false;
}
