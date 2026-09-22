/**
 * ブロック列の連長圧縮（**純粋関数**）。`docs/spec/13-transport.md` 2-1。
 *
 * genlab の `voxels`（1 文字 = 1 マス。"0" が空気、"1".."9A".."z" が palette の添字）を、
 * `/scriptevent` に載せる形にする:
 *
 *   記号: 空気 = "."、ブロック = palette の添字 1.. を "A".."Z","a".."z" に
 *   連長: <記号><個数>。個数は 10 進、1 なら省略
 *   例:   ".1200A3.15BA" = 空気 1200、A 3 個、空気 15、B 1 個、A 1 個
 *
 * 記号が英字か "."、個数が数字なので区切りが要らない。
 * **BP の `core/rle.ts` は decode を同じ規則で持つ。** 片方を変えたら両方。
 */

const GENLAB_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const WIRE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** genlab の 1 文字 → 線上の記号 */
function toWire(ch: string): string {
  const idx = GENLAB_DIGITS.indexOf(ch);
  if (idx < 0) throw new Error(`voxels に知らない文字: "${ch}"`);
  if (idx === 0) return ".";
  const w = WIRE_LETTERS[idx - 1];
  if (w === undefined) throw new Error(`palette の添字が大きすぎる: ${idx}`);
  return w;
}

/** 線上の記号 → genlab の 1 文字 */
function fromWire(sym: string): string {
  if (sym === ".") return "0";
  const idx = WIRE_LETTERS.indexOf(sym);
  if (idx < 0) throw new Error(`rle に知らない記号: "${sym}"`);
  const g = GENLAB_DIGITS[idx + 1];
  if (g === undefined) throw new Error(`palette の添字が大きすぎる: ${idx + 1}`);
  return g;
}

export function encodeRle(voxels: string): string {
  let out = "";
  let i = 0;
  while (i < voxels.length) {
    const ch = voxels[i] as string;
    let j = i + 1;
    while (j < voxels.length && voxels[j] === ch) j++;
    const n = j - i;
    out += toWire(ch) + (n === 1 ? "" : String(n));
    i = j;
  }
  return out;
}

/** 展開。長さが expected と違えば例外（欠け・順序違いを黙って通さない） */
export function decodeRle(rle: string, expected: number): string {
  const parts: string[] = [];
  let total = 0;
  const re = /([A-Za-z.])(\d*)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(rle)) !== null) {
    if (m.index !== consumed) throw new Error(`rle の位置 ${consumed} に知らない文字`);
    consumed = m.index + m[0].length;
    const n = m[2] ? Number(m[2]) : 1;
    if (!Number.isFinite(n) || n <= 0) throw new Error(`rle の個数が不正: "${m[0]}"`);
    parts.push(fromWire(m[1] as string).repeat(n));
    total += n;
    if (total > expected) throw new Error(`rle の長さが超過: ${total} > ${expected}`);
  }
  if (consumed !== rle.length) throw new Error(`rle の末尾に知らない文字`);
  if (total !== expected) throw new Error(`rle の長さが違う: ${total} != ${expected}`);
  return parts.join("");
}
