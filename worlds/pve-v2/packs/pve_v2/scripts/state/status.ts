/**
 * 一時的な状態。**メモリだけで持つ。**
 *
 * 仕様は `docs/spec/20-enchant.md`。
 *
 * ## なぜ動的プロパティに入れないのか
 *
 * | | |
 * | --- | --- |
 * | 寿命 | **数秒**。次のウェーブまで残らない |
 * | 数 | 敵の数だけ増える |
 * | 消えたとき | **消えてよい**（`/reload` で全部リセットされて困らない） |
 *
 * **鈍化だけは別**（`state/slow.ts`）——**敵を跨いで積み上がる値**なので、
 * 実体に紐づけて持つ。
 *
 * ## 何を持つか
 *
 * | | 誰が持つ | 何 |
 * | --- | --- | --- |
 * | 燃焼 | **敵 × 付けた人** | **溜まっている量**・あと何回・誰の |
 * | 被ダメージ増 | 敵 | 倍率・いつまで（焼灼／熔解） |
 * | 凍結 | 敵 | いつまで（絶対零度） |
 * | シールド | 人 | あと何 HP ぶん受け止めるか |
 * | 蓄え | 人 | 次の 1 発に乗せる値（止水） |
 * | 熱 | 人 | 連続で当てた数（熱暴走） |
 * | 最後に殴られた時刻 | 人 | 潤い |
 * | 加速 | 人 | いつまで（烈風） |
 * | クリの数 | 人 | 帯電の 5 回 |
 * | 大技の時刻 | 人 | 業火の一矢・万象の矢・嵐 |
 */

import type { Player } from "@minecraft/server";

/**
 * 燃焼 1 つ。**3 秒ぶんの輪で持つ。**
 *
 * ```
 * 当てるたび    いまの枠に「毎秒の値」を足す
 * 1 秒ごとに    3 枠の合計を払う → 輪を 1 つ進めて、いちばん古い枠を捨てる
 * ```
 *
 * **100 ダメージの攻撃が 3 回入れば、1 回の判定で 3 発ぶんが同時に入る。**
 * **3 秒より前に入れたぶんは、枠ごと落ちる**——**無限には重ならない。**
 *
 * | | |
 * | --- | --- |
 * | 持ち方 | **敵 × 付けた人**ごとに**数字 3 つ**だけ |
 * | 触る回数 | **1 秒に 1 回**（当てたときは足すだけ） |
 * | 端数 | **時刻ではなく枠で数える**——取りこぼしが出ない |
 */
export interface Burn {
  /** 誰が付けたか */
  readonly by: Player;
  /** 3 秒ぶんの枠。**それぞれ「毎秒いくら」** */
  readonly slots: number[];
  /** いま足す枠 */
  cursor: number;
  /** 次に払う時刻（tick） */
  next: number;
}

const burns = new Map<string, Burn>();
const vulns = new Map<string, { rate: number; until: number }>();
const frozen = new Map<string, number>();
const shields = new Map<string, number>();
const stored = new Map<string, number>();
const heat = new Map<string, { n: number; until: number }>();
const hurtAt = new Map<string, number>();
const rushUntil = new Map<string, number>();
const critHits = new Map<string, number>();
const bigAt = new Map<string, Map<string, number>>();

// ---------------------------------------------------------------- 燃焼

/** 1 回ぶんの間隔（tick）。**1 秒に 1 回** */
export const BURN_STEP = 20;

/** 鍵。**敵 ＋ 付けた人**（`docs/spec/20-enchant.md` 3-1） */
function burnKey(targetId: string, byId: string): string {
  return `${targetId}|${byId}`;
}

/** その鍵が指す敵 */
function targetOf(key: string): string {
  return key.split("|")[0] ?? key;
}

/**
 * 燃やす。**渡すのは「毎秒の値」。**
 *
 * **同じ人の攻撃は、いまの枠に積み上がる**——2 発当てれば 2 発ぶん。
 */
