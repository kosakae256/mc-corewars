/**
 * 敵の表と、値の出し方。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md`。
 *
 * ```
 * 出す種類と数 ＝ 敵グループ（★）
 * 1 体の値     ＝ 固有値 × 人数倍率 × ウェーブ倍率 × 呪い倍率 × 丸め係数
 * ```
 *
 * > ### 丸めは「詰め替え」であって、増減ではない
 * >
 * > **出したい数が上限を超えたら、超えたぶんを HP に詰め替える。**
 * > 83 体 × 40 と 50 体 × 66 で、総量はほぼ同じ。
 */

/** 敵 1 種 */
export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  /** 固有の HP */
  readonly hp: number;
  /** 固有の攻撃力 */
  readonly attack: number;
  /** 固有の移動速度 */
  readonly speed: number;
  /** 殴る間隔（tick） */
  readonly interval: number;
  /** 届く距離（マス） */
  readonly reach: number;
  /** 動き方 */
  readonly kind: "melee" | "shoot" | "boom";
}

/** **値は全部仮**（`16-enemy.md` 5 章） */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  grunt: { id: "grunt", name: "グラント", hp: 40, attack: 20, speed: 0.23, interval: 20, reach: 2.5, kind: "melee" },
  bones: { id: "bones", name: "ボーンズ", hp: 30, attack: 12, speed: 0.25, interval: 30, reach: 16, kind: "shoot" },
  bomber: { id: "bomber", name: "ボマー", hp: 25, attack: 45, speed: 0.28, interval: 40, reach: 2.0, kind: "boom" },
  raider: { id: "raider", name: "レイダー", hp: 45, attack: 15, speed: 0.25, interval: 35, reach: 18, kind: "shoot" },
  brute: { id: "brute", name: "ブルート", hp: 70, attack: 30, speed: 0.3, interval: 16, reach: 2.8, kind: "melee" },
  beast: { id: "beast", name: "ビースト", hp: 200, attack: 50, speed: 0.3, interval: 30, reach: 3.5, kind: "melee" },
};

/** 敵グループ（★） */
export interface LegionDef {
  readonly id: string;
  readonly name: string;
  readonly star: number;
  /** 基礎の数 */
  readonly base: number;
  /** 中身。**足して 1 になる比率** */
  readonly mix: readonly { readonly enemy: string; readonly ratio: number }[];
}

/** **★1 の 3 つは 1 種類だけの群れ。★3 だけが 3 種類混ざる** */
export const LEGIONS: Readonly<Record<string, LegionDef>> = {
  zombie: { id: "zombie", name: "ゾンビ軍団", star: 1, base: 15, mix: [{ enemy: "grunt", ratio: 1 }] },
  skeleton: { id: "skeleton", name: "スケルトン軍団", star: 1, base: 12, mix: [{ enemy: "bones", ratio: 1 }] },
  creeper: { id: "creeper", name: "クリーパー軍団", star: 1, base: 10, mix: [{ enemy: "bomber", ratio: 1 }] },
  raider: {
    id: "raider",
    name: "略奪者集団",
    star: 3,
    base: 18,
    mix: [
      { enemy: "raider", ratio: 0.6 },
      { enemy: "brute", ratio: 0.3 },
      { enemy: "beast", ratio: 0.1 },
    ],
  },
  // > ### 仮置き 11 個（2026-09-05 追加）
  // >
  // > **中身はゾンビ軍団と同じ。★と数だけ違う。**
  // > **3 択とゲートの色を確かめるのに、★が散っていないと分からない**
  // > （`16-enemy.md` 2 章）。**本物ができたら置き換える。**
  mock1: { id: "mock1", name: "(仮)ゾンビ軍団1", star: 2, base: 18, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock2: { id: "mock2", name: "(仮)ゾンビ軍団2", star: 2, base: 18, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock3: { id: "mock3", name: "(仮)ゾンビ軍団3", star: 3, base: 22, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock4: { id: "mock4", name: "(仮)ゾンビ軍団4", star: 4, base: 26, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock5: { id: "mock5", name: "(仮)ゾンビ軍団5", star: 4, base: 26, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock6: { id: "mock6", name: "(仮)ゾンビ軍団6", star: 5, base: 30, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock7: { id: "mock7", name: "(仮)ゾンビ軍団7", star: 5, base: 30, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock8: { id: "mock8", name: "(仮)ゾンビ軍団8", star: 6, base: 34, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock9: { id: "mock9", name: "(仮)ゾンビ軍団9", star: 6, base: 34, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock10: { id: "mock10", name: "(仮)ゾンビ軍団10", star: 3, base: 22, mix: [{ enemy: "grunt", ratio: 1 }] },
  mock11: { id: "mock11", name: "(仮)ゾンビ軍団11", star: 2, base: 18, mix: [{ enemy: "grunt", ratio: 1 }] },
};

/** 数の人数倍率。**1 ＋ 0.5 ×(人数 − 1)** */
export function countScale(players: number): number {
  return 1 + 0.5 * Math.max(0, players - 1);
}

/** 攻撃力・速度の人数倍率。**1 ＋ 0.05 ×(人数 − 1)** */
export function powerScale(players: number): number {
  return 1 + 0.05 * Math.max(0, players - 1);
}

/** そのウェーブで出せる上限。**min(100, 40 ＋ 10 × wave)** */
export function capOf(wave: number): number {
  return Math.min(100, 40 + 10 * wave);
}

/**
 * HP のウェーブ倍率。
 *
 * **前半は足し算で緩やか、後半は掛け算で跳ね上がる。**
 */
export function waveScale(wave: number): number {
  let v = 1;
  for (let w = 2; w <= wave; w++) {
    if (w <= 5) v += 0.4;
    else if (w <= 10) v += 0.6;
    else if (w <= 15) v += 1.0;
    else v *= 1.25;
  }
  return v;
}

/** そのウェーブで出す中身 */
export interface Plan {
  /** 出す数（実際に出る数） */
  readonly count: number;
  /** **上限に当たったぶんを HP に詰め替える係数** */
  readonly pack: number;
  /** 何をいくつ出すか */
  readonly picks: readonly { readonly enemy: EnemyDef; readonly count: number }[];
}

/**
 * 出す中身を決める。
 *
 * @param players 参加人数
 * @param wave いまのウェーブ
 */
export function planOf(legion: LegionDef, players: number, wave: number): Plan {
  const want = Math.ceil(legion.base * countScale(players));
  const cap = capOf(wave);
  const count = Math.min(want, cap);
  const pack = count > 0 ? want / count : 1;

  // **比率で割り振り、端数は最初の種類へ寄せる**
  const picks: { enemy: EnemyDef; count: number }[] = [];
  let left = count;
  for (const [i, m] of legion.mix.entries()) {
    const def = ENEMIES[m.enemy];
    if (def === undefined) continue;
    const n = i === legion.mix.length - 1 ? left : Math.min(left, Math.round(count * m.ratio));
    if (n > 0) picks.push({ enemy: def, count: n });
    left -= n;
  }
  return { count, pack, picks };
}

/** その 1 体の HP */
export function hpOf(def: EnemyDef, wave: number, curse: number, pack: number): number {
  return Math.max(1, Math.round(def.hp * waveScale(wave) * curse * pack));
}

/** その 1 体の攻撃力。**丸めは掛からない** */
export function attackOf(def: EnemyDef, players: number, curse: number): number {
  return Math.max(1, Math.round(def.attack * powerScale(players) * curse));
}
