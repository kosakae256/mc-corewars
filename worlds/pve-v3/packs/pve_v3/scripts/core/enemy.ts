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

/**
 * **移動速度の換算**（`23-enemy-unit.md` 2 章）。
 *
 * > ### 固有値 1 ＝ **プレイヤーの歩き**
 * >
 * > **バニラの `minecraft:movement` の値とは別物。**
 * > `movement = 固有値 × WALK`。
 * >
 * > **0.2875 は「ゾンビが 0.23 になる」値**（2026-09-07）。
 * > バニラのゾンビは**歩きの 0.8 倍**——固有値 0.8 と噛み合う。
 */
export const WALK = 0.2875;

/** 敵 1 種 */
export interface EnemyDef {
  readonly id: string;
  readonly name: string;
  /** 固有の HP */
  readonly hp: number;
  /** 固有の攻撃力 */
  readonly attack: number;
  /** 固有の移動速度。**1 ＝ プレイヤーの歩き**（`WALK` で換算） */
  readonly speed: number;
  /** 殴る間隔（tick） */
  readonly interval: number;
  /** 届く距離（マス） */
  readonly reach: number;
  /** 動き方 */
  readonly kind: "melee" | "shoot" | "boom";
  /** **エメラルド倍率**（`23-enemy-unit.md` 5 章）。**書かなければ 1** */
  readonly emerald?: number;
  /** **ボスか**（`23-enemy-unit.md` 7 章）。**書かなければ雑魚** */
  readonly boss?: boolean;
}

/** エメラルド倍率。**書いていなければ 1** */
export function emeraldOf(def: EnemyDef): number {
  return def.emerald === undefined ? 1 : def.emerald;
}

/** **値は全部仮**（`16-enemy.md` 5 章） */
export const ENEMIES: Readonly<Record<string, EnemyDef>> = {
  grunt: { id: "grunt", name: "ゾンビ", hp: 40, attack: 20, speed: 0.8, interval: 20, reach: 2.5, kind: "melee" },
  bones: { id: "bones", name: "ボーンズ", hp: 30, attack: 12, speed: 1.0, interval: 30, reach: 16, kind: "shoot" },
  bomber: { id: "bomber", name: "ボマー", hp: 25, attack: 45, speed: 1.1, interval: 40, reach: 2.0, kind: "boom" },
  raider: { id: "raider", name: "レイダー", hp: 45, attack: 15, speed: 1.0, interval: 35, reach: 18, kind: "shoot" },
  brute: { id: "brute", name: "ブルート", hp: 70, attack: 30, speed: 1.2, interval: 16, reach: 2.8, kind: "melee" },
  beast: { id: "beast", name: "ビースト", hp: 200, attack: 50, speed: 1.2, interval: 30, reach: 3.5, kind: "melee" },
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
 * HP のウェーブ倍率（`16-enemy.md` 3-3・2026-09-06 に決め直した）。
 *
 * ```
 * 1.1 ^ (wave − 1)
 * ```
 *
 * > ### 帯で積む形はやめた
 * >
 * > **wave 30 で ×301 まで伸び、数字が壊れていた。**
 * > **1 本の式にして、wave 15 で約 3.8 倍。** ここに呪いが乗る。
 */
export function waveScale(wave: number): number {
  return Math.pow(1.1, Math.max(1, wave) - 1);
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

/**
 * **その 1 体の値を、まとめて出す**（`23-enemy-unit.md` 6 章）。
 *
 * ```
 * HP       ＝ 固有値 × 1.1^(wave−1) × 呪い(HP) × 丸め   （掛け算）
 * 力       ＝ 固有値 × (人数倍率 ＋ 呪い(攻撃力) − 1)      （加算）
 * 移動速度 ＝ 固有値 × 呪い(移動速度)                      （**人数は効かない**）
 * 攻撃速度 ＝ 固有値 × (人数倍率 ＋ 呪い(攻撃速度) − 1)    （加算）
 * ```
 *
 * **呪いは種類ごとに別の倍率**（`core/curse.ts`）。**上限もそちらで掛かっている。**
 */
export function statsOf(
  def: EnemyDef,
  o: {
    readonly wave: number;
    readonly players: number;
    readonly pack: number;
    readonly curse: { readonly hp: number; readonly power: number; readonly speed: number; readonly haste: number };
  }
): { readonly hp: number; readonly attack: number; readonly move: number; readonly swing: number } {
  return {
    hp: hpOf(def, o.wave, o.curse.hp, o.pack),
    attack: attackOf(def, o.players, o.curse.power),
    move: moveOf(def, o.curse.speed),
    swing: swingOf(def, o.players, o.curse.haste),
  };
}

/**
 * **倍率を重ねる。加算で。**（`16-enemy.md` 1-2・2026-09-07 決定）
 *
 * ```
 * 1 ＋ Σ(それぞれの倍率 − 1)
 * ```
 *
 * > ### 掛け算にしない
 * >
 * > **人数 ×1.10 と呪い ×1.85 を掛けると ×2.035。**
 * > **足せば ×1.95。** **重なるほど跳ね上がるのを避ける。**
 *
 * **HP だけは掛け算のまま**——ウェーブ倍率と呪いは、二重に伸びるのが狙い。
 */
export function addMult(...mults: readonly number[]): number {
  let sum = 1;
  for (const m of mults) sum += m - 1;
  return Math.max(0, sum);
}

/** その 1 体の攻撃力。**丸めは掛からない** */
export function attackOf(def: EnemyDef, players: number, curse: number): number {
  return Math.max(1, Math.round(def.attack * addMult(powerScale(players), curse)));
}

/**
 * その 1 体の**バニラの移動速度**（`minecraft:movement` に入れる値）。
 *
 * **固有値 1 ＝ プレイヤーの歩き**（`WALK`）。
 *
 * > ### **人数では速くならない**（2026-09-07 決定）
 * >
 * > **速さが上がるのが、いちばん脅威。**
 * > **人数が増えても、逃げ切れなくなってはいけない。**
 * > **速くするのは呪いだけ**（上限 ×3.0）。
 */
export function moveOf(def: EnemyDef, curse: number): number {
  return def.speed * WALK * curse;
}

/**
 * その 1 体の**殴る間隔**（tick）。
 *
 * > ### 攻撃速度は「大きいほど速い」（`23-enemy-unit.md` 2 章）
 * >
 * > **間隔は割り算で縮む。** 呪いと人数の倍率が、そのまま攻撃速度。
 */
export function swingOf(def: EnemyDef, players: number, curse: number): number {
  return Math.max(1, Math.round(def.interval / addMult(powerScale(players), curse)));
}

/**
 * **攻撃速度の段**（`23-enemy-unit.md` 3-3）。
 *
 * > ### `cooldown_time` は実行中に書き換えられない
 * >
 * > **段ごとの部品を実体に持たせ、湧いた瞬間に切り替える**
 * > （`entities/*.json` の `pve_v3:haste_*`）。
 * > **一番近い段に丸める。**
 */
export const HASTE_TIERS: readonly number[] = [1, 1.25, 1.5, 2, 2.5, 3];

/** その倍率に一番近い段（**100 倍した整数**。実体の合図に使う） */
export function hasteTier(mult: number): number {
  let best = HASTE_TIERS[0] ?? 1;
  for (const t of HASTE_TIERS) {
    if (Math.abs(t - mult) < Math.abs(best - mult)) best = t;
  }
  return Math.round(best * 100);
}
