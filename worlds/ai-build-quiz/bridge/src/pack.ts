/**
 * `/scriptevent` を **1 コマンド 440 バイト以内**に分割する（`docs/spec/13-transport.md` 2 章。純粋関数）。
 *
 * 超えるとワールドが落ちる（エラーではない）ので、ここで必ず収める。長さは UTF-8 のバイト数。
 */

export function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** 文字列を、prefix(i, n) を付けて maxBytes に収まるよう切る。本文は ASCII 前提（rle） */
export function splitText(prefix: (i: number, n: number) => string, text: string, maxBytes: number): string[] {
  // prefix の長さは i/n の桁で変わる。最悪（n = 9999）で見積もる
  const room = maxBytes - utf8Bytes(prefix(9999, 9999));
  if (room < 50) throw new Error(`maxBytes が小さすぎる: ${maxBytes}`);
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += room) parts.push(text.slice(i, i + room));
  if (parts.length === 0) parts.push("");
  return parts.map((p, i) => prefix(i + 1, parts.length) + p);
}

/** 文字列の配列を、JSON 配列にして prefix(i, n) を付け、maxBytes に収まる個数ずつにまとめる */
export function splitArray(prefix: (i: number, n: number) => string, items: readonly string[], maxBytes: number): string[] {
  const head = utf8Bytes(prefix(9999, 9999));
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const it of items) {
    const next = [...cur, it];
    if (cur.length > 0 && head + utf8Bytes(JSON.stringify(next)) > maxBytes) {
      groups.push(cur);
      cur = [it];
    } else {
      cur = next;
    }
    if (head + utf8Bytes(JSON.stringify(cur)) > maxBytes) throw new Error(`1 項目で ${maxBytes} バイトを超える: ${it}`);
  }
  if (cur.length > 0 || groups.length === 0) groups.push(cur);
  return groups.map((g, i) => prefix(i + 1, groups.length) + JSON.stringify(g));
}

/** 全部が maxBytes 以内か。超えている物があれば例外（送る前の最後の砦） */
export function assertFits(lines: readonly string[], maxBytes: number): void {
  for (const l of lines) {
    const b = utf8Bytes(l);
    if (b > maxBytes) throw new Error(`コマンドが ${maxBytes} バイトを超える（${b}）: ${l.slice(0, 60)}…`);
  }
}
