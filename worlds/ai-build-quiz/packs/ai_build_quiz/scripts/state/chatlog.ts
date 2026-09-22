/**
 * チャットの最新 N 行（メモリ）。`docs/spec/17-modes.md` 3 章。
 *
 * 出題の UI（フォーム）はチャットを隠すので、代わりにこれをフォームの中に見せる。
 * 積むのは `services/tell.ts`（全員に流した文）と answer feature（みんなの普通の発言）。
 */

const KEEP = 20;
const lines: string[] = [];

export function pushChat(line: string): void {
  lines.push(line);
  if (lines.length > KEEP) lines.splice(0, lines.length - KEEP);
}

/** 新しい順ではなく、上から古い順（チャットと同じ並び） */
export function recentChat(n: number): readonly string[] {
  return lines.slice(-n);
}
