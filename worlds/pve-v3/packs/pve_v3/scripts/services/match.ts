/**
 * 試合の進行。**状態を変えてよいのは、ここだけ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md`。
 *
 * ```
 * toPhase()  ─ 表にある遷移か確かめる
 *            ─ 出るときの後始末（exit）
 *            ─ 入るときの支度（entry）
 * ```
 *
 * **その人を寄せるのは `services/presence.ts`。ここは世界の状態だけ。**
 */

import { world, type Player } from "@minecraft/server";

import { canEnter, isResumable, type EndReason, type WorldPhase } from "../core/state.js";
import * as match from "../state/match.js";
import { resetPicked, setPicked } from "../state/pick.js";
import { membership, setDead, setMembership } from "../state/member.js";
import { reset as resetGrowth } from "../state/growth.js";
import { heal, max as hpMax } from "../state/hp.js";
import { clearEnemies } from "./field.js";
import { forgetPrepared, prepareField, readyEnemies } from "./stage.js";
import { closeGates, openGates, settleGates } from "./restgate.js";
import { resetVotes } from "../state/vote.js";
import { cue } from "./interlude.js";
import { blackout, forgetAll as forgetDark } from "./dark.js";
import { center, FACING, isOutside, PLACES } from "../core/places.js";
import { stopSpawning } from "./spawn.js";
import { awardClear, forgetAll } from "./reward.js";
import { resetCurse, rollCurse } from "./curse.js";
import { releaseArea } from "./area.js";
import { spawnSpot } from "./arena.js";
import { closeGate } from "./gate.js";
import { spawnPosts } from "./post.js";
import { tellAdmin } from "./stage.js";
import { alive, members, unfreezeAll } from "./presence.js";

/** いまの状態 */
export function phase(): WorldPhase {
  return match.phase();
}

/** その状態に入ってから何 tick たったか */
export function phaseAge(now: number): number {
  return Math.max(0, now - match.phaseAt());
}

/** いま何戦目か */
export function wave(): number {
  return match.wave();
}

function announce(text: string): void {
  for (const p of world.getAllPlayers()) {
    try {
      p.sendMessage(text);
    } catch {
      /* 消えている */
    }
  }
}

function revive(player: Player): void {
  setDead(player, false);
  const cap = hpMax(player);
  if (cap !== undefined && cap > 0) heal(player, cap);
}

/**
 * 出るときの後始末。
 *
 * **出したもの・貼ったものを残さない**（`docs/spec/17-state.md` 4 章）。
 */
function exit(from: WorldPhase, to: WorldPhase): void {
  switch (from) {
    case "wave":
      // **クリアで抜けるときだけ、越えた褒美を配る**
      if (to === "rest") awardClear(alive(), match.wave());
      // > ### **呪いは「ゲートをくぐって移動するとき」に積む**（2026-09-07 決定）
      // >
      // > 前は**倒し切った瞬間**に引いていた。**まだ戦場に居るのに強くなっていた。**
      // > **次の戦場へ移るときに引き、そのとき見せる**（`16-enemy.md` 4 章）。
      // >
      // > **全滅で終わったときは引かない**——試合が終わるので、次が無い。
      if (to === "interlude") rollCurse(match.wave());
      // **通ったゲートを消す**（`20-portal.md` 0-3）——**常設なので、置いたままだと次に来たとき光っている**
      closeGate();
      // **残った敵を片付ける**（クリアでも全滅でも）
      clearEnemies();
      break;
    case "rest":
      // **途中参加を「参加中」へ昇格**（戦場へ出るときだけ）
      if (to === "wave") {
        for (const p of members()) if (membership(p) === "late") setMembership(p, "member");
      }
      break;
    case "paused":
      unfreezeAll();
      break;
    default:
      break;
  }
}

