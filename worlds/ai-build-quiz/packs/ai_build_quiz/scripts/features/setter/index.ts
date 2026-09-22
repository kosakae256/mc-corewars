/**
 * 出題モード（キュー方式。`docs/spec/17-modes.md` 3 章。2026-09-22 に抽選方式から変更）。
 *
 * - 誰でも・いつでも、石のボタンを押すと**選ぶ画面**（お題を出す／自分の出題を取り消す／やめる。本人・2026-09-22）
 * - 「お題を出す」→ UI（お題・詳細）。時間制限なし。閉じたら何も起きない
 * - お題・詳細に下ネタが入っていたら入れない（`docs/spec/18-moderation.md`）
 * - 「出題する」→ キューの末尾へ（`state/queue.ts`。dynamic property に保存。`/reload` で消えない）
 * - 板（(0, 2, 68)）にキューの名前を並べる（お題は出さない）。出題モードのときだけ
 * - 案内（(-18, 3, 66)）「お題はボタンから出せます」。出題モードのときだけ
 * - 自分の 1 件は取り消せる（他人の分は触れない。運営はコンパスで全消し）
 * - 抜けた人の分はキューから消す（17-modes 8 章）
 * - 実際に出題者になるのは、その件が go で使われたとき（`features/quiz`）
 */

import { system, world, type Player } from "@minecraft/server";
import { ActionFormData, CustomForm, ObservableString, type DataDrivenScreenClosedReason } from "@minecraft/server-ui";

import type { Feature } from "../../types.js";
import { GUIDE_AT, QUEUE_BOARD_AT } from "../../core/box.js";
import { isBanned } from "../../core/ng.js";
import { MSG } from "../../lib/format.js";
import { currentMode } from "../../state/mode.js";
import { recentChat } from "../../state/chatlog.js";
import { dequeue, enqueue, entryOf, loadQueue, queueEntries, queueOpen, removeByAuthor } from "../../state/queue.js";
import { FloatingText } from "../../services/floating.js";
import { tellAll } from "../../services/tell.js";

const TOPIC_MAX = 20;
const DETAIL_MAX = 3000; // 長いプロンプトをそのまま入れたい（本人・2026-09-22）。画像モデルが読むのは先頭 77 トークンだけ（17-modes 3 章）
/** お題はひらがなと数字だけ（長音「ー」は可。本人・2026-09-22「数字も許可」） */
const HIRAGANA = /^[ぁ-ゖー0-9０-９]+$/;
/** 押すと出題の UI が出るブロック。石のボタンだけ（コマンドブロックは要らない——本人・2026-09-22） */
const TOPIC_BLOCKS: ReadonlySet<string> = new Set(["minecraft:stone_button"]);
/** フォームの上に見せるチャットの行数 */
const FEED_LINES = 8;
/** 板に出す件数 */
const BOARD_ROWS = 12;
const RENDER_DISTANCE = 96;
/** 板は +z 側にあり、中心（−z）を向く。`DebugText` の yaw は −z が 0（research 11 の 6 章の表） */
const BOARD_YAW = 0;

/** いま UI を開いている人（重ねて出さない） */
const asking = new Set<string>();
/** 開いているフォームのチャット欄（tick が 10 tick ごとに差し替える） */
const openFeeds = new Map<string, ObservableString>();

const board = new FloatingText(QUEUE_BOARD_AT, BOARD_YAW, RENDER_DISTANCE);
/** ボタンの近くの案内（17-modes 3 章「案内」）。同じく −z（中心）向き */
const guide = new FloatingText(GUIDE_AT, BOARD_YAW, RENDER_DISTANCE);

/** 落とす: カンマ・タブ・改行（scoreboard の名前に使えない／読み取りで切れる） */
function clean(s: string, max: number): string {
  return s
    .replace(/[,\t\r\n]/g, " ")
    .trim()
    .slice(0, max);
}

function feedText(): string {
  const rows = recentChat(FEED_LINES);
  return rows.length ? rows.join("\n") : "§8（まだ発言なし）";
}

