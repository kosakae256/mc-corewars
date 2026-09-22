/**
 * bridge から届く `/scriptevent` の中身の解釈（**純粋関数・型ガード**）。`docs/spec/13-transport.md` 2 章。
 *
 * 外から来る文字列は信用しない（imp.md 3-3）。壊れていれば undefined を返し、呼び出し側が「受信失敗」にする。
 * 長い物（答えの集合・palette・rle）は 1 コマンド 440 バイト以内の `<round> <i>/<n> <本文>` に分割されて届く。
 */

export interface RoundHeader {
  readonly round: number;
  readonly answer: string;
  readonly kind: string;
  /** ジャンル（10 秒のヒント）。無ければ空 */
  readonly hint: string;
  readonly size: number;
  readonly count: number;
  /** `quiz:chunk` / `quiz:accept` / `quiz:palette` の本数 */
  readonly chunks: number;
  readonly accepts: number;
  readonly palettes: number;
  readonly paletteSize: number;
  /** `quiz:prompt` の本数（出題モードだけ。無ければ 0） */
  readonly prompts: number;
  /** 出題モード: キューの id（BP が go でその件を外す。17-modes 3 章）。無ければ undefined */
  readonly topicId?: number;
}

/** `<round> <i>/<n> <本文>` の共通の形 */
export interface Part<T> {
  readonly round: number;
  readonly index: number;
  readonly total: number;
  readonly data: T;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** `quiz:round {json}` */
export function parseRoundHeader(message: string): RoundHeader | undefined {
  let v: unknown;
  try {
    v = JSON.parse(message);
  } catch {
    return undefined;
  }
  if (typeof v !== "object" || v === null) return undefined;
  const o = v as Record<string, unknown>;
  const num = (k: string): number | undefined =>
    typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : undefined;
  const round = num("round");
  const size = num("size");
  const count = num("count");
  const chunks = num("chunks");
  const accepts = num("accepts");
  const palettes = num("palettes");
  const paletteSize = num("paletteSize");
  if (
    round === undefined ||
    size === undefined ||
    count === undefined ||
    chunks === undefined ||
    accepts === undefined ||
    palettes === undefined ||
    paletteSize === undefined
  )
    return undefined;
  if (typeof o["answer"] !== "string" || typeof o["kind"] !== "string") return undefined;
  if (size < 1 || size > 80 || chunks < 1 || chunks > 2000 || accepts < 1 || palettes < 1) return undefined;
  const hint = typeof o["hint"] === "string" ? o["hint"] : "";
  const prompts = num("prompts") ?? 0;
  const topicId = num("topicId");
  return {
    round,
    answer: o["answer"],
    kind: o["kind"],
    hint,
    size,
    count,
    chunks,
    accepts,
    palettes,
    paletteSize,
    prompts,
    topicId,
  };
}

/** `<round> <i>/<n> <本文>` を切る */
function parsePart(message: string): { round: number; index: number; total: number; body: string } | undefined {
  const m = message.match(/^(\d+)\s+(\d+)\/(\d+)\s([\s\S]*)$/);
  if (!m) return undefined;
  const index = Number(m[2]);
  const total = Number(m[3]);
  if (index < 1 || index > total) return undefined;
  return { round: Number(m[1]), index, total, body: m[4] as string };
}

/** `quiz:accept <round> <i>/<n> [json array]` と `quiz:palette <round> <i>/<n> [json array]` */
export function parseStringArrayPart(message: string): Part<string[]> | undefined {
  const p = parsePart(message);
  if (!p) return undefined;
  let v: unknown;
  try {
    v = JSON.parse(p.body);
  } catch {
    return undefined;
  }
  if (!isStringArray(v)) return undefined;
  return { round: p.round, index: p.index, total: p.total, data: v };
}

/** `quiz:chunk <round> <i>/<n> <rle の断片>` */
export function parseChunk(message: string): Part<string> | undefined {
  const p = parsePart(message);
  if (!p || /\s/.test(p.body)) return undefined;
  return { round: p.round, index: p.index, total: p.total, data: p.body };
}

/** `quiz:prompt <round> <i>/<n> <文>`（空白を含んでよい） */
export function parseTextPart(message: string): Part<string> | undefined {
  const p = parsePart(message);
  if (!p) return undefined;
  return { round: p.round, index: p.index, total: p.total, data: p.body };
}

/** `quiz:go <round>` */
export function parseRoundNumber(message: string): number | undefined {
  const m = message.trim().match(/^(\d+)$/);
  return m ? Number(m[1]) : undefined;
}
