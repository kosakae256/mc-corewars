/**
 * genlab（`tools/genlab/server.py`）との口。`docs/spec/13-transport.md` 6 章。
 *
 * `GET /build?text=&size=&style=&seed=` → `{ palette, voxels, count, size, english, seconds }`。
 * 外から来る JSON なので型ガードを通す（imp.md 3-3）。
 */
import type { Style } from "./words.js";

/** 生成プロファイル（docs/spec/08-genlab.md 2-1b）。scoreboard `gen` 0 / 1 */
export const PROFILES = ["v1", "v2", "v3"] as const;
export type Profile = (typeof PROFILES)[number];

export type Generated = {
  size: number;
  palette: string[];
  voxels: string;
  count: number;
  seconds: Record<string, number>;
  /** 翻訳結果と、定型を当てた最終プロンプト（古い genlab だと無い） */
  english?: string;
  prompt?: string;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function isGenerated(v: unknown): v is Generated {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["size"] === "number" &&
    isStringArray(o["palette"]) &&
    typeof o["voxels"] === "string" &&
    typeof o["count"] === "number" &&
    typeof o["seconds"] === "object" &&
    o["seconds"] !== null &&
    (o["prompt"] === undefined || typeof o["prompt"] === "string") &&
    (o["english"] === undefined || typeof o["english"] === "string")
  );
}

export class Genlab {
  constructor(private readonly baseUrl: string) {}

  /** モデルが読み込めているか */
  async ready(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      if (!res.ok) return false;
      const j: unknown = await res.json();
      return typeof j === "object" && j !== null && (j as Record<string, unknown>)["loaded"] === true;
    } catch {
      return false;
    }
  }

  async build(en: string, size: number, style: Style | "auto", seed: number | undefined, steps: number, detail = "", profile: Profile = "v1", ja = ""): Promise<Generated> {
    const q = new URLSearchParams({ text: en, size: String(size), style, steps: String(steps), profile });
    if (seed !== undefined) q.set("seed", String(seed));
    if (detail) q.set("detail", detail); // 出題モードの詳細。genlab が text と別々に翻訳する（spec 13 の 6 章）
    if (ja) q.set("ja", ja.slice(0, 200)); // v3（Japanese SDXL）は日本語のまま読む（08-genlab 2-1b）
    const res = await fetch(`${this.baseUrl}/build?${q.toString()}`);
    if (!res.ok) throw new Error(`genlab が ${res.status} を返した: ${await res.text()}`);
    const j: unknown = await res.json();
    if (!isGenerated(j)) throw new Error(`genlab の応答が想定と違う: ${JSON.stringify(j).slice(0, 200)}`);
    if (j.voxels.length !== j.size ** 3) throw new Error(`voxels の長さが size³ と違う: ${j.voxels.length} != ${j.size ** 3}`);
    return j;
  }
}
