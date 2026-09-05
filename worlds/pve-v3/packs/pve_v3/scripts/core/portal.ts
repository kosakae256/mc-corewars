/**
 * ポータルの色。**★ → ブロック。純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/20-portal.md`。
 *
 * > ### いまのポータルは触らない
 * >
 * > `pve_v3:portal` は**ロビーの装飾に使っている。**
 * > **色ごとに別のブロックを 6 つ足した**（`pve_v3:portal_1`〜`_6`）。
 * > **状態でまとめると、代表 1 つしかクリエイティブに出ず、
 * > 並びの先頭が既定値になる**——一度それで全部消した（2026-09-05）。
 */

/** 塗り替える前のポータル。**マップの中にはこれが入っている** */
export const PLAIN = "pve_v3:portal";

/** 向きの状態。**塗り替えても持ち越す** */
export const ACROSS = "pve_v3:across";

/** ★の下限・上限 */
export const MIN_STAR = 1;
export const MAX_STAR = 6;

/** **休憩所行き**（水色） */
export const REST = "rest";

/** 行き先。**次の敵群の★**か、**休憩所** */
export type PortalTarget = number | typeof REST;

/** ★を 1〜6 に収める */
export function clampStar(star: number | undefined): number {
  if (star === undefined || !Number.isFinite(star)) return MIN_STAR;
  return Math.max(MIN_STAR, Math.min(MAX_STAR, Math.floor(star)));
}

/** 行き先の呼び名（ブロック名の後ろ） */
export function tagOf(target: PortalTarget): string {
  return target === REST ? REST : String(clampStar(target));
}

/** その行き先のポータル */
export function portalOf(target: PortalTarget): string {
  return `${PLAIN}_${tagOf(target)}`;
}

/** 文字列から行き先を読む（`/pve:portal` 用）。読めなければ undefined */
export function toTarget(text: string): PortalTarget | undefined {
  const v = text.trim().toLowerCase();
  if (v === REST) return REST;
  const n = Number(v);
  return Number.isInteger(n) && n >= MIN_STAR && n <= MAX_STAR ? n : undefined;
}

/** 塗り替えたポータルか（色付きも含めて「ポータル」か） */
export function isPortal(typeId: string): boolean {
  if (typeId === PLAIN) return true;
  const tail = typeId.startsWith(`${PLAIN}_`) ? typeId.slice(PLAIN.length + 1) : undefined;
  return tail !== undefined && (tail === REST || /^[1-6]$/.test(tail));
}
