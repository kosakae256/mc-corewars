/**
 * bridge からのお題を受け取る。`docs/spec/13-transport.md` 2 章。
 *
 * `/scriptevent quiz:round` → `quiz:accept`×n → `quiz:palette`×n → `quiz:chunk`×N → `quiz:go` の順で届く（各 440 バイト以内）。
 * 全部揃って検証が通ったら Round を作り、`building` にする。壊れていれば `failed`（bridge が送り直す）。
 *
 * `scriptEventReceive` は after イベント（default execution）なので、ここでワールドを触ってよい。
 */

import { system, world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import {
  parseChunk,
  parseRoundHeader,
  parseRoundNumber,
  parseStringArrayPart,
  parseTextPart,
  type Part,
  type RoundHeader,
} from "../../core/messages.js";
import { normalizeAnswer } from "../../core/answer.js";
import { decodeRle } from "../../core/rle.js";
import { perTick, placementOrder } from "../../core/order.js";
import { resolvePalette } from "../../core/palette.js";
import { kindLabel, MSG } from "../../lib/format.js";
import { markBridgePing } from "../../state/bridge.js";
import { phase, setEcho, setPhase, setRoundNumber } from "../../state/phase.js";
import {
  nextQuestionNumber,
  pendingRound,
  questionNo,
  setPending,
  setRound,
  setSetter,
  type Pending,
  type Round,
} from "../../state/round.js";
import { dequeue } from "../../state/queue.js";
import { tellAll, tellOps } from "../../services/tell.js";

function fail(reason: string): void {
  setPending(undefined);
  tellOps(`受信に失敗: ${reason}`);
  if (phase() === "waiting") setPhase("failed", system.currentTick);
}

function onRound(message: string): void {
  const header = parseRoundHeader(message);
  if (!header) return fail("round の形が読めない");
  setPending({ header, accepts: new Map(), palettes: new Map(), chunks: new Map(), prompts: new Map() });
}

/** 分割された 1 本を、round と総数を確かめて集める */
function collect<T>(
  name: string,
  part: Part<T> | undefined,
  expectedTotal: (h: RoundHeader) => number,
  into: (p: Pending) => Map<number, T>
): void {
  const pending = pendingRound();
  if (!part || !pending || part.round !== pending.header.round) return fail(`${name} が round と合わない`);
  const total = expectedTotal(pending.header);
  if (part.total !== total) return fail(`${name} の総数が違う: ${part.total} != ${total}`);
  into(pending).set(part.index, part.data);
}

/** 1..n が揃っていれば順に並べる。欠けていれば undefined */
function joined<T>(parts: Map<number, T>, total: number): T[] | undefined {
  const out: T[] = [];
  for (let i = 1; i <= total; i++) {
    const v = parts.get(i);
    if (v === undefined) return undefined;
    out.push(v);
  }
  return out;
}

function onGo(message: string): void {
  const n = parseRoundNumber(message);
  const pending = pendingRound();
  if (n === undefined || !pending || n !== pending.header.round) return fail("go が round と合わない");
  const h = pending.header;
  const acceptParts = joined(pending.accepts, h.accepts);
  const paletteParts = joined(pending.palettes, h.palettes);
  const chunkParts = joined(pending.chunks, h.chunks);
  const promptParts = h.prompts > 0 ? joined(pending.prompts, h.prompts) : [];
  if (!acceptParts) return fail(`accept が欠けている: ${pending.accepts.size} / ${h.accepts}`);
  if (!promptParts) return fail(`prompt が欠けている: ${pending.prompts.size} / ${h.prompts}`);
  if (!paletteParts) return fail(`palette が欠けている: ${pending.palettes.size} / ${h.palettes}`);
  if (!chunkParts) return fail(`chunk が欠けている: ${pending.chunks.size} / ${h.chunks}`);
  const accepted = acceptParts.flat();
  const paletteNames = paletteParts.flat();
  if (paletteNames.length !== h.paletteSize)
    return fail(`palette の個数が違う: ${paletteNames.length} != ${h.paletteSize}`);
  const rle = chunkParts.join("");
  try {
    const cells = decodeRle(rle, h.size ** 3);
    const palette = resolvePalette(paletteNames);
    const { order, height, count } = placementOrder(cells, h.size, h.round);
    if (count !== h.count) tellOps(`個数が header と違う: ${count} != ${h.count}（続行）`);
    for (const c of order) if (c.block >= palette.length) throw new Error(`palette の外を指している: ${c.block}`);
    // 出題モード: この round が使ったキューの件を外し、その人を出題者にする（17-modes 3 章）。
    // 抜けた人の分は既に消えているので、無ければ出題者なし（そのまま進める）
    const used = h.topicId !== undefined ? dequeue(h.topicId) : undefined;
    if (used) setSetter({ id: used.authorId, name: used.authorName });
    const round: Round = {
      round: h.round,
      answer: h.answer,
      accepted: new Set(accepted.map(normalizeAnswer).filter((s) => s.length > 0)),
      kind: h.kind,
      hint: h.hint,
      size: h.size,
      palette,
      order,
      height,
      perTick: perTick(count),
      placed: -1, // -1 = まず箱を空にする（build の tick がやる）
      correct: new Set(),
      winners: [],
      hinted: false,
      startedTick: system.currentTick,
      prompt: promptParts.length ? promptParts.join("") : undefined,
      topic: used?.topic,
      detail: used?.detail,
      setterId: used?.authorId,
      setterName: used?.authorName,
    };
    setPending(undefined);
    setRound(round);
    setRoundNumber(nextQuestionNumber());
    setPhase("building", system.currentTick);
    tellAll(MSG.category(questionNo(), kindLabel(h.kind))); // カテゴリは前提。お題が届いた時点で全員に（11-flow 3-1）
    if (used) {
      tellAll(MSG.setterChosen(used.authorName)); // 誰の出題か（その人は答えられない）
      // 出題者本人にだけ自分のお題を見せる（17-modes 3 章。キューに並んでいる間に忘れる——本人・2026-09-22）
      const me = world.getAllPlayers().find((p) => p.id === used.authorId);
      try {
        me?.sendMessage(MSG.yourTopic(used.topic));
      } catch {
        /* 抜けた */
      }
    }
    if (h.kind === "custom") tellAll(MSG.customHiraganaNotice); // 出題モード: ひらがな完答を毎回言う（本人・2026-09-22「打たないと分かりにくい」）
  } catch (err) {
    fail(String(err));
  }
}

function subscribe(): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.id === "quiz:ping") {
        markBridgePing(system.currentTick); // 状態に関係なく受ける（/quiz:start の前提）
        return;
      }
      if (ev.id === "quiz:echo") {
        setEcho(ev.message.length); // 計測用（spec 13 の 5-2）。受けた長さを scoreboard に書く
        return;
      }
      // ゲームが始まっていないときは受け取らない（bridge は phase 8 では送らないはずだが、念のため）
      if (phase() === "idle" && ev.id !== "quiz:status") return;
      switch (ev.id) {
        case "quiz:round":
          if (phase() === "waiting" || phase() === "failed") onRound(ev.message);
          break;
        case "quiz:accept":
          collect(
            "accept",
            parseStringArrayPart(ev.message),
            (h) => h.accepts,
            (p) => p.accepts
          );
          break;
        case "quiz:prompt":
          collect(
            "prompt",
            parseTextPart(ev.message),
            (h) => h.prompts,
            (p) => p.prompts
          );
          break;
        case "quiz:palette":
          collect(
            "palette",
            parseStringArrayPart(ev.message),
            (h) => h.palettes,
            (p) => p.palettes
          );
          break;
        case "quiz:chunk":
          collect(
            "chunk",
            parseChunk(ev.message),
            (h) => h.chunks,
            (p) => p.chunks
          );
          break;
        case "quiz:go":
          if (phase() === "waiting" || phase() === "failed") onGo(ev.message);
          break;
        case "quiz:status":
          for (const p of world.getAllPlayers()) p.onScreenDisplay.setActionBar(MSG.status(ev.message));
          break;
        default:
          break;
      }
    },
    { namespaces: ["quiz"] }
  );
}

export const quiz: Feature = { name: "quiz", subscribe };
