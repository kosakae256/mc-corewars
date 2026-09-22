/**
 * 純粋関数の検証（node で動く。Minecraft 不要）。
 *
 * **正規化の検証ベクタは BP 側（core/answer.test）と同じものを使う。** 片方だけ通っても意味がない。
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isCorrect, isExact, normalizeAnswer } from "../normalize.js";
import { assertFits, splitArray, splitText, utf8Bytes } from "../pack.js";
import { encodeRle, decodeRle } from "../rle.js";
import { romajiVariants } from "../romaji.js";
import { agreesWithDict, clip, interpretWithoutLlm, loadDict, styleFromText, tighten } from "../topic.js";
import { loadWords } from "../words.js";

// ---- normalize（12-words 2-1 の例）
const vectors: Array<[string, string]> = [
  ["りんご", "りんご"], ["リンゴ", "りんご"], ["ﾘﾝｺﾞ", "りんご"], ["林檎", "林檎"],
  ["Apple", "apple"], ["ｒｉｎｇｏ", "ringo"], ["apple.", "apple"], ["りんご！", "りんご"],
  ["コーヒー", "こおひい"], ["こーひー", "こおひい"], ["カップ", "かぷ"], ["ice cream", "icecream"],
  ["T-shirt", "tshirt"], ["yo-yo", "yoyo"], ["  ねこ  ", "ねこ"], ["ネコ", "ねこ"],
  ["ちぢみ", "ちじみ"], ["ヴェノム", "べのむ"], ["ファービー", "ふああびい"], ["を", "お"],
];
// 緩い照合（12-words 2-4）: [発言, 正解の集合, 期待]
const acc = (...xs: string[]) => new Set(xs.map(normalizeAnswer));
const judge: Array<[string, Set<string>, boolean]> = [
  ["犬", acc("犬", "いぬ", "dog"), true],
  ["いぬかな？", acc("犬", "いぬ", "dog"), true],
  ["犬です", acc("犬", "いぬ", "dog"), true],
  ["答えは犬でしょ", acc("犬", "いぬ", "dog"), true],
  ["It's a dog!", acc("犬", "いぬ", "dog"), true],
  ["dogs", acc("dog", "dogs"), true],
  ["たぶんピカチュウ", acc("ぴかちゅう", "pikachu"), true],
  ["ぴかちゆう", acc("ぴかちゅう", "pikachu"), true],
  ["pikachi", acc("ぴかちゅう", "pikachu"), true],
  ["hipopotamus", acc("hippopotamus"), true],
  ["ばなな", acc("ばなな", "banana"), true],
  ["すいか", acc("すいか", "watermelon"), true],
  ["いか", acc("すいか", "watermelon"), false],
  ["ねこ", acc("犬", "いぬ", "dog"), false],
  ["いぬ", acc("いぬごや", "doghouse"), false],
  ["category", acc("cat", "ねこ"), true],
  ["", acc("犬"), false],
  ["テーブル", acc("つくえ", "てえぶる", "table", "desk"), true],
  ["日本人形", acc("人形", "にんぎょう", "doll"), true],
  ["犬小屋", acc("犬", "いぬ", "dog"), false],
  ["こいぬ", acc("犬", "いぬ", "dog"), true],
  ["しょうぼう", acc("しょうぼうしゃ", "firetruck"), true],
  ["たぶんぴかちゆうだ", acc("ぴかちゅう", "pikachu"), true],
  ["ぴかちゅうwww", acc("ぴかちゅう", "pikachu"), true],
  ["これはピカチュウかもしれない笑", acc("ぴかちゅう", "pikachu"), true],
  ["らいおんだとおもう", acc("らいおん", "lion"), true],
  ["いぬかなあ", acc("いぬ"), true],
  ["hipopotamus", acc("hippopotamus"), true],
  ["hippopotamas", acc("hippopotamus"), true],
  ["ねこ", acc("いぬ"), false],
  ["なす", acc("なす", "eggplant"), true],
];
for (const [m, a, want] of judge) assert.equal(isCorrect(m, a), want, `isCorrect(${m})`);
// 出題モード: ひらがなで、お題が入っていれば正解（本人・2026-09-23「はるくだああああ → はるく」）。逆向き・カタカナ・漢字・ローマ字は不正解
const exact: Array<[string, boolean]> = [["きつね", true], ["キツネ", false], ["kitsune", false], ["きつねかな", true], ["狐", false], ["きつねの", true], ["きつねだあああ", true], ["こたえはきつね", true], ["きつ", false], ["きつねだよね", true], ["きつね！", true]];
assert.equal(isExact("ぽけもん１５１", new Set([normalizeAnswer("ぽけもん151")])), true); // 数字も可（全角は NFKC で半角に）
assert.equal(isExact("ポケモン151", new Set([normalizeAnswer("ぽけもん151")])), false);
for (const [m, want] of exact) assert.equal(isExact(m, new Set([normalizeAnswer("きつね")])), want, `isExact(${m})`);
for (const [i, o] of vectors) assert.equal(normalizeAnswer(i), o, `normalize(${i})`);

// ---- romaji
const r = (s: string) => new Set(romajiVariants(s));
assert.ok(r("りんご").has("ringo"));
assert.ok(r("りんご").has("rinngo"));
assert.ok(r("ぞう").has("zou") && r("ぞう").has("zo"));
assert.ok(r("しょうぼうしゃ").has("shoubousha") && r("しょうぼうしゃ").has("syoubousya"));
assert.ok(r("きっと").has("kitto"));
assert.ok(r("ちょうちょ").has("choucho") && r("ちょうちょ").has("chocho"));
assert.ok(r("ぴかちゅう").has("pikachuu") && r("ぴかちゅう").has("pikachu"));
assert.ok(r("こーひー").has("koohii") && r("こーひー").has("kohi"));

// ---- rle
const pal = ["air", "white_wool", "red_wool"];
const vox = "0".repeat(1200) + "1".repeat(3) + "0".repeat(15) + "2" + "1";
const rle = encodeRle(vox);
assert.equal(rle, ".1200A3.15BA");
assert.equal(decodeRle(rle, vox.length), vox);
assert.equal(decodeRle(encodeRle("0".repeat(8000)), 8000), "0".repeat(8000));
assert.throws(() => decodeRle(".5", 8000), /長さ/);
// ---- pack（13-transport 2 章: 1 コマンド 440 バイト以内）
const pre = (i: number, n: number) => `scriptevent quiz:chunk 12 ${i}/${n} `;
const big = "A".repeat(3000);
const lines = splitText(pre, big, 440);
assertFits(lines, 440);
assert.equal(lines.map((l) => l.slice(pre(1, lines.length).length)).join(""), big);
const jp = Array.from({ length: 80 }, (_, i) => `ぴかちゅう${i}`);
const arr = splitArray((i, n) => `scriptevent quiz:accept 12 ${i}/${n} `, jp, 440);
assertFits(arr, 440);
assert.ok(arr.length > 1 && utf8Bytes(arr[0] as string) <= 440);
assert.deepEqual(arr.flatMap((l) => JSON.parse(l.slice(l.indexOf("["))) as string[]), jp);
assert.throws(() => assertFits(["x".repeat(441)], 440), /超える/);
// ---- 単語リスト（12-words 2-3: 物の 1 段上の呼び名は当たる・キャラを動物では当たらない・別名では当たる。ジャンル名に答えが入らない）
const { words, problems } = loadWords(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "words"));
assert.deepEqual(problems, []);
const of = (ja: string): Set<string> => {
  const w = words.find((x) => x.ja === ja);
  if (!w) throw new Error("語が無い: " + ja);
  return new Set(w.accepted);
};
const lexical: Array<[string, string, boolean]> = [
  // **分類名だけでは不正解**（本人・2026-09-23「テニスボールがボールで ok はちょっとない」「漁船が船でいいのもうーん」）
  ["テニスボール", "ボール", false], ["テニスボール", "テニス", true], ["漁船", "船", false], ["漁船", "ぎょせん", true],
  ["りんごの木", "木", false], ["りんごの木", "りんごのき", true], ["りんごの木", "apple tree", true],
  ["スニーカー", "靴", false], ["ショートケーキ", "ケーキ", false], ["ショートケーキ", "shortcake", true],
  ["ブーツ", "靴", false], ["クルーズ船", "船", false], ["ボート", "船", false],
  ["ジバニャン", "猫", false], ["ハリーポッター", "魔法使い", false], ["ミッフィー", "ウサギ", false],
  // 言い換えとして正しいものは残す（一個ずつ見た例外。12-words 2-3）
  ["石ころ", "石", true], ["テーブル", "机", true], ["卵", "たまご", true], ["卵", "玉子", true],
  ["イグルー", "かまくら", true], ["ケーキ", "ショートケーキ", true], ["目玉焼き", "卵", false],
];
for (const [ja, m, want] of lexical) assert.equal(isCorrect(m, of(ja)), want, `${ja} に「${m}」`);
// ---- 出題モードのプロンプト整形（17-modes 3 章）
assert.equal(agreesWithDict("donut: round doughnut, sweet filling", ["Doraemon"]), false);
assert.equal(agreesWithDict("fox, orange fluffy fur", ["fox"]), true);
assert.equal(agreesWithDict("anything", []), true);
assert.equal(tighten("Slime is a slimy, gelatinous substance that is often found in slime molds, which are fungus-like organisms that live on decaying organic matter.", "slime"), "Slime is a slimy, gelatinous substance that is often found in slime");
assert.equal(tighten("fox, orange fluffy fur, pointed ears", "fox"), "fox, orange fluffy fur, pointed ears");
assert.ok(clip("x".repeat(5000)).length <= 4000);
const dict = loadDict(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "tools", "genlab", "pipeline", "jmdict_min.json"));
if (dict) {
  assert.deepEqual([interpretWithoutLlm("きつね", "おれんじ", dict).en, interpretWithoutLlm("きつね", "おれんじ", dict).detail], ["fox", "おれんじ"]);
  assert.equal(interpretWithoutLlm("あるせうす", "きいろとしろ", dict).en, "Aruseusu");
  assert.equal(interpretWithoutLlm("じばにゃん", "", dict).en, "Jibanyan");
  // Wikipedia の対訳（固有名詞。無ければこの検査は飛ばす——61 MB で git に入れていない）
  const wiki = loadDict(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "tools", "genlab", "pipeline", "wikititles_ja_en.json"));
  if (wiki) {
    assert.equal(interpretWithoutLlm("じばにゃん", "", dict, [], wiki).en, "Jibanyan");
    assert.equal(interpretWithoutLlm("あるせうす", "", dict, [], wiki).en, "Arceus");
    assert.equal(interpretWithoutLlm("ぐらーどん", "", dict, [], wiki).source, "wiki");
  }
  // 単語リストにある語は裏プロンプト（かーびぃ → Kirby …）と定型（creature）
  const kirby = interpretWithoutLlm("かーびぃ", "", dict, words);
  assert.deepEqual([kirby.en.startsWith("Kirby"), kirby.style, kirby.source], [true, "creature", "list"]);
  assert.equal(interpretWithoutLlm("ぴかちゅう", "黄色い", dict, words).source, "list");
  // 英語の詳細（推奨）: リストにも辞書にも無いお題なら詳細だけを描く。辞書にあるなら辞書の英語 + 詳細
  assert.deepEqual([interpretWithoutLlm("ぐらーどん", "Groudon, red dinosaur-like legendary pokemon", dict).en, interpretWithoutLlm("ぐらーどん", "Groudon, red dinosaur-like legendary pokemon", dict).detail], ["Groudon, red dinosaur-like legendary pokemon", ""]);
  assert.deepEqual([interpretWithoutLlm("きつね", "orange fluffy", dict).en, interpretWithoutLlm("きつね", "orange fluffy", dict).detail], ["fox", "orange fluffy"]);
  // 辞書に載っていても、英語の詳細がキャラを描いていれば詳細だけ（ふぇねっく → fennec fox を捨てる）
  assert.equal(interpretWithoutLlm("ふぇねっく", "Fennec from Kemono Friends, anime girl, big fox ears", dict).en, "Fennec from Kemono Friends, anime girl, big fox ears");
  assert.equal(interpretWithoutLlm("ぴかちゅう", "", dict).en, "Pikachu"); // 辞書にも載っているが、どちらでも同じ
  assert.equal(interpretWithoutLlm("せんしゃ", "", dict).en, "tank");
  // 作品名・固有名詞: 詳細に主語（少年）があれば辞書の別の意味（ワンピース = dress）を使わず、詳細だけを描く
  const op = interpretWithoutLlm("わんぴーす", "麦わら帽子をかぶった少年", dict);
  assert.deepEqual([op.en, op.detail, op.style, op.source], ["麦わら帽子をかぶった少年", "", "creature", "detail"]);
  // 定型は英語の中身で決める（17-modes 3 章。物に「a toy figurine of a」を付けない。2026-09-22）
  assert.equal(styleFromText("a red sports car with big wheels"), "object");
  assert.equal(styleFromText("Fennec from Kemono Friends, anime girl, big fox ears"), "creature");
  assert.equal(styleFromText("a whole strawberry cake"), "food");
  assert.equal(styleFromText("a tall pine tree"), "plant");
  assert.equal(styleFromText("Groudon, red legendary"), "auto"); // 手がかり無し → 呼ぶ側が creature に戻す
  assert.equal(styleFromText("あかいくるま、タイヤが大きい"), "object"); // 日本語の詳細も見る
  // 英語の詳細だけで描くとき: 物なら object、キャラなら creature
  assert.equal(interpretWithoutLlm("すぽーつかー", "a red sports car with big wheels", dict).style, "auto"); // 辞書にある語は auto（genlab の WordNet が car を見て object にする）
  assert.equal(interpretWithoutLlm("ふぇねっく", "Fennec from Kemono Friends, anime girl, big fox ears", dict).style, "creature");
  // 辞書にも Wikipedia にも無い名前 + 物の詳細 → object（前は一律 creature だった）
  assert.equal(interpretWithoutLlm("へんなくるま", "a strange car, blue body", dict).style, "object");
  // 手がかりが無ければ今まで通り creature（かーびぃの件）
  assert.equal(interpretWithoutLlm("じばにゃん", "", dict).style, "creature");
  assert.equal(interpretWithoutLlm("わんぴーす", "", dict).en, "dress");
  // 「人工物」の「人」に当たって airplane を捨ててはいけない（2026-09-22）。辞書に無い語は名前＋詳細のまま
  assert.deepEqual([interpretWithoutLlm("ひこうき", "飛んでいる人工物、プロペラがついている", dict).en, interpretWithoutLlm("ひこうき", "飛んでいる人工物、プロペラがついている", dict).source], ["airplane", "dict"]);
  assert.deepEqual([interpretWithoutLlm("じばにゃん", "赤い猫、二本のしっぽ", dict).en, interpretWithoutLlm("じばにゃん", "赤い猫、二本のしっぽ", dict).detail], ["Jibanyan", "赤い猫、二本のしっぽ"]);
}
console.log("bridge tests ok:", vectors.length, "normalize vectors", judge.length, "judge vectors", pal.length, "palette", lexical.length, "word vectors", words.length, "words");
