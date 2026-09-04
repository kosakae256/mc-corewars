/**
 * ステータス強化の算数。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/15-growth.md`。
 *
 * ```
 * 値   ＝ 初期 ＋ 1 回ぶん × 回数
 * 値段 ＝ 50 × n              （n はそのステータスの n 回目）
 * ```
 *
 * ## 4 本とも上限は 40 回
 *
 * | | 初期 | 1 回で | 上限まで |
 * | --- | --- | --- | --- |
 * | HP | 100 | ＋50 | **2,100** |
 * | 足の速さ | 1.0 | ＋0.025 | **2.0** |
 * | 攻撃速度 | 1.0 | ＋0.05 | **3.0** |
 * | 攻撃力 | 1.0 | ＋0.1 | **5.0** |
 *
 * **1 本を上限まで 41,000／4 本で 164,000。**
 */

/** 伸ばせるもの */
export type StatKey = "hp" | "speed" | "haste" | "power";

/** 並び。**画面に出す順** */
export const STAT_KEYS: readonly StatKey[] = ["hp", "speed", "haste", "power"];

export interface StatDef {
  /** 画面に出す名前 */
  readonly label: string;
  /** 買う前の値 */
  readonly base: number;
  /** 1 回で増える量 */
  readonly step: number;
  /** 買える回数 */
  readonly maxLevel: number;
  /**
   * 表示と丸めの桁。
   *
   * **0.025 を 40 回足すと 2.0000000000000004 になる**——
   * **この桁で丸めないと、上限が上限にならない。**
   */
  readonly digits: number;
}

/** 買える回数。**4 本とも同じ** */
const MAX_LEVEL = 40;

/** 1 回目の値段。**n 回目は この n 倍** */
const COST_UNIT = 50;

export const STATS: Readonly<Record<StatKey, StatDef>> = {
  hp: { label: "HP", base: 100, step: 50, maxLevel: MAX_LEVEL, digits: 0 },
  speed: { label: "足の速さ", base: 1, step: 0.025, maxLevel: MAX_LEVEL, digits: 3 },
  haste: { label: "攻撃速度", base: 1, step: 0.05, maxLevel: MAX_LEVEL, digits: 2 },
  power: { label: "攻撃力", base: 1, step: 0.1, maxLevel: MAX_LEVEL, digits: 1 },
};

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** 回数を 0〜上限に収める。**壊れた値は 0 として扱う** */
export function clampLevel(key: StatKey, level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(STATS[key].maxLevel, Math.floor(level)));
}

/** その回数での値 */
export function statValue(key: StatKey, level: number): number {
  const def = STATS[key];
  return round(def.base + def.step * clampLevel(key, level), def.digits);
}

/** 上限まで買ったか */
export function isMaxed(key: StatKey, level: number): boolean {
  return clampLevel(key, level) >= STATS[key].maxLevel;
}

/**
 * 次の 1 回の値段。
 *
 * **上限に達していれば undefined**——「買えない」を値で表す。
 */
export function nextCost(key: StatKey, level: number): number | undefined {
  const lv = clampLevel(key, level);
  if (lv >= STATS[key].maxLevel) return undefined;
  return COST_UNIT * (lv + 1);
}

/** 0 からその回数まで買うのに要った総額 */
export function totalCost(key: StatKey, level: number): number {
  const lv = clampLevel(key, level);
  return (COST_UNIT * (lv * (lv + 1))) / 2;
}

/**
 * 手持ちで何回買えるか。
 *
 * **上限にも財布にも当たる**ので、両方で止める。
 */
export function affordable(key: StatKey, level: number, emerald: number): { times: number; cost: number } {
  let lv = clampLevel(key, level);
  let left = Math.max(0, Math.floor(emerald));
  let times = 0;
  let cost = 0;
  for (;;) {
    const price = nextCost(key, lv);
    if (price === undefined || price > left) break;
    left -= price;
    cost += price;
    lv++;
    times++;
  }
  return { times, cost };
}

/** 画面から来た文字を鍵に直す。**見つからなければ undefined** */
export function toStatKey(name: string): StatKey | undefined {
  const s = name.trim().toLowerCase();
  if (s === "hp" || s === "体力") return "hp";
  if (s === "speed" || s === "足" || s === "足の速さ" || s === "移動速度") return "speed";
  if (s === "haste" || s === "攻速" || s === "攻撃速度") return "haste";
  if (s === "power" || s === "攻撃力" || s === "火力") return "power";
  return undefined;
}
