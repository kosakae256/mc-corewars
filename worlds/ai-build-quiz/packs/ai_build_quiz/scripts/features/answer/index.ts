/**
 * 答え合わせと進行の時計。`docs/spec/11-flow.md` 3〜4 章。
 *
 * - `chatSend`（before・restricted）: **判定して印を付けるだけ。** 伝えるのは `system.run` で。正解の発言は早い者勝ちならそのまま、全員回答なら他人に見せない
 * - tick（毎 20 tick）: 残り秒・10 秒でジャンル・30 秒（出題モードは 60 秒）か決まったら発表・5 秒で次へ（早い者勝ち／全員回答は 17-modes 1-1）
 * - 出題者の発言は判定せず「[出題者] 名前: …」で全員に（ヒント）。正解した人の発言は「[正解者] 名前: …」
 * - **下ネタは全部より先に止める**（誰にも見せない。`docs/spec/18-moderation.md`）
 */

import { system, world, type Player } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { isCorrect, isExact } from "../../core/answer.js";
import { isBanned } from "../../core/ng.js";
import { answerTicksOf, HINT_AT_TICKS, REVEAL_TICKS } from "../../core/timing.js";
import { kindLabel, MSG } from "../../lib/format.js";
import { phase, phaseSince, setPhase } from "../../state/phase.js";
import { answerRule, currentMode } from "../../state/mode.js";
import { pushChat } from "../../state/chatlog.js";
import { currentSetter, questionNo, round, setRound, setSetter, versusGoal } from "../../state/round.js";
import { addPoint, scoreOf } from "../../state/score.js";
import { attachText } from "../../services/floating.js";
import { finishVersus } from "../../services/game.js";
import { tellAll, tellOps } from "../../services/tell.js";

const POINTS = 1;

/**
 * 対戦の得点（17-modes 1-1）。早い者勝ちは 1 点。全員回答は**当てた時点の残り秒数**（本人「残り時間がスコア」）。
 * **置いている途中（まだ時計が動いていない）に当てたら 2 倍**（+2 ／ 制限時間 × 2。本人「建てられてる途中に答えたらスコア 2 倍」）。最低 1
 */
function pointsFor(kind: string, tick: number): number {
  const building = phase() === "building";
  if (answerRule() !== "all") return building ? POINTS * 2 : POINTS;
  const limit = answerTicksOf(kind);
  const left = building ? limit * 2 : limit - (tick - phaseSince());
  return Math.max(1, Math.ceil(left / 20));
}

/**
 * 判定（11-flow 3 章、17-modes 1-1）。正解済みの人はここに来ない（先に「正解者チャット」にする）。
 * - 早い者勝ち: 最初の 1 人が当てたらそのラウンドは決まり。決まったあとの発言は判定しない
 * - 全員回答: 当てた人みんな（1 人 1 回）
 */
function onChat(player: Player, message: string): "correct" | "pass" {
  const r = round();
  if ((phase() !== "answering" && phase() !== "building") || !r) return "pass"; // 置いている途中でも受ける（11-flow 3 章）
  if (answerRule() === "first" && r.winners.length > 0) return "pass"; // もう決まっている
  // 出題モードはひらがな完答（部分一致・打ち間違いなし。17-modes 3 章）
  const hit = r.kind === "custom" ? isExact(message, r.accepted) : isCorrect(message, r.accepted);
  if (!hit) return "pass";
  r.correct.add(player.id);
  r.winners.push(player.name);
  return "correct";
}

/** 直前の発言（spam 対策: 同じ文を続けて打っても表示は 1 回。11-flow 3 章） */
const lastChat = new Map<string, string>();

/** 出題者か（選ばれてから発表が終わるまで。17-modes 3 章） */
function isSetter(player: Player): boolean {
  return currentSetter()?.id === player.id || round()?.setterId === player.id;
}