export function ignite(id: string, by: Player, per: number, now: number): void {
  if (per <= 0) return;
  const key = burnKey(id, by.id);
  const cur = burns.get(key);
  if (cur === undefined) {
    const slots = [0, 0, 0];
    slots[0] = per;
    burns.set(key, { by, slots, cursor: 0, next: now + BURN_STEP });
    return;
  }
  cur.slots[cur.cursor] = (cur.slots[cur.cursor] ?? 0) + per;
}

/** いま 1 回ぶんに入る量（3 枠の合計） */
export function burnRate(burn: Burn): number {
  return burn.slots.reduce((sum, v) => sum + v, 0);
}

/**
 * 1 回払う。**払った量を返す。**
 *
 * **払ったら輪を 1 つ進め、いちばん古い枠を捨てる**——3 秒で必ず落ちる。
 */
export function burnPay(burn: Burn, now: number): number {
  const pay = burnRate(burn);
  burn.cursor = (burn.cursor + 1) % burn.slots.length;
  burn.slots[burn.cursor] = 0;
  burn.next = now + BURN_STEP;
  return pay;
}

export function burnOf(id: string, byId: string): Burn | undefined {
  return burns.get(burnKey(id, byId));
}

/** **誰かの火で燃えているか**（焼灼・熔解・蒸気爆発が見る） */
export function burning(id: string, _now: number): boolean {
  for (const [key, b] of burns) {
    if (targetOf(key) === id && burnRate(b) > 0) return true;
  }
  return false;
}

/** 全部見る。**渡すのは「敵の id」**（鍵ではない） */
export function eachBurn(fn: (id: string, burn: Burn, key: string) => void): void {
  for (const [key, b] of [...burns]) fn(targetOf(key), b, key);
}

/** その敵の火を全部消す（倒れたとき） */
export function clearBurn(id: string): void {
  for (const key of [...burns.keys()]) {
    if (targetOf(key) === id) burns.delete(key);
  }
}

/** 1 本だけ消す */
export function clearBurnKey(key: string): void {
  burns.delete(key);
}

// ---------------------------------------------------------------- 被ダメージ増

/** 焼灼・熔解。**強いほうだけ残す**（同じ袋で二重取りしない） */
export function weaken(id: string, rate: number, ticks: number, now: number): void {
  const cur = vulns.get(id);
  if (cur !== undefined && cur.until > now && cur.rate >= rate) {
    cur.until = now + ticks;
    return;
  }
  vulns.set(id, { rate, until: now + ticks });
}

/** いまの被ダメージ倍率（1.0 が素） */
export function vulnOf(id: string, now: number): number {
  const v = vulns.get(id);
  if (v === undefined || v.until <= now) return 1;
  return 1 + v.rate;
}

// ---------------------------------------------------------------- 凍結

export function freeze(id: string, ticks: number, now: number): void {
  frozen.set(id, now + ticks);
}

export function isFrozen(id: string, now: number): boolean {
  return (frozen.get(id) ?? 0) > now;
}

// ---------------------------------------------------------------- 人が持つもの

/** シールド。**受けるダメージを先に食う** */
export function addShield(id: string, amount: number): void {
  shields.set(id, (shields.get(id) ?? 0) + Math.max(0, amount));
}

export function shieldOf(id: string): number {
  return shields.get(id) ?? 0;
}

/** シールドで受け止める。**残ったダメージを返す** */
export function absorb(id: string, amount: number): number {
  const have = shields.get(id) ?? 0;
  if (have <= 0) return amount;
  const used = Math.min(have, amount);
  shields.set(id, have - used);
  return amount - used;
}

/** 止水の蓄え */
export function store(id: string, amount: number, cap: number): void {
  stored.set(id, Math.min(cap, (stored.get(id) ?? 0) + Math.max(0, amount)));
}

/** 蓄えを使い切る */
export function takeStored(id: string): number {
  const v = stored.get(id) ?? 0;
  stored.set(id, 0);
  return v;
}

export function storedOf(id: string): number {
  return stored.get(id) ?? 0;
}

