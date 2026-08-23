/**
 * このアドオンで扱う型と、その型ガード。
 *
 * 制御サーバーの応答は外部入力なので、必ず検証してから使う
 * （docs/imp.md 3.3）。
 */

/** 制御サーバーが返す JSON */
export type ControlResult = { ok: boolean; message: string };

export function isControlResult(v: unknown): v is ControlResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.ok === "boolean" && typeof o.message === "string";
}
