/**
 * 参加 / 非参加の切り替え。
 *
 * 仕様は `docs/spec/16-participation.md` 2章。
 *
 * ## ロビーで持ち物の中央に固定する
 *
 * 動かせない、捨てられない。**押すと切り替わる。**
 *
 * ## 切り替えられない時がある
 *
 * | 状態 | |
 * | --- | --- |
 * | ロビー（非開始） | **できる** |
 * | **準備中**（開始 → チーム分けの 10 秒） | **できる** |
 * | チーム分け後 | **できない** |
 * | 試合中 | できない（アイテムが消えている） |
 *
 * **チーム分けの瞬間にアイテムを消す。**
 * 消し忘れて触れてしまった場合も、切り替えを拒否する。**二重に止める。**
 */

import { ItemLockMode, ItemStack, system, world, type Player } from "@minecraft/server";

import { matchState } from "../../lib/match-state.js";
import { hasAgreed } from "../../lib/rules.js";
import { showRules } from "./rules-ui.js";

/** 参加すると答えたことを覚えておく名前 */
const KEY = "cw:join";

/** 参加の札 */
const ITEM_YES = "game:join_yes";

/** 非参加の札 */
const ITEM_NO = "game:join_no";

/** 置く枠。**持ち物の中央**（`docs/spec/16-participation.md` 2章） */
const SLOT = 4;

/** 締め切ったか。**チーム分けの瞬間に立てる** */
let closed = false;

/**
 * 見張る間隔（tick）。**5 秒**。
 *
 * **持っているかを見るだけ**なので、細かく回す理由が無い。
 * 消しても 5 秒で戻る。
 */
const INTERVAL = 100;

/**
 * 参加するつもりか。
 *
 * **既定は参加**（2026-08-28 変更。非参加から戻した）。
 *
 * > ### 何もしなければ入る。
 *
 * 一度は**押さなければ入らない**形にした（2026-08-26）。
 * 席を外した人が並び続けるのを嫌ってのことだったが、
 * **入りたい人まで押し忘れて弾かれた。**
 *
 * > **来ている人は、たいてい遊びに来ている。**
 * > **出ない人が押す**ほうが、押す回数はずっと少ない。
 *
 * 抜けるのは**札を押すだけ**で、いつでもできる。
 */
export function wantsToJoin(player: Player): boolean {
  // **未設定は参加。** 明示的に「出ない」と決めた人だけ false
  return player.getDynamicProperty(KEY) !== false;
}

/**
 * 参加の答えを忘れる。**次は参加から始まる。**
 *
 * **試合が終わってロビーに戻るときに呼ぶ**（`features/lobby/reset.ts`）。
 * 戻る道はそこ 1 本にまとめてあるので、入口ごとに書かない。
 */
export function clearJoinChoice(player: Player): void {
  try {
    player.setDynamicProperty(KEY, undefined);
  } catch {
    /* 消えている */
  }
}

/** 参加を締め切る。**チーム分けの瞬間に呼ぶ** */
export function closeJoinWindow(): void {
  closed = true;
  for (const p of world.getAllPlayers()) removeCard(p);
}

/** 締め切りを開ける。**ロビーに戻ったとき** */
export function openJoinWindow(): void {
  closed = false;
}

function removeCard(player: Player): void {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (c === undefined) return;
    for (let i = 0; i < c.size; i++) {
      const id = c.getItem(i)?.typeId;
      if (id === ITEM_YES || id === ITEM_NO) c.setItem(i, undefined);
    }
  } catch {
    /* 消えている */
  }
}

