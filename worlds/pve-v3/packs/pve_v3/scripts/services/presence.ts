/**
 * その人を、**あるべき姿へ寄せる。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md` 1 章・3 章。
 *
 * ```
 * 世界の状態 ＋ 参加のしかた ＋ 死んでいるか
 *        ↓
 *   ゲームモード・居場所・固定
 * ```
 *
 * > ### 「切り替えた瞬間に 1 度だけ」で済ませない
 * >
 * > **`/reload`・入り直し・切断復帰で必ず取りこぼす**（`docs/imp.md` 10-7）。
 * > **毎周期見て直す。**
 *
 * **状態を変えるのは `services/match.ts`。ここは変えない。**
 */

import { GameMode, world, type Player, type Vector3 } from "@minecraft/server";

import { homeOf, mustFreeze, mustSpectate, playerPhase, type PlayerPhase } from "../core/state.js";
import { FACING, isOutside, PLACES } from "../core/places.js";
import * as match from "../state/match.js";
import { isDead, membership, setDead, setMembership } from "../state/member.js";

/** 固定しているときの立ち位置。**メモリだけ**（`/reload` で消えてよい） */
const anchors = new Map<string, Vector3>();

/** 参加している人（途中参加も含む） */
export function members(): Player[] {
  return world.getAllPlayers().filter((p) => membership(p) !== "out");
}

/** まだ立っている人 */
export function alive(): Player[] {
  return members().filter((p) => membership(p) === "member" && !isDead(p));
}

/** その人のいまの状態 */
export function phaseOf(player: Player): PlayerPhase {
  return playerPhase(match.phase(), membership(player), isDead(player));
}

/**
 * 倒れた。**戦場に居るときだけ意味がある。**
 *
 * @returns **「戦場で死亡」にしたか。** 試合の外なら false
 */
export function markDead(player: Player): boolean {
  if (match.phase() !== "wave") return false;
  if (membership(player) !== "member") return false;
  setDead(player, true);
  return true;
}

/** 途中から入る。**世界の状態で、参加のしかたが変わる** */
export function join(player: Player): PlayerPhase {
  const now = match.phase();
  if (now === "idle") {
    setMembership(player, "out");
  } else if (now === "prepare") {
    setMembership(player, "member");
  } else {
    // **走っている試合には「途中参加」で入る**——次の休憩所まで戦えない
    setMembership(player, "late");
  }
  setDead(player, false);
  return phaseOf(player);
}

export function leave(player: Player): void {
  setMembership(player, "out");
  setDead(player, false);
  anchors.delete(player.id);
}

/**
 * **クリエイティブの人は、寄せない**（2026-09-04 決定）。
 *
 * > ### 運営が自分の意思でそこに居る
 * >
 * > **毎周期ゲームモードを書き戻していたので、`/gamemode creative` が
 * > 一瞬で戻されていた。** 見て回ることも、直すこともできない。
 * >
 * > **クリエイティブに入れるのは権限を持つ人だけ**なので、
 * > **それ自体を「寄せるのをやめる合図」として扱う。**
 */
function isCreative(player: Player): boolean {
  try {
    return player.getGameMode() === GameMode.Creative;
  } catch {
    return false;
  }
}

function fixGameMode(player: Player, want: GameMode): void {
  try {
    if (player.getGameMode() !== want) player.setGameMode(want);
  } catch {
    /* 消えている */
  }
}

/**
 * あるべき姿へ寄せる。**毎周期。**
 *
 * | 見るもの | 直し方 |
 * | --- | --- |
 * | **クリエイティブ** | **何もしない**（運営の道具を奪わない） |
 * | **ゲームモード** | 違えば置き換える |
 * | **居場所** | **圏外に居るときだけ**引き戻す（ぴったりへは戻さない） |
 * | **固定** | 止まっている間は、覚えた立ち位置から離れさせない |
 */
export function reconcile(player: Player, _now: number): void {
  if (isCreative(player)) {
    anchors.delete(player.id);
    return;
  }

  const worldPhase = match.phase();

  // **非開始に参加者は居ない**
  if (worldPhase === "idle" && membership(player) !== "out") setMembership(player, "out");

  const ph = phaseOf(player);
  fixGameMode(player, mustSpectate(ph) ? GameMode.Spectator : GameMode.Adventure);

  if (mustFreeze(ph)) {
    const at = anchors.get(player.id) ?? player.location;
    anchors.set(player.id, at);
    if (isOutside(player.location, at, 2)) {
      try {
        player.teleport(at);
      } catch {
        /* 消えている */
      }
    }
    return;
  }
  anchors.delete(player.id);

  const where = homeOf(worldPhase, membership(player));
  const home = PLACES[where];
  if (!isOutside(player.location, home)) return;
  try {
    const yaw = FACING[where];
    // **向きが決まっている場所では、必ずそちらを向かせる**
    player.teleport(home, yaw === undefined ? undefined : { rotation: { x: 0, y: yaw } });
  } catch {
    /* 消えている */
  }
}

/** 固定を全部解く。**一時停止から戻るとき** */
export function unfreezeAll(): void {
  anchors.clear();
}
