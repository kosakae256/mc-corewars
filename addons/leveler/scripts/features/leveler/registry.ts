/**
 * 複数のボットで共有する状態。
 *
 * 100体規模を想定しているので、**互いの邪魔をしない**ための調整をここに集める。
 *
 *   - どのマスを誰が狙っているか（予約）
 *   - どこに誰が立っているか（埋めない・掘らないため）
 *
 * 状態と操作がセットなのでモジュールに閉じ込める（docs/imp.md「要するに」3）。
 */
import { system, type Vector3 } from "@minecraft/server";
import type { SimulatedPlayer } from "@minecraft/server-gametest";

import type { Target } from "./logic.js";

/**
 * 座標を文字列キーにする。Map の添字用。
 *
 * **高さを含めない。** ボットの担当は1マスではなく
 * **縦3マスの列まるごと**なので（spec 3-3）、
 * 予約も保留も (x, z) の単位で扱う。
 */
export function keyOf(t: { x: number; z: number }): string {
  return `${t.x},${t.z}`;
}

/** キー → 予約したボット名 */
const claims = new Map<string, string>();

/** ボット名 → 本体 */
const bots = new Map<string, SimulatedPlayer>();

// ---------------------------------------------------------------- 予約

/**
 * そのマスを予約する。
 *
 * 既に他のボットが狙っているなら false。
 * 100体が同じ穴に殺到するのを防ぐ。
 */
export function claim(target: Target, owner: string): boolean {
  const k = keyOf(target);
  const holder = claims.get(k);
  if (holder !== undefined && holder !== owner) return false;
  claims.set(k, owner);
  return true;
}

/** 予約を解放する */
export function release(target: Target, owner: string): void {
  const k = keyOf(target);
  if (claims.get(k) === owner) claims.delete(k);
}

/** そのマスが他のボットに予約されているか */
export function isClaimedByOther(target: Target, self: string): boolean {
  const holder = claims.get(keyOf(target));
  return holder !== undefined && holder !== self;
}

/** そのボットの予約を全て解放する（退場時など） */
export function releaseAll(owner: string): void {
  for (const [k, v] of claims) {
    if (v === owner) claims.delete(k);
  }
}

// ---------------------------------------------------------------- ボット

export function registerBot(name: string, bot: SimulatedPlayer): void {
  bots.set(name, bot);
}

export function unregisterBot(name: string): void {
  bots.delete(name);
  releaseAll(name);
}

export function allBots(): { name: string; bot: SimulatedPlayer }[] {
  const out: { name: string; bot: SimulatedPlayer }[] = [];
  for (const [name, bot] of bots) {
    if (bot.isValid) out.push({ name, bot });
    else bots.delete(name);
  }
  return out;
}

/** その名前が登録済みのボットか */
export function isBot(name: string | undefined): boolean {
  return name !== undefined && bots.has(name);
}

export function botCount(): number {
  return bots.size;
}

/**
 * その座標に**いずれかのボットが立っているか**。
 *
 * 立っている場所を埋めると相手が埋没するので、その判定に使う。
 * プレイヤーは足元と頭の2マスを占める。
 */
export function isOccupiedByAnyBot(target: Target, ignore?: string): boolean {
  for (const [name, bot] of bots) {
    if (name === ignore) continue;
    if (!bot.isValid) continue;

    const p = bot.location;
    if (target.x !== Math.floor(p.x) || target.z !== Math.floor(p.z)) continue;

    const feet = Math.floor(p.y);
    if (target.y >= feet && target.y <= feet + 1) return true;
  }
  return false;
}

/**
 * **自分より低い位置にいるボット**を1体返す。自分は除く。
 *
 * 暇なボットが殴りに行く相手（spec 3-A-8）。
 * 下にいるボットは穴から出られなくなっている可能性が高い。
 * **殴って吹き飛ばしてやると実際に助かる**
 * （ノックバックは無敵時間に縛られないので、上に押し出せる）。
 *
 * 複数いればランダムに選ぶ。全員で1体に群がらないため。
 *
 * @param fromY 殴りに行く側の足元の高さ
 */
