/**
 * 出題キュー（`docs/spec/17-modes.md` 3 章）。**書くのはここだけ。**
 *
 * - 確定した順（FIFO）。1 人 1 件まで（本人・2026-09-22）
 * - **ワールドの dynamic property に保存**（`quiz:queue` = id の並び、`quiz:queue:<id>` = 1 件の JSON）。`/reload` で消えない（本人・2026-09-22）
 * - 先頭が変わるたびに scoreboard `quiz_topic` に先頭を書く（bridge が読む。`state/topic.ts`）
 * - 受付の停止／再開（運営のコンパス。`quiz:queue:open`。止めても入っている分はそのまま進む）
 */

import { world } from "@minecraft/server";

import { clearTopic, writeTopic } from "./topic.js";

export interface QueueEntry {
  readonly id: number;
  readonly topic: string;
  readonly detail: string;
  readonly authorId: string;
  readonly authorName: string;
}

/** 1 人が同時に入れられる件数 */
export const MAX_PER_PLAYER = 1;

const KEY_IDS = "quiz:queue";
const KEY_NEXT = "quiz:queue:next";
const KEY_OPEN = "quiz:queue:open";
const keyOf = (id: number): string => `quiz:queue:${id}`;

let entries: QueueEntry[] = [];
let nextId = 1;
let open = true;
let loaded = false;

function isEntry(v: unknown): v is QueueEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["id"] === "number" &&
    typeof o["topic"] === "string" &&
    typeof o["detail"] === "string" &&
    typeof o["authorId"] === "string" &&
    typeof o["authorName"] === "string"
  );
}

/** 起動時（`/reload` 後）に dynamic property から戻す */
export function loadQueue(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = world.getDynamicProperty(KEY_IDS);
    const ids: unknown = typeof raw === "string" ? JSON.parse(raw) : [];
    const out: QueueEntry[] = [];
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id !== "number") continue;
        const one = world.getDynamicProperty(keyOf(id));
        if (typeof one !== "string") continue;
        const e: unknown = JSON.parse(one);
        if (isEntry(e)) out.push(e);
      }
    }
    entries = out;
    const n = world.getDynamicProperty(KEY_NEXT);
    nextId = typeof n === "number" && n > 0 ? n : Math.max(1, ...entries.map((e) => e.id + 1));
    open = world.getDynamicProperty(KEY_OPEN) !== false; // 無ければ受付中
  } catch (err) {
    console.warn(`[queue] 読めない: ${String(err)}`);
    entries = [];
  }
  publishHead();
}

function save(): void {
  try {
    world.setDynamicProperty(KEY_IDS, JSON.stringify(entries.map((e) => e.id)));
    world.setDynamicProperty(KEY_NEXT, nextId);
  } catch (err) {
    console.warn(`[queue] 保存できない: ${String(err)}`);
  }
}

/** 先頭を scoreboard に写す（bridge が読む）。空なら消す */
function publishHead(): void {
  const head = entries[0];
  if (head) writeTopic(head.id, head.topic, head.detail);
  else clearTopic();
}

/** 受付中か（運営が止めていなければ true） */
export function queueOpen(): boolean {
  return open;
}

export function setQueueOpen(v: boolean): void {
  open = v;
  try {
    world.setDynamicProperty(KEY_OPEN, v);
  } catch (err) {
    console.warn(`[queue] 保存できない: ${String(err)}`);
  }
}

export function queueEntries(): readonly QueueEntry[] {
  return entries;
}

export function queueHead(): QueueEntry | undefined {
  return entries[0];
}

/** その人の出題（1 人 1 件）と、キューの中での順番（1 始まり）。無ければ undefined */
export function entryOf(authorId: string): { entry: QueueEntry; position: number } | undefined {
  const i = entries.findIndex((e) => e.authorId === authorId);
  const entry = entries[i];
  return entry ? { entry, position: i + 1 } : undefined;
}

export function countOf(authorId: string): number {
  return entries.filter((e) => e.authorId === authorId).length;
}

/** 末尾に足す。戻り値は順番（1 始まり）。上限なら undefined */
export function enqueue(topic: string, detail: string, authorId: string, authorName: string): number | undefined {
  if (countOf(authorId) >= MAX_PER_PLAYER) return undefined;
  const e: QueueEntry = { id: nextId++, topic, detail, authorId, authorName };
  entries.push(e);
  try {
    world.setDynamicProperty(keyOf(e.id), JSON.stringify(e));
  } catch (err) {
    console.warn(`[queue] 保存できない: ${String(err)}`);
  }
  save();
  if (entries.length === 1) publishHead();
  return entries.length;
}

/** id の件を外す（go で使った・抜けた）。外した件を返す */
export function dequeue(id: number): QueueEntry | undefined {
  const i = entries.findIndex((e) => e.id === id);
  if (i < 0) return undefined;
  const [e] = entries.splice(i, 1);
  try {
    world.setDynamicProperty(keyOf(id), undefined);
  } catch {
    /* 無い */
  }
  save();
  if (i === 0) publishHead();
  return e;
}

/** 抜けた人の分を全部消す（17-modes 8 章） */
export function removeByAuthor(authorId: string): number {
  const gone = entries.filter((e) => e.authorId === authorId);
  for (const e of gone) dequeue(e.id);
  return gone.length;
}

export function clearQueue(): void {
  for (const e of [...entries]) dequeue(e.id);
}
