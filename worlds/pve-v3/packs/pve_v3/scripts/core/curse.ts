/**
 * 呪い。**ウェーブを越えるたびに、敵へ積み上がる強化。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md` 4 章。**純粋。**
 *
 * ```
 * ウェーブ終了 → n 個引く → 一度付いたら消えない → 次のウェーブに乗る
 * ```
 *
 * > ### 積むのは「倍率への足し算」
 * >
 * > **倍率は 1.0 から始まる。** HP を 3 回引けば **×1.6**。
 * > **掛け算ではないので、伸びは直線。**
 *
 * > ### 速さだけ上がり幅を小さくした理由
 * >
 * > **＋0.2 のままだと wave 11 で上限 ×3.0 に張り付き、以後の抽選が空振りになる。**
 * > **＋0.05 なら wave 28 前後まで伸び続ける。**
 */

/** 呪いの種類 */
export type CurseKind = "hp" | "power" | "speed" | "haste";

/** 何回引いたか */
export type CurseCount = Readonly<Record<CurseKind, number>>;

/** まっさら */
export const NO_CURSE: CurseCount = { hp: 0, power: 0, speed: 0, haste: 0 };

/** 1 回ぶんの上がり幅 */
const STEP: Readonly<Record<CurseKind, number>> = { hp: 0.2, power: 0.2, speed: 0.05, haste: 0.05 };

/** 上限。**HP と攻撃力には無い** */
const CAP: Readonly<Partial<Record<CurseKind, number>>> = { speed: 3, haste: 3 };

/** 見せる名前 */
export const CURSE_NAME: Readonly<Record<CurseKind, string>> = {
  hp: "HP",
  power: "攻撃力",
  speed: "移動速度",
  haste: "攻撃速度",
};

/** 引く順に並べる。**この並びが抽選の候補** */
export const CURSE_KINDS: readonly CurseKind[] = ["hp", "power", "speed", "haste"];

/**
 * そのウェーブの終わりに引く数。
 *
 * | wave | 引く数 |
 * | --- | --- |
 * | 1〜5 | **3** |
 * | 6〜10 | **5** |
 * | 11 以降 | **7** |
 */
export function drawCount(wave: number): number {
  if (wave <= 5) return 3;
  if (wave <= 10) return 5;
  return 7;
}

/** その種類の倍率 */
export function multOf(count: CurseCount, kind: CurseKind): number {
  const raw = 1 + STEP[kind] * Math.max(0, count[kind]);
  const cap = CAP[kind];
  return cap === undefined ? raw : Math.min(cap, raw);
}

/** 全部の倍率 */
export function multsOf(count: CurseCount): Readonly<Record<CurseKind, number>> {
  return {
    hp: multOf(count, "hp"),
    power: multOf(count, "power"),
    speed: multOf(count, "speed"),
    haste: multOf(count, "haste"),
  };
}

/** **上限に達したか。** 達したものは候補から外す */
export function isFull(count: CurseCount, kind: CurseKind): boolean {
  const cap = CAP[kind];
  if (cap === undefined) return false;
  return multOf(count, kind) >= cap;
}

/**
 * n 個引く。**上限に達したものは候補から外す**——溢れたぶんは残りへ流れる。
 *
 * @param roll 0〜1 を返すもの。**試験のために外から渡す**
 * @returns 引いた種類（**同じものが並ぶこともある**）
 */
export function draw(count: CurseCount, n: number, roll: () => number): CurseKind[] {
  const out: CurseKind[] = [];
  const now: Record<CurseKind, number> = { ...count };
  for (let i = 0; i < n; i++) {
    const open = CURSE_KINDS.filter((k) => !isFull(now, k));
    if (open.length === 0) break;
    const pick = open[Math.min(open.length - 1, Math.floor(roll() * open.length))] as CurseKind;
    now[pick]++;
    out.push(pick);
  }
  return out;
}

/** 引いたものを積む */
export function apply(count: CurseCount, picks: readonly CurseKind[]): CurseCount {
  const now: Record<CurseKind, number> = { ...count };
  for (const k of picks) now[k]++;
  return now;
}