/** 入るときの支度 */
function entry(to: WorldPhase, from: WorldPhase, now: number): void {
  switch (to) {
    case "idle":
      stopSpawning();
      // **覚えているぶんを捨てる**（画面は 2 秒で勝手に明ける）
      forgetDark();
      // **全部リセット。**参加を解き、強化とエメラルドを消す
      for (const p of world.getAllPlayers()) {
        setMembership(p, "out");
        setDead(p, false);
        resetGrowth(p);
      }
      match.clear();
      clearEnemies();
      closeGates();
      forgetPrepared();
      // **張った区画を外す**（`19-map-store.md` 0-3）
      releaseArea();
      forgetAll();
      break;

    case "prepare":
      // **その場に居る人を参加者にする**（仮。開始操作は未定）
      for (const p of world.getAllPlayers()) {
        setMembership(p, "member");
        setDead(p, false);
      }
      match.setWave(0);
      // **呪いは試合ごとに落とす**（`16-enemy.md` 4 章）
      resetCurse();
      announce("§7試合の準備をしている…");
      break;

    case "rest":
      // **死んでいた人はここで生き返る**
      for (const p of members()) revive(p);
      stopSpawning();
      // ---- **次の相手を、ここで選ぶ**（`13-flow.md` 3-2）
      //
      // **票は捨ててから引き直す**（前の休憩所のぶんが残らないように）
      resetVotes();
      openGates();
      announce("§b次の敵を投票しよう！ §7— §f門の前のモブを殴る");
      // **次の戦場は、ここに居る間に作っておく**（`13-flow.md` 2 章）
      prepareField(match.wave() + 1);
      announce(`§a休憩所 §7— 30 秒。次の 3 戦の相手を選ぶ §8(wave ${match.wave()} まで終了)`);
      break;

    case "wave": {
      // **休憩所から出るなら、ここで投票を締める**（`17-state.md`）
      if (from === "rest" || from === "interlude") settleGates();
      match.setWave(match.wave() + 1);
      for (const p of members()) {
        revive(p);
        // > ### **もう湧く所に居るなら、飛ばさない**（2026-09-05）
        // >
        // > 幕間で運んである（`moveAll`）のに、ここでもう一度飛ばしていた。
        // > **飛ばすと暗転が外れる**ので、**まだ選んでいる人の画面が一瞬明るくなっていた**
        // > （「チェスト UI が出る 3 tick 前に見える」の正体。`13-flow.md` 2 章）。
        try {
          // **戦場はマップごとに動く**（`19-map-store.md` 0-1）——
          // **`PLACES.field`（作業台）を見ていたので、毎ウェーブ 0,0 へ飛ばしていた**
          const spot = spawnSpot();
          if (isOutside(p.location, spot)) {
            p.teleport(center(spot), { rotation: { x: 0, y: FACING.field ?? 0 } });
          }
        } catch {
          /* 抜けた */
        }
      }
      // > ### **強化の台は、着いてから出す**（2026-09-07 に直した）
      // >
      // > **マップを切り替えた瞬間に探していたが、そこはまだ読み込まれていない**
      // > （`19-map-store.md` 0-3）。**ブロックが見えないので、印が 1 つも見つからなかった。**
      // >
      // > **人が着いていれば、そこは必ず読み込まれている。**
      {
        // > ### **着いてからやる**（2026-09-07 に直した）
        // >
        // > **マップを切り替えた瞬間は、そこがまだ読み込まれていない**
        // > （`19-map-store.md` 0-3）。**ブロックを読めず、書けない。**
        // > **人が着いていれば、そこは必ず読み込まれている。**
        //
        // **前に来たときのゲートを消す**（`20-portal.md` 0-3 の二重チェック）
        closeGate();
        const posts = spawnPosts();
        if (posts === 0) tellAdmin("§8このマップに強化の印が無い。建築で pve_v3:growth_post を置くと出る");
      }
      // **敵は 10 秒後から**（`13-flow.md` 2-2）。積むのは `features/match` が待ってからやる
      announce(`§cwave ${match.wave()} §7— 開始 §8(10 秒後に湧く)`);
      break;
    }

    case "interlude":
      // **どこから来たかを覚える**（`wave` から来たときだけ 3 択を出す）
      match.setInterFrom(from);
      // **幕間はいつでも暗転する**（3 択を出すかどうかとは別）
      for (const p of members()) blackout(p);
      // > ### 状態はここで落とす
      // >
      // > **次の周期まで待つと、その間だけ「選んでいる」でなくなり、
      // > 暗転が掛け直されずに一度明るくなる**（2026-09-05 の失敗）。
      if (from === "wave") resetPicked();
      else for (const p of members()) setPicked(p, true);
      // **暗くするだけ。** 運ぶのも組み直すのも `features/match` が順に進める
      //
      // > ### 暗転は「置き終わるまで」
      // >
      // > **明転してから 3 択を出す**（2026-09-05 変更。`13-flow.md` 2 章）。
      // > 暗いまま UI を開き続けるのは、**黒を保ち切れなかった。**
      cue();
      break;

    case "paused":
      // **戻り先を覚える。**覚えないと返せない
      if (isResumable(from)) match.setResumeTo(from);
      announce("§e一時停止");
      break;

    case "result":
      stopSpawning();
      clearEnemies();
      announce(`§7──── §fリザルト §7──── §8到達 wave ${match.wave()}`);
      break;
  }
  match.setPhase(to, now);
}

/**
 * 状態を変える。**表に無い遷移は通さない。**
 *
 * @returns 変えられたか
 */
export function toPhase(to: WorldPhase, now: number): boolean {
  const from = match.phase();
  if (from === to) return false;
  if (!canEnter(from, to)) {
    console.warn(`[match] ${from} → ${to} は表に無い`);
    return false;
  }
  exit(from, to);
  entry(to, from, now);
  return true;
}

/** 一時停止から戻す */
export function resume(now: number): boolean {
  if (match.phase() !== "paused") return false;
  const back = match.resumeTo() ?? "rest";
  match.setResumeTo("");
  return toPhase(back, now);
}

/** 終わらせる */
export function end(reason: EndReason, now: number): boolean {
  const ok = toPhase("result", now);
  if (ok) announce(`§8終わり方: ${reason}`);
  return ok;
}
