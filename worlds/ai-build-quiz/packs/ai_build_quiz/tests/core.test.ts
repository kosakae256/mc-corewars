/** 純粋関数の検証。Minecraft 不要（node --test）。 */
import assert from "node:assert/strict";
import { it } from "node:test";

import { decodeRle } from "../scripts/core/rle.ts";
import { isCorrect, isExact, normalizeAnswer } from "../scripts/core/answer.ts";
import { parseChunk, parseRoundHeader, parseRoundNumber, parseStringArrayPart } from "../scripts/core/messages.ts";
import { perTick, placementOrder } from "../scripts/core/order.ts";
import { resolvePalette } from "../scripts/core/palette.ts";
import {
  BUILD_BOX,
  gridToWorld,
  inBox,
  inRing,
  PLAY_BOX,
  pushInside,
  RING_INNER,
  RING_OUTER,
} from "../scripts/core/box.ts";
import { isBanned } from "../scripts/core/ng.ts";

it("正規化と照合は bridge と同じ結果になる（同じ検証ベクタ）", () => {
  const vectors: Array<[string, string]> = [
    ["りんご", "りんご"],
    ["リンゴ", "りんご"],
    ["ﾘﾝｺﾞ", "りんご"],
    ["林檎", "林檎"],
    ["Apple", "apple"],
    ["ｒｉｎｇｏ", "ringo"],
    ["apple.", "apple"],
    ["りんご！", "りんご"],
    ["コーヒー", "こおひい"],
    ["こーひー", "こおひい"],
    ["カップ", "かぷ"],
    ["ice cream", "icecream"],
    ["T-shirt", "tshirt"],
    ["yo-yo", "yoyo"],
    ["  ねこ  ", "ねこ"],
    ["ネコ", "ねこ"],
    ["ちぢみ", "ちじみ"],
    ["ヴェノム", "べのむ"],
    ["ファービー", "ふああびい"],
    ["を", "お"],
  ];
  for (const [i, o] of vectors) assert.equal(normalizeAnswer(i), o, i);
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
  // 出題モード: ひらがな完答（語尾は落とす。部分一致・打ち間違いは無し）
  const exact: Array<[string, boolean]> = [
    ["きつね", true],
    ["キツネ", false],
    ["kitsune", false],
    ["きつねかな", true],
    ["狐", false],
    ["きつねの", true], // お題が入っていれば正解（本人・2026-09-23）
    ["きつねだあああ", true],
    ["こたえはきつね", true],
    ["きつ", false], // 逆向き（お題が発言を含む）は不正解
  ];
  for (const [m, want] of exact) assert.equal(isExact(m, new Set([normalizeAnswer("きつね")])), want, `isExact(${m})`);
  assert.equal(isExact("ぽけもん１５１", new Set([normalizeAnswer("ぽけもん151")])), true); // 数字も可
});

it("rle を展開し、長さが違えば止める", () => {
  const v = decodeRle(".3A2.B", 7);
  assert.deepEqual([...v], [0, 0, 0, 1, 1, 0, 2]);
  assert.throws(() => decodeRle(".3A2.B", 8), /長さ/);
  assert.throws(() => decodeRle("#", 1), /知らない/);
});

it("bridge からの message を型ガードで読む", () => {
  const base = {
    round: 3,
    answer: "犬",
    kind: "animal",
    size: 60,
    count: 10,
    chunks: 2,
    accepts: 1,
    palettes: 1,
    paletteSize: 3,
  };
  const h = parseRoundHeader(JSON.stringify(base));
  assert.ok(h && h.round === 3 && h.size === 60 && h.accepts === 1);
  assert.equal(h?.hint, ""); // hint が無くても読める
  assert.equal(parseRoundHeader(JSON.stringify({ ...base, hint: "ペット" }))?.hint, "ペット");
  assert.equal(parseRoundHeader(JSON.stringify({ ...base, accepts: 0 })), undefined);
  assert.equal(parseRoundHeader("{bad"), undefined);
  assert.deepEqual(parseStringArrayPart('3 1/2 ["air","white_wool"]'), {
    round: 3,
    index: 1,
    total: 2,
    data: ["air", "white_wool"],
  });
  assert.deepEqual(parseStringArrayPart('3 1/1 ["いぬ","dog"]'), {
    round: 3,
    index: 1,
    total: 1,
    data: ["いぬ", "dog"],
  });
  assert.equal(parseStringArrayPart("3 1/1 [1,2]"), undefined);
  assert.deepEqual(parseChunk("3 2/5 .12A3"), { round: 3, index: 2, total: 5, data: ".12A3" });
  assert.equal(parseChunk("3 6/5 x"), undefined);
  assert.equal(parseChunk("3 1/5 a b"), undefined);
  assert.equal(parseRoundNumber(" 7 "), 7);
});