function subscribe(): void {
  world.afterEvents.playerLeave.subscribe((ev) => lastChat.delete(ev.playerId));
  world.beforeEvents.chatSend.subscribe((ev) => {
    if (isBanned(ev.message)) {
      // 下ネタは誰にも見せず、判定にもかけない（18-moderation 1 章）。運営には名前だけ（中身は出さない）
      ev.cancel = true;
      const player = ev.sender;
      system.run(() => {
        try {
          player.sendMessage(MSG.banned);
        } catch {
          /* 抜けた */
        }
        tellOps(MSG.bannedToOps(player.name));
      });
      return;
    }
    const duplicate = lastChat.get(ev.sender.id) === ev.message;
    lastChat.set(ev.sender.id, ev.message);
    if (isSetter(ev.sender)) {
      // 出題者の発言は判定せず、「[出題者] 名前: …」の形で全員に流す（ヒントに使う。17-modes 3 章）
      ev.cancel = true;
      if (duplicate) return;
      const { name } = ev.sender;
      const message = ev.message;
      const r0 = round();
      const before = phase() === "building" || phase() === "answering";
      if (r0 && before && isExact(message, r0.accepted)) {
        // 口が滑った: お題そのもの（正解の判定と同じ条件）。誰にも見せず、本人にだけ伝える（本人・2026-09-23）
        const player = ev.sender;
        system.run(() => {
          try {
            player.sendMessage(MSG.setterLeak);
          } catch {
            /* 抜けた */
          }
        });
        return;
      }
      system.run(() => tellAll(MSG.setterChat(name, message)));
      return;
    }
    const r = round();
    const p = phase();
    if (r && r.correct.has(ev.sender.id) && (p === "building" || p === "answering")) {
      // 正解した人の発言は「[正解者] 名前: …」で**正解者同士と出題者にだけ**（本人・2026-09-21 → 22「出題者と見えあっていい」）。
      // まだの人には見えないので答えは漏れない。正解発表に入った瞬間から普通のチャットに戻す（本人・2026-09-22）
      ev.cancel = true;
      if (duplicate) return;
      const line = MSG.winnerChat(ev.sender.name, ev.message);
      system.run(() => {
        for (const p of world.getAllPlayers()) {
          if (!r.correct.has(p.id) && p.id !== r.setterId) continue;
          try {
            p.sendMessage(line);
          } catch {
            /* 抜けた */
          }
        }
      });
      return;
    }
    const verdict = onChat(ev.sender, ev.message);
    if (verdict === "pass") {
      if (duplicate)
        ev.cancel = true; // 送れるが 2 回目は見せない
      else pushChat(MSG.echoChat(ev.sender.name, ev.message)); // 見える発言は控えにも（出題の UI が見せる。17-modes 3 章）
      return;
    }
    const player = ev.sender;
    const message = ev.message;
    // 全員回答: 他の人に答えが見えないよう打ち消し、本人にだけそのまま見せる。早い者勝ち: 決まった後なので隠さない（本人「他人の回答が見えない」）
    const hide = answerRule() === "all";
    if (hide) ev.cancel = true;
    else pushChat(MSG.echoChat(player.name, message));
    const now = system.currentTick;
    const gained = pointsFor(r?.kind ?? "", now); // 判定した瞬間の残り時間で決める
    const seconds = ((now - (r?.startedTick ?? now)) / 20).toFixed(1); // 置き始めからのタイム（駒金さんの案・2026-09-22）
    system.run(() => {
      if (hide) player.sendMessage(MSG.echoChat(player.name, message)); // 「正解！」の前に自分の発言（11-flow 3 章）
      const versus = currentMode() === "versus";
      addPoint(player, gained, versus); // 対戦中だけ対戦スコア。累計は常に +1（17-modes 1 章）
      player.sendMessage(MSG.youAreRight);
      tellAll(
        versus ? MSG.correctVersus(player.name, seconds, gained, scoreOf(player)) : MSG.correct(player.name, seconds)
      );
      celebrate(player);
    });
  });
}

/** 正解した人の周りに粒子を散らして音（11-flow 3 章） */
function celebrate(player: Player): void {
  try {
    const dim = player.dimension;
    const { x, y, z } = player.location;
    for (let i = 0; i < 12; i++) {
      dim.spawnParticle("minecraft:totem_particle", {
        x: x + (Math.random() - 0.5) * 2,
        y: y + 1 + Math.random() * 1.5,
        z: z + (Math.random() - 0.5) * 2,
      });
    }
    player.playSound("random.levelup", { volume: 1, pitch: 1.2 });
  } catch {
    /* 抜けた・粒子が無い */
  }
}

/**
 * 発表してよいか（時間切れ以外）。早い者勝ち: 誰かが当てたら。全員回答: 答えられる人（出題者を除く、いま居る人）が全員当てたら。
 * 置いている途中なら、置き終わってから（tick が answering でだけ見る）
 */
function decided(): boolean {
  const r = round();
  if (!r) return false;
  if (answerRule() === "first") return r.winners.length > 0;
  const answerers = world.getAllPlayers().filter((p) => p.id !== r.setterId);
  return answerers.length > 0 && answerers.every((p) => r.correct.has(p.id));
}

function reveal(tick: number): void {
  const r = round();
  if (!r) return;
  for (const p of world.getAllPlayers()) {
    if (r.correct.has(p.id)) attachText(p, MSG.winnerMark, REVEAL_TICKS / 20); // 正解者の頭上に ✔（駒金さんの案・2026-09-22）
    try {
      p.onScreenDisplay.setTitle(MSG.answerTitle(r.answer), {
        subtitle: MSG.winners(r.winners),
        fadeInDuration: 5,
        stayDuration: 80,
        fadeOutDuration: 10,
      });
    } catch {
      /* 抜けた */
    }
  }
  tellAll(
    `${MSG.answerTitle(r.answer)} §7/ ${MSG.winners(r.winners)}${r.setterName ? ` §7/ ${MSG.setBy(r.setterName)}` : ""}`
  );
  // 出題モード: お題・詳細と、画像モデルに渡したプロンプトを見せる（本人・2026-09-22。絵が変だったとき何が渡ったか分かる）
  if (r.topic) tellAll(MSG.revealTopic(r.topic, r.detail ?? ""));
  if (r.prompt) tellAll(MSG.revealPrompt(r.prompt.slice(0, 400)));
  setPhase("reveal", tick);
}

function tick(tick: number): void {
  const r = round();
  const p = phase();
  if (p === "answering" && r) {
    const elapsed = tick - phaseSince();
    if (!r.hinted && elapsed >= HINT_AT_TICKS) {
      r.hinted = true;
      if (r.hint) tellAll(MSG.hint(r.hint)); // ジャンルは単語リストが持つ文字列をそのまま出す。空なら出さない（spec 12 の 4-1）
    }
    if (elapsed >= answerTicksOf(r.kind) || decided()) reveal(tick);
    return;
  }
  if (p === "reveal") {
    if (tick - phaseSince() >= REVEAL_TICKS) {
      setRound(undefined);
      setSetter(undefined); // 出題者を解く（次はキューの次の件の人）
      const goal = versusGoal();
      if (goal !== undefined && questionNo() >= goal) {
        finishVersus(); // 対戦の N 問目が終わった: 結果を出して止める（17-modes 1 章）
        return;
      }
      setPhase("waiting", tick); // bridge が次を出す
    }
  }
}

export const answer: Feature = { name: "answer", subscribe, tick: { every: 20, run: tick } };
