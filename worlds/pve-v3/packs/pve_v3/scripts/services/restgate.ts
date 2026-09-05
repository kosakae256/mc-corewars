/**
 * 休憩所の 3 択。**次の 3 戦の相手を、みんなで選ぶ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 3-2。
 *
 * ```
 * 休憩所に入る  候補を 3 つ引く → 印の上にモブを立て、板を出す
 * 立っている間  モブを殴ると、その候補に 1 票（何度でも入れ直せる）
 * 出るとき      多数決。同数ならその中からランダム
 * ```
 *
 * > ### ゲートは 1 つのまま
 * >
 * > **門を 3 つ建てるのは手間。** 3 択は**ゲートの前**に置く。
 */

import { world, type Dimension, type Entity, type Player, type Vector3 } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import { averageStar, drawOffers, GATES, lineOf, starColor, winner, type Offer } from "../core/gate-choice.js";
import { clampStar } from "../core/portal.js";
import { VOTE_SPOTS } from "../core/places.js";
import { setRun } from "../state/match.js";
import { setVote, voteOf } from "../state/vote.js";
import { members } from "./presence.js";

/** 投票用のモブ */
export const BALLOT = "pve_v3:ballot";

/**
 * 板を出す高さ（印から）
 *
 * > ### **`DebugText` は beta の口**（2026-09-05）
 * >
 * > **ワールドの「ベータ API」実験が要る。** 入れていないと
 * > **BP ごと読み込まれない**（`… Beta APIs experiment is not enabled`）。
 * > **このワールドは入れる**と決めた。`13-flow.md` 3-2。
 */
const BOARD_UP = 3.3;

/** 板が見える距離（マス） */
const RENDER_DISTANCE = 64;

/** いま出している候補 */
let offers: readonly Offer[] = [];

/** いま出している板 */
let boards: DebugText[] = [];

function dim(): Dimension {
  return world.getDimension("overworld");
}

/**
 * 立ち位置。**左から順**（`core/places.ts` の `VOTE_SPOTS`）。
 *
 * **印のブロックを探すのをやめた**（2026-09-05）——
 * **建て直さないと出てこない**のが面倒だった。
 */
function gatePosts(): readonly Vector3[] {
  return VOTE_SPOTS;
}

/** 場に居る投票用のモブ */
function ballots(): Entity[] {
  try {
    return dim().getEntities({ type: BALLOT });
  } catch {
    return [];
  }
}

/** 板を全部消す */
function clearBoards(): void {
  for (const b of boards) {
    try {
      debugDrawer.removeShape(b);
    } catch {
      /* 既に消えている */
    }
  }
  boards = [];
}

/** 片付ける */
export function closeGates(): void {
  clearBoards();
  for (const e of ballots()) {
    try {
      e.remove();
    } catch {
      /* もう居ない */
    }
  }
}

/** 門ごとの票数 */
export function tally(): number[] {
  const counts = new Array<number>(GATES).fill(0);
  for (const p of members()) {
    const v = voteOf(p);
    if (v === undefined) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

/**
 * 板の中身。**行数も左右幅も決まっている**（`13-flow.md` 3-2）。
 */
function boardText(index: number, offer: Offer, votes: number): string {
  const avg = averageStar(offer);
  const lines = [`§6§lNEXT ENEMY  ${index + 1}`, `§7average star  ${starColor(avg)}${avg.toFixed(1)}`, ""];
  for (const id of offer) lines.push(lineOf(id));
  lines.push("", `§7votes  §f${votes}`);
  return lines.join("\n");
}

/** 板を 1 枚出す */
function drawBoard(at: Vector3, body: string): void {
  try {
    const shape = new DebugText({ x: at.x + 0.5, y: at.y + BOARD_UP, z: at.z + 0.5 }, body);
    // **向きを固定する。** 立てないとカメラに追従して、掛かって見えない
    shape.useRotation = true;
    shape.rotation = { x: 0, y: 0, z: 0 };
    // **壁越しに描く。** 既定でこちらだが、意図として書いておく
    shape.depthTest = false;
    shape.color = { red: 1, green: 1, blue: 1, alpha: 1 };
    shape.maximumRenderDistance = RENDER_DISTANCE;
    debugDrawer.addShape(shape, dim());
    boards.push(shape);
  } catch {
    /* 読み込まれていない。次の機会に */
  }
}

/** 板を出し直す（票が変わったとき） */
function redraw(): void {
  clearBoards();
  const counts = tally();
  for (const [i, at] of gatePosts().entries()) {
    const offer = offers[i];
    if (offer === undefined) break;
    drawBoard(at, boardText(i, offer, counts[i] ?? 0));
  }
}

/**
 * **休憩所に入った瞬間。** 候補を引いて、モブを立てて、板を出す。
 *
 * @returns 立てた数
 */
export function openGates(): number {
  closeGates();
  offers = drawOffers(Math.random);
  return spawnAll();
}

/** いまの候補ぶんのモブを立てて、板を出す */
function spawnAll(): number {
  let n = 0;
  for (const [i, at] of gatePosts().entries()) {
    const offer = offers[i];
    if (offer === undefined) break;
    try {
      const e = dim().spawnEntity(BALLOT, { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 });
      // **★の平均で色を選ぶ**（0〜5 ＝ ★1〜6）
      e.setProperty("pve_v3:kind", clampStar(Math.round(averageStar(offer))) - 1);
      n++;
    } catch {
      /* 読み込まれていない */
    }
  }
  redraw();
  return n;
}

/**
 * **居なければ立て直す。** 休憩所に居る間、毎周期。
 *
 * > ### 覚えるより、あるべき姿へ寄せる（`docs/imp.md` 10-7）
 * >
 * > **`/reload` しても、消してしまっても戻る。**
 * > **候補ごと消えていたら引き直す**——票も捨てる。
 */
export function ensureGates(): void {
  if (offers.length === 0) {
    openGates();
    return;
  }
  if (ballots().length >= Math.min(offers.length, gatePosts().length)) return;
  closeGates();
  spawnAll();
}

/** そのモブが何番目の候補か（左から数える） */
export function gateOf(entity: Entity): number | undefined {
  const found = gatePosts();
  let at: Vector3;
  try {
    at = entity.location;
  } catch {
    return undefined;
  }
  for (const [i, post] of found.entries()) {
    if (i >= GATES) break;
    if (Math.hypot(at.x - (post.x + 0.5), at.z - (post.z + 0.5)) < 1.2) return i;
  }
  return undefined;
}

/** **殴られた。** その候補に入れる */
export function castVote(player: Player, gate: number): void {
  if (offers.length === 0) return;
  if (voteOf(player) === gate) return;
  setVote(player, gate);
  redraw();
  try {
    player.playSound("random.orb", { volume: 0.4, pitch: 1.4 });
    player.onScreenDisplay.setActionBar(`§f${gate + 1} 番目§7 に入れた`);
  } catch {
    /* 抜けた */
  }
}

/**
 * **休憩所を出るとき。** 多数決で次の 3 戦を決める。
 *
 * @returns 決まった候補の番号（候補が無ければ undefined）
 */
export function settleGates(): number | undefined {
  if (offers.length === 0) return undefined;
  const i = winner(tally(), Math.random);
  const offer = offers[i];
  closeGates();
  if (offer === undefined) return undefined;
  setRun(offer);
  return i;
}