it("置く順は下の層から。N は 10 秒で終わる数", () => {
  const size = 4;
  const cells = new Uint8Array(size ** 3);
  cells[0] = 1; // y=0
  cells[size * size * 2 + 1] = 2; // y=2
  const { order, height, count } = placementOrder(cells, size);
  assert.equal(count, 2);
  assert.equal(height, 3);
  assert.equal(order[0]?.y, 0);
  assert.equal(order[1]?.y, 2);
  assert.equal(perTick(10000), 50);
  assert.equal(perTick(1), 1);
  assert.equal(perTick(10_000_000), 1300);
});

it("palette は許可リストだけ通す", () => {
  assert.deepEqual(resolvePalette(["air", "red_wool", "hardened_clay"]), [
    "minecraft:air",
    "minecraft:red_wool",
    "minecraft:hardened_clay",
  ]);
  assert.throws(() => resolvePalette(["air", "tnt"]), /許可していない/);
  assert.throws(() => resolvePalette(["red_wool"]), /air/);
});

it("箱: 60³ を原点中心、行動範囲は ±100", () => {
  assert.deepEqual(gridToWorld(60, 10, { x: 0, y: 0, z: 0 }), { x: -30, y: -30, z: -30 });
  assert.ok(inBox(BUILD_BOX, { x: 29, y: 29, z: 29 }));
  assert.ok(!inBox(BUILD_BOX, { x: 30, y: 0, z: 0 }));
  assert.equal(pushInside(PLAY_BOX, { x: 0, y: 0, z: 0 }, 1.5), undefined);
  assert.deepEqual(pushInside(PLAY_BOX, { x: 150, y: 0, z: -120 }, 1.5), { x: 98.5, y: 0, z: -98.5 });
  // 観覧の輪: 半径 RING_INNER〜RING_OUTER、箱の外
  assert.ok(inRing(60, 0) && inRing(0, -60) && inRing(42, 42));
  assert.ok(!inRing(0, 0) && !inRing(30, 30) && !inRing(70, 0));
  assert.ok(RING_INNER > BUILD_BOX.max.x && RING_OUTER > RING_INNER);
});

it("下ネタの規制（18-moderation）: 止める語と、止めてはいけない語", () => {
  // 止める（表記ゆれ・空白割り・全角・伏字・英語も）
  for (const t of [
    "おっぱい",
    "オッパイ",
    "お っ ぱ い",
    "ｵｯﾊﾟｲ",
    "えっち",
    "えっっっちなやつ",
    "ちんこ",
    "これは まんこ です",
    "ちん◯ん", // 伏字
    "ま○こ",
    "ち*ん*こ",
    "まんんこ", // 同じ字の連続
    "あなる",
    "アナル",
    "ザーメン",
    "ヴァギナ",
    "ｱﾅﾙ",
    "ぶっかけ",
    "sex",
    "NSFW please",
    "ecchi",
    "masturbating",
    "anaru",
    "oppai",
  ])
    assert.ok(isBanned(t), `止まらない: ${t}`);
  // 止めてはいけない（普通の言葉・伏字と紛らわしい読点・英語の部分一致）
  for (const t of [
    "エチオピア",
    "パチンコ",
    "募金",
    "ぼきゃぶらりー",
    "フェラーリ",
    "イエロー",
    "消えろ",
    "ドラえもん",
    "万華鏡",
    "秩序",
    "処女作",
    "ぶっかけうどん",
    "びっちり",
    "チンパンジー",
    "四国",
    "さんま、こんぶ",
    "cockpit",
    "grass",
    "analysis",
    "title",
    "essex",
    "a red car with big wheels",
  ])
    assert.ok(!isBanned(t), `誤爆: ${t}`);
});