/** 熱暴走。**当てるたび増え、外すと戻る** */
export function heatUp(id: string, cap: number, ticks: number, now: number): number {
  const cur = heat.get(id);
  const n = cur !== undefined && cur.until > now ? Math.min(cap, cur.n + 1) : 1;
  heat.set(id, { n, until: now + ticks });
  return n;
}

/** 冷ます。**外したとき**に呼ぶ（`features/bow/shoot.ts`） */
export function coolHeat(id: string): void {
  heat.delete(id);
}

export function heatOf(id: string, now: number): number {
  const cur = heat.get(id);
  return cur !== undefined && cur.until > now ? cur.n : 0;
}

// ---------------------------------------------------------------- 弓の積み上げ
//
// **どちらも「1 射につき 1 段」**（`features/bow/shoot.ts` が数える）。
// **全弾外すと 0 に戻る。**

const focus = new Map<string, { target: string; n: number }>();
const quick = new Map<string, number>();

/** 狙い澄まし。**同じ敵に当て続けた回数**（相手が変わったら 1 から） */
export function focusOn(playerId: string, targetId: string): number {
  const cur = focus.get(playerId);
  const n = cur !== undefined && cur.target === targetId ? cur.n + 1 : 1;
  focus.set(playerId, { target: targetId, n });
  return n;
}

/** いまの段。**別の敵なら 0** */
export function focusOf(playerId: string, targetId: string): number {
  const cur = focus.get(playerId);
  return cur !== undefined && cur.target === targetId ? cur.n : 0;
}

export function focusReset(playerId: string): void {
  focus.delete(playerId);
}

/** 矢継ぎ早。**当て続けた回数** */
export function quickUp(playerId: string): number {
  const n = (quick.get(playerId) ?? 0) + 1;
  quick.set(playerId, n);
  return n;
}

export function quickOf(playerId: string): number {
  return quick.get(playerId) ?? 0;
}

export function quickReset(playerId: string): void {
  quick.delete(playerId);
}

/** 殴られた時刻（潤い） */
export function markHurt(id: string, now: number): void {
  hurtAt.set(id, now);
}

export function calmFor(id: string, now: number): number {
  return now - (hurtAt.get(id) ?? -9999);
}

// ---------------------------------------------------------------- 移動速度
//
// **バニラの「移動速度」効果は使わない**（2026-08-31 決定）——
// **段でしか刻めず、他の効果と混ざる。**
// **倍率だけをここに置き、`features/element/` が属性へ書き込む。**

const speed = new Map<string, { mult: number; until: number }>();

/** 一時的に速くする。**強いほうだけ残す** */
export function boostSpeed(id: string, mult: number, ticks: number, now: number): void {
  const cur = speed.get(id);
  if (cur !== undefined && cur.until > now && cur.mult >= mult) {
    cur.until = now + ticks;
    return;
  }
  speed.set(id, { mult, until: now + ticks });
}

/** いまの倍率（1.0 が素） */
export function speedOf(id: string, now: number): number {
  const cur = speed.get(id);
  return cur !== undefined && cur.until > now ? cur.mult : 1;
}

/** 加速（烈風） */
export function rush(id: string, ticks: number, now: number): void {
  rushUntil.set(id, now + ticks);
}

export function rushing(id: string, now: number): boolean {
  return (rushUntil.get(id) ?? 0) > now;
}

/** クリの数（帯電）。**5 回で 1 回返す** */
export function countCrit(id: string, every: number): boolean {
  const n = (critHits.get(id) ?? 0) + 1;
  if (n < every) {
    critHits.set(id, n);
    return false;
  }
  critHits.set(id, 0);
  return true;
}

/** 周期の大技。**間隔が空いていれば true**（そのとき時刻を更新する） */
export function ready(id: string, name: string, interval: number, now: number): boolean {
  const mine = bigAt.get(id) ?? new Map<string, number>();
  const last = mine.get(name) ?? -9999;
  if (now - last < interval) return false;
  mine.set(name, now);
  bigAt.set(id, mine);
  return true;
}