/** お題の入力フォーム。「出題する」で検査してキューへ。閉じたら何も起きない */
async function ask(player: Player): Promise<void> {
  const feed = new ObservableString(feedText());
  // 入力欄の observable は **clientWritable を立てないと打った字が届かない**（2026-09-22）
  const topic = new ObservableString("", { clientWritable: true });
  const detail = new ObservableString("", { clientWritable: true });
  const status = new ObservableString("");
  const form = new CustomForm(player, MSG.setterTitle);
  const close = (): void => {
    try {
      form.close();
    } catch {
      /* 既に閉じている */
    }
  };
  form
    .label(feed)
    .divider()
    .textField(MSG.setterTopicLabel, topic, { description: MSG.setterTopicPlaceholder })
    .textField(MSG.setterDetailLabel, detail, { description: MSG.setterDetailPlaceholder })
    .label(status)
    .button(MSG.setterSubmit, () => {
      const t = clean(topic.getData(), TOPIC_MAX);
      if (!t) {
        status.setData(MSG.setterEmptyInline);
        return;
      }
      if (!HIRAGANA.test(t)) {
        status.setData(MSG.setterNotHiragana);
        return;
      }
      const d = clean(detail.getData(), DETAIL_MAX);
      if (isBanned(t) || isBanned(d)) {
        status.setData(MSG.banned); // 下ネタは入れない（18-moderation 1 章）。閉じずに打ち直してもらう
        return;
      }
      const n = enqueue(t, d, player.id, player.name);
      if (n === undefined) {
        status.setData(MSG.queueFull);
        return;
      }
      close();
      try {
        player.sendMessage(MSG.queueAccepted(t, n));
      } catch {
        /* 抜けた */
      }
      tellAll(MSG.queueAdded(player.name, n));
    })
    .button(MSG.setterCancel, close);
  try {
    let shown: Promise<DataDrivenScreenClosedReason> | undefined;
    try {
      shown = form.show();
    } catch {
      player.sendMessage(MSG.setterBusy); // 別の画面を開いている。もう一度押してもらう
    }
    if (shown) {
      openFeeds.set(player.id, feed);
      await shown;
    }
  } finally {
    openFeeds.delete(player.id);
  }
}

/**
 * ボタンを押したときに出る選ぶ画面（17-modes 3 章「選択」。本人・2026-09-22「ボタン押したときに選択式」）。
 * 自分の 1 件だけ取り消せる。他人の分は触れない
 */
async function openMenu(player: Player): Promise<void> {
  if (asking.has(player.id)) return; // 重ねて出さない
  asking.add(player.id);
  try {
    const mine = entryOf(player.id);
    const form = new ActionFormData()
      .title(MSG.menuTitle)
      .body(mine ? MSG.menuMine(mine.entry.topic, mine.position, queueEntries().length) : MSG.menuNone)
      .button(mine ? MSG.menuNewFull : MSG.menuNew);
    if (mine) form.button(MSG.menuCancel);
    form.button(MSG.menuClose);
    const res = await form.show(player);
    if (res.canceled || res.selection === undefined) return;
    if (res.selection === 0) {
      if (mine) {
        player.sendMessage(MSG.queueFull); // もう 1 件入っている（1 人 1 件）
        return;
      }
      await ask(player);
      return;
    }
    if (mine && res.selection === 1) {
      const gone = dequeue(mine.entry.id);
      if (!gone) return; // その間に出題が始まった・抜けた
      player.sendMessage(MSG.queueCanceled(gone.topic));
      tellAll(MSG.queueCanceledAll(player.name));
    }
  } finally {
    asking.delete(player.id);
  }
}

function boardText(): string {
  const rows = queueEntries();
  const head = queueOpen() ? [MSG.queueTitle] : [MSG.queueTitle, MSG.queueClosedBoard]; // 止めていれば見出しの下に
  if (rows.length === 0) return [...head, ...(queueOpen() ? [MSG.queueEmpty] : [])].join("\n");
  const lines = rows.slice(0, BOARD_ROWS).map((e, i) => MSG.queueLine(i + 1, e.authorName));
  if (rows.length > BOARD_ROWS) lines.push(MSG.queueMore(rows.length - BOARD_ROWS));
  return [...head, "", ...lines].join("\n");
}

function subscribe(): void {
  system.run(loadQueue); // `/reload` 後に dynamic property から戻す
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!TOPIC_BLOCKS.has(ev.block.typeId) || currentMode() !== "custom") return;
    ev.cancel = true; // ボタンを押した扱いにせず、UI だけ出す
    const player = ev.player;
    if (!queueOpen()) {
      system.run(() => player.sendMessage(MSG.queueClosed)); // 運営が受付を止めている（17-modes 3 章）
      return;
    }
    system.run(() => void openMenu(player).catch(() => undefined));
  });
  world.afterEvents.playerLeave.subscribe((ev) => {
    const n = removeByAuthor(ev.playerId); // 抜けた人の分はキューから消す（本人・2026-09-22）
    if (n > 0) tellAll(MSG.queueRemovedLeft(ev.playerName, n));
    asking.delete(ev.playerId);
    openFeeds.delete(ev.playerId);
  });
}

/** 10 tick ごと: 板とフォームのチャット欄 */
function tick(): void {
  if (currentMode() !== "custom") {
    board.clear();
    guide.clear();
    return;
  }
  board.set(boardText());
  guide.set(queueOpen() ? MSG.buttonGuide : MSG.queueWaitingClosed);
  const text = openFeeds.size ? feedText() : "";
  for (const feed of openFeeds.values()) feed.setData(text);
}

export const setter: Feature = { name: "setter", subscribe, tick: { every: 10, run: tick } };