/** いまの答えに合った札を、中央の枠に置く */
function placeCard(player: Player): void {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (c === undefined) return;
    const want = wantsToJoin(player) ? ITEM_YES : ITEM_NO;
    const now = c.getItem(SLOT);
    if (now?.typeId === want) return;

    // **枠に別の物があれば、どこかへ寄せる。** 消さない。
    //
    // ただし**動かせない印が付いた物は触らない**（支給品など）。
    // 寄せようとしても入らず、消える恐れがある。
    //
    // **札そのものは対象外。**
    // 札にも動かせない印が付いているので、
    // ここで弾くと**切り替えても見た目が変わらない**
    //（2026-08-24 の「アイテムが変わりません」）
    if (now !== undefined && now.typeId !== ITEM_YES && now.typeId !== ITEM_NO) {
      if (now.lockMode !== ItemLockMode.none) return;
      c.setItem(SLOT, undefined);
      try {
        c.addItem(now);
      } catch {
        // 入らなかった。**落とすより持たせないほうがまし**
      }
    }
    const card = new ItemStack(want, 1);
    // ---- **鍵は付けない**（2026-08-26 変更 / `docs/spec/16-participation.md` 2-4）
    //
    // 鍵を付けると**持ち替えるたびに但し書きが出る。**
    // 捨てられたら拾い直して返す（`features/special/nodrop`）。
    // 枠に戻すのは、この見張りが 5 秒ごとにやっている
    c.setItem(SLOT, card);
  } catch {
    /* 消えている */
  }
}

/** いま切り替えてよい状態か。**判定を 1 箇所に置く** */
function switchable(): boolean {
  // ---- **`isRunning()` を直接見ない**（2026-08-25 修正）
  //
  // 試合の状態は**開始を押した瞬間に立つ。**
  // 準備中はその上に重なる印なので、`isRunning()` だけでは
  // **猶予の 10 秒も「試合中」に見えていた。**
  //
  // 猶予は切り替えるための時間（docs/spec/11-match.md 7-A）。
  // ここで締めると、置いた意味が無い
  const state = matchState();
  // ---- **試合が終わっていれば、締め切りは開く**（2026-08-26 修正）
  //
  // 締め切りはチーム分けの瞬間に立てるが、
  // **開け直す呼び出しがどこからも来ていなかった。**
  // 一度試合をすると、**次からは札を押しても切り替わらない**
  if (state === "idle") closed = false;
  return !closed && (state === "idle" || state === "preparing");
}

/** 切り替える */
function toggle(player: Player): void {
  // ---- 締め切ったあとは拒否する（docs/spec/16-participation.md 2-1）
  if (!switchable()) {
    player.sendMessage("§cもう切り替えられません §7（チーム分けが済んでいます）");
    return;
  }
  const next = !wantsToJoin(player);
  player.setDynamicProperty(KEY, next);
  placeCard(player);

  // **チャットに状態を出す**（docs/spec/16-participation.md 2-2）。
  // アイコンだけだと、どちらが参加なのか分からなくなる
  player.sendMessage(next ? "§a試合に参加します" : "§7試合に参加しません（見学）");
  try {
    player.playSound(next ? "random.orb" : "random.click", { location: player.location });
  } catch {
    /* 消えている */
  }

  // **参加に切り替えたなら、ルールの同意を確かめる**（同 1-3）
  if (next && !hasAgreed(player)) {
    system.runTimeout(() => showRules(player), 10);
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerJoinCard(): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    const id = ev.itemStack.typeId;
    if (id !== ITEM_YES && id !== ITEM_NO) return;
    system.run(() => toggle(ev.source));
  });

  // ---- **スニークでは切り替えない**（2026-08-25 変更）
  //
  // 右クリックの通知が来ない場合の逃げ道として入れていたが、
  // **通知は来ていた。** 変わらなかったのは別の理由（保護の掛け違い）。
  //
  // スニークは歩き回るだけで押される。
  // **意図せず切り替わるほうが害が大きい。**

  system.runInterval(() => {
    // **ロビーに戻ったら締め切りを開ける。**
    //
    // 締め切ったまま開け直す処理を呼び忘れると、
    // **二度と切り替えられなくなる。** 状態から決めるほうが確実
    if (matchState() === "idle") closed = false;

    // **札の有無と、切り替えの可否を同じ判断から決める。**
    // 別々に書くと「札はあるのに押せない」が起きる
    const open = switchable();
    for (const player of world.getAllPlayers()) {
      if (open) placeCard(player);
      else removeCard(player);
    }
  }, INTERVAL);
}
