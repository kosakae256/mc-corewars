/**
 * ひらがなの読み → ローマ字（**純粋関数**）。`docs/spec/12-words.md` 2-2。
 *
 * 手で書くと必ず漏れるので、読みから作る。返すのは**候補の集合**:
 * - ヘボン式（shi / chi / tsu / fu / ji）と訓令式（si / ti / tu / hu / zi）の両方
 * - 長音をつぶした形（とうきょう → toukyou と tokyo）
 * - 「ん」を nn と打つ癖（IME）の形
 * 全部を正解として受け付ける。
 */

const HEPBURN: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ゔ: "vu",
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  // 外来語の拗音
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
  てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du",
  うぃ: "wi", うぇ: "we", うぉ: "wo",
  ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
  しぇ: "she", じぇ: "je", ちぇ: "che",
  つぁ: "tsa", つぇ: "tse", つぉ: "tso",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
};

/** 訓令式に置き換える対応（ヘボン式の文字列に対して） */
const KUNREI: Array<[RegExp, string]> = [
  [/shi/g, "si"], [/chi/g, "ti"], [/tsu/g, "tu"], [/fu/g, "hu"], [/ji/g, "zi"],
  [/sha/g, "sya"], [/shu/g, "syu"], [/sho/g, "syo"],
  [/cha/g, "tya"], [/chu/g, "tyu"], [/cho/g, "tyo"],
  [/ja/g, "zya"], [/ju/g, "zyu"], [/jo/g, "zyo"],
];

/** ひらがなをヘボン式に。長音「ー」は前の母音を繰り返す。「っ」は次の子音を重ねる */
export function toHepburn(reading: string): string {
  let out = "";
  const chars = [...reading];
  for (let i = 0; i < chars.length; i++) {
    const two = chars[i] + (chars[i + 1] ?? "");
    if (HEPBURN[two] !== undefined) {
      out += HEPBURN[two];
      i++;
      continue;
    }
    const ch = chars[i] as string;
    if (ch === "っ") {
      // 次の音の最初の子音を重ねる（きっと → kitto）。次が母音なら何もしない
      const n1 = chars[i + 1] ?? "";
      const nextTwo = n1 + (chars[i + 2] ?? "");
      const next = HEPBURN[nextTwo] ?? HEPBURN[n1] ?? "";
      const c = next[0];
      if (c && !"aiueo".includes(c)) out += c === "c" ? "t" : c;
      continue;
    }
    if (ch === "ー") {
      const v = out.match(/[aiueo]$/)?.[0];
      if (v) out += v;
      continue;
    }
    out += HEPBURN[ch] ?? "";
  }
  return out;
}

/** 長音をつぶす: ou → o, uu → u, oo → o, aa → a, ii → i, ee → e */
export function collapseLongVowels(s: string): string {
  return s.replace(/ou/g, "o").replace(/uu/g, "u").replace(/oo/g, "o").replace(/aa/g, "a").replace(/ii/g, "i").replace(/ee/g, "e");
}

/** 読みから、受け付けるローマ字の候補を全部作る */
export function romajiVariants(reading: string): string[] {
  const base = toHepburn(reading);
  if (!base) return [];
  let kunrei = base;
  for (const [re, rep] of KUNREI) kunrei = kunrei.replace(re, rep);
  const forms = new Set<string>([base, kunrei]);
  for (const f of [...forms]) {
    forms.add(collapseLongVowels(f));
    forms.add(f.replace(/n(?=[^aiueoyn]|$)/g, "nn")); // ん → nn（子音の前・末尾）
  }
  for (const f of [...forms]) forms.add(collapseLongVowels(f));
  return [...forms].filter((f) => f.length > 0);
}