export function botBelow(fromY: number, self: string): SimulatedPlayer | undefined {
  const feet = Math.floor(fromY);
  const lower = allBots().filter(
    (b) => b.name !== self && Math.floor(b.bot.location.y) < feet
  );
  if (lower.length === 0) return undefined;
  return lower[Math.floor(Math.random() * lower.length)]?.bot;
}

/**
 * ボットを1体ランダムに返す。自分は除く。
 *
 * 暇なときの殴り合い（spec 3-A-8）で使う。
 * **近い相手ではなくランダムに選ぶ。**
 * 近い相手だと、たまたま隣にいる2体だけで殴り合って絵が固まる。
 * ランダムなら遠くまで殴りに行くので、全体が動く。
 */
export function randomBot(self: string): SimulatedPlayer | undefined {
  const others = allBots().filter((b) => b.name !== self);
  if (others.length === 0) return undefined;
  return others[Math.floor(Math.random() * others.length)]?.bot;
}

// ---------------------------------------------------------------- 退避

/**
 * そのマスに立っているボットを返す。
 *
 * 埋めようとしている場所に誰かがいるとき、
 * その相手に「どいてもらう」ために使う。
 */
export function botStandingAt(
  target: Target,
  ignore?: string
): { name: string; bot: SimulatedPlayer } | undefined {
  for (const [name, bot] of bots) {
    if (name === ignore) continue;
    if (!bot.isValid) continue;

    const p = bot.location;
    if (target.x !== Math.floor(p.x) || target.z !== Math.floor(p.z)) continue;

    const feet = Math.floor(p.y);
    if (target.y >= feet && target.y <= feet + 1) return { name, bot };
  }
  return undefined;
}

/** ボット名 → 退避の指示（いつまで / どこへ） */
const evac = new Map<string, { until: number; to: Vector3 }>();

/**
 * そのボットに「どいてほしい」と伝える。
 *
 * 直接動かさず**指示を置くだけ**にする。
 * 相手は自分のループの中で気づいて退避する
 * （他のボットを横から操作すると状態が壊れやすい）。
 *
 * **行き先もここで決めて持たせる。**
 * 相手が毎 tick 行き先を計算し直すと、そのたび経路が引き直されて
 * その場で揺れるだけになる。
 */
export function requestEvacuate(name: string, to: Vector3, ticks: number): void {
  // 既にどいている最中なら、上書きして行き先を変えない
  if (isEvacuating(name)) return;
  evac.set(name, { until: system.currentTick + ticks, to });
}

/** 退避中か */
export function isEvacuating(name: string): boolean {
  const e = evac.get(name);
  if (!e) return false;
  if (system.currentTick >= e.until) {
    evac.delete(name);
    return false;
  }
  return true;
}

/** 退避先。退避中でなければ undefined */
export function evacDestination(name: string): Vector3 | undefined {
  return isEvacuating(name) ? evac.get(name)?.to : undefined;
}

// ---------------------------------------------------------------- 保留

/** キー → この tick までは候補にしない */
const deferred = new Map<string, number>();

/**
 * そのマスを一定時間だけ候補から外す。
 *
 * 「どいて」と頼んだ直後のマスに使う。
 * これをしないと、次の走査で**また同じマスが最優先で選ばれ**、
 * 頼んでは飛ばすを繰り返して作業が一切進まない。
 */
export function defer(target: Target, ticks: number): void {
  // 期限切れが溜まり続けないよう、時々まとめて掃除する
  if (deferred.size > 512) {
    const now = system.currentTick;
    for (const [k, until] of deferred) {
      if (now >= until) deferred.delete(k);
    }
  }
  deferred.set(keyOf(target), system.currentTick + ticks);
}

/** 保留中か */
export function isDeferred(target: Target): boolean {
  const k = keyOf(target);
  const until = deferred.get(k);
  if (until === undefined) return false;
  if (system.currentTick >= until) {
    deferred.delete(k);
    return false;
  }
  return true;
}
