/**
 * 連長の展開（**純粋関数**）。`docs/spec/13-transport.md` 2-1。
 *
 * bridge の `src/rle.ts` と同じ規則:
 *   記号: "." = 空気、"A".."Z","a".."z" = palette の添字 1..52
 *   連長: <記号><個数>。個数は 10 進、1 なら省略
 *
 * 展開結果は **palette の添字の配列**（Uint8Array。0 が空気）。添字 = y×size² + z×size + x。
 * 長さが size³ と違えば例外——欠け・順序違いを黙って通さない。
 */

const WIRE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function decodeRle(rle: string, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let pos = 0;
  let i = 0;
  while (i < rle.length) {
    const sym = rle[i] as string;
    let idx: number;
    if (sym === ".") idx = 0;
    else {
      const k = WIRE_LETTERS.indexOf(sym);
      if (k < 0) throw new Error(`rle の位置 ${i} に知らない記号 "${sym}"`);
      idx = k + 1;
    }
    i++;
    let n = 0;
    let digits = 0;
    while (i < rle.length && rle.charCodeAt(i) >= 48 && rle.charCodeAt(i) <= 57) {
      n = n * 10 + (rle.charCodeAt(i) - 48);
      i++;
      digits++;
    }
    if (digits === 0) n = 1;
    if (n <= 0) throw new Error(`rle の個数が不正（位置 ${i}）`);
    if (pos + n > expected) throw new Error(`rle の長さが超過: ${pos + n} > ${expected}`);
    if (idx !== 0) out.fill(idx, pos, pos + n);
    pos += n;
  }
  if (pos !== expected) throw new Error(`rle の長さが違う: ${pos} != ${expected}`);
  return out;
}
