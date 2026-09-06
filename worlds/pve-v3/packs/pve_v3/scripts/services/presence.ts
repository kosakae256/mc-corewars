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

import { CommandPermissionLevel, GameMode, world, type Player, type Vector3 } from "@minecraft/server";

import { homeOf, mustFreeze, mustSpectate, playerPhase, type PlayerPhase, type Home } from "../core/state.js";
import { center, FACING, isOutside, PLACES } from "../core/places.js";
import { isFullBlock } from "../core/spawnmark.js";
import * as match from "../state/match.js";
import { isDead, membership, setDead, setMembership } from "../state/member.js";
import { isPicked } from "../state/pick.js";

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
  return playerPhase(match.phase(), membership(player), isDead(player), isPicked(player));
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
  buried.delete(player.id);
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

/** 埋まっていると認めるまで（tick）。**1 秒**（`17-state.md` 3-4） */
const BURIED_HOLD = 20;

/** 埋まり始めた時刻。**メモリだけ**（`/reload` で消えてよい） */
const buried = new Map<string, number>();

/** そこが**実体のあるブロックで塞がっている**か */
function blocked(player: Player, dy: number): boolean {
  try {
    const at = player.location;
    const b = player.dimension.getBlock({
      x: Math.floor(at.x),
      y: Math.floor(at.y + dy),
      z: Math.floor(at.z),
    });
    // **読み込まれていない所は「埋まっていない」扱い**——見えないものを根拠にしない
    if (b === undefined || b.isAir || b.isLiquid) return false;
    return isFullBlock(b.typeId);
  } catch {
    return false;
  }
}

/**
 * **埋まっていたら、湧く所へ戻す**（`17-state.md` 3-4）。
 *
 * > ### マップの差し替えに追いつかれることがある
 * >
 * > 差し替えは少しずつ進むので、**置かれた地形の中に入ってしまう。**
 * > 埋まると**動けず、抜け出せない。**
 *
 * **1 秒続いたときだけ**戻す——地形が置かれる途中の一瞬を拾わないため。
 *
 * @returns 戻したか
 */
function digOut(player: Player, now: number): boolean {
  if (!blocked(player, 0.2) || !blocked(player, 1.2)) {
    buried.delete(player.id);
    return false;
  }
  const from = buried.get(player.id);
  if (from === undefined) {
    buried.set(player.id, now);
    return false;
  }
  if (now - from < BURIED_HOLD) return false;
  buried.delete(player.id);
  try {
    // **黙って戻す**（`17-state.md` 3-4）——戦っている最中に読ませるものではない
    player.teleport(center(PLACES.field), { rotation: { x: 0, y: FACING.field ?? 0 } });
  } catch {
    /* 消えている */
  }
  return true;
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
export function reconcile(player: Player, now: number): void {
  if (isCreative(player)) {
    anchors.delete(player.id);
    buried.delete(player.id);
    return;
  }

  const worldPhase = match.phase();

  // **非開始に参加者は居ない**
  if (worldPhase === "idle" && membership(player) !== "out") setMembership(player, "out");

  const ph = phaseOf(player);
  fixGameMode(player, mustSpectate(ph) ? GameMode.Spectator : GameMode.Adventure);

  // ---- **埋まった人を掘り出す。** 戦っている間だけ（見ている人はすり抜けられる）
  if (worldPhase === "wave" && !mustSpectate(ph)) {
    if (digOut(player, now)) return;
  } else {
    buried.delete(player.id);
  }

  if (mustFreeze(ph)) {
    const at = anchors.get(player.id) ?? player.location;
    anchors.set(player.id, at);
    if (isOutside(player.location, at, 2)) {
      try {
        player.teleport(center(at));
      } catch {
        /* 消えている */
      }
    }
    return;
  }
  anchors.delete(player.id);

  // > ### 幕間の間は、居場所を直さない
  // >
  // > **暗転中に運ぶのはこちら**（`moveAll`）。
  // > 毎周期の寄せと取り合うと、**運んだ先から引き戻される。**
  if (worldPhase === "interlude") return;

  const where = homeOf(worldPhase, membership(player));
  const home = PLACES[where];
  if (!isOutside(player.location, home)) return;
  try {
    const yaw = FACING[where];
    // **向きが決まっている場所では、必ずそちらを向かせる**
    player.teleport(center(home), yaw === undefined ? undefined : { rotation: { x: 0, y: yaw } });
  } catch {
    /* 消えている */
  }
}

/**
 * **運営か**（OP を持っているか）。
 *
 * **運営の道具は、これで守る**——`19-map-store.md` 7 章のコンパス、
 * `21-spawn-mark.md` の杖。
 */
export function isAdmin(player: Player): boolean {
  try {
    return player.commandPermissionLevel !== CommandPermissionLevel.Any;
  } catch {
    return false;
  }
}

/** 固定を全部解く。**一時停止から戻るとき** */
export function unfreezeAll(): void {
  anchors.clear();
}

/**
 * **全員をその場所へ運ぶ**（幕間の暗転中）。
 *
 * > ### 暗くなり切ってすぐ運ぶ
 * >
 * > 明るくする側で運ぶと**遅すぎて、移動が見える。**
 *
 * **湧く所はどのマップでも地面がある**（`14-map-build.md` 0-1）ので、
 * マップの差し替え前に運んでも足元が抜けない。
 */
export function moveAll(where: Home): void {
  const home = PLACES[where];
  const yaw = FACING[where];
  for (const p of members()) {
    try {
      p.teleport(center(home), yaw === undefined ? undefined : { rotation: { x: 0, y: yaw } });
    } catch {
      /* 抜けた */
    }
    // > ### 覚えた立ち位置も、ここで動かす
    // >
    // > 留め置かれている人（一時停止・リザルト）を運ぶことがある。
    // > **運ぶ前の立ち位置を覚えたままだと、運んだ先から引き戻される。**
    anchors.set(p.id, home);
  }
}
