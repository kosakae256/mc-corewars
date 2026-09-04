/**
 * 飛竜の攻撃表と、飛行の決まり。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md` 5〜6 章。
 *
 * ```
 * 地上   0     5   8  10        18        30 マス
 *        |─回転攻撃─|
 *              |─突進からの噛みつき─|
 *                 |──── 火の玉 ────────────|
 *
 * 空中          10    12              32   34 マス
 *               |──── 火の玉（空）────────────|
 *                     |─ 急降下からの横殴り ─|
 * ```
 *
 * > ### 全部の攻撃に通す 3 つ（6-0）
 * >
 * > 1. **予備動作を必ず置く。** 溜めの間は動かず、当たり判定も出さない
 * > 2. **狙いは溜めを始めた瞬間で固定。** 追尾しない
 * > 3. **地面を歩く。** 間合いも押す力も**水平**で測る
 */

export { BULLET, FLIGHT, RUSH, TURN } from "./boss-flight.js";

/** 見た目の切り替えに使う値。**実体の `pve_v3:act` と揃える** */
export type BossAct =
  | "charge"
  | "bite"
  | "spin"
  | "fireball"
  | "strafe_l"
  | "strafe_r"
  | "takeoff"
  | "land"
  /** **隙。** 潰れて肩で息をする（6-5） */
  | "recover";

/** 攻撃の種類。**冷めの鍵** */
export type ActId = "rush_bite" | "spin" | "fireball" | "fireball_air" | "strafe" | "dash";

/** いまどこに居るか */
export type Phase = "ground" | "takeoff" | "air" | "land";

export interface ActDef {
  readonly id: ActId;
  readonly name: string;
  /** 見た目（溜めから本体まで） */
  readonly act: BossAct;
  /** 使える間合い（マス・**水平**） */
  readonly min: number;
  readonly max: number;
  /** **溜め**（tick）。この間は動かず、当たらない */
  readonly windup: number;
  /** 本体の長さ（tick） */
  readonly length: number;
  /** **当たる瞬間**（本体が始まってからの tick） */
  readonly hitAt: readonly number[];
  readonly damage: number;
  /** 届く距離（マス） */
  readonly reach: number;
  /** **弾き飛ばす強さ。** 0 なら弾かない */
  readonly knock: number;
  /** **前方の角度**（度）。180 なら全周 */
  readonly arc: number;
  /** 次に使えるまで（tick） */
  readonly cool: number;
  /** **空中の技か** */
  readonly air: boolean;
  /**
   * **抽選する技。** 使える間合いでも、この確からしさでしか出さない。
   *
   * > 出せるときに必ず出すと、**同じ間合いで同じ技しか見ない。**
   */
  readonly chance?: number;
  /** **突進**（押し出す） */
  readonly rush?: {
    /** まっすぐ突っ込む ／ 脇を抜ける */
    readonly kind: "line" | "strafe";
    /** 本体開始から何 tick 押すか */
    readonly until: number;
    /** 押す強さ（1 tick あたりのマス） */
    readonly power: number;
    /** 走っている間に触れた人へのダメージ */
    readonly touch: number;
    /** 走っている間に触れた人を弾く強さ */
    readonly knock: number;
    /** 触れたと見なす距離 */
    readonly touchReach: number;
  };
  /** 途中で見た目を差し替える（突進 → 噛みつき） */
  readonly finish?: { readonly act: BossAct; readonly at: number };
  /** **弾を吐く**（本体開始からの tick） */
  readonly shoot?: number;
}

/** **値は仮**（2026-09-05）。**攻撃の速さは 1/2 に落としてある** */
export const ACTS: readonly ActDef[] = [
  // ---- 地上
  {
    id: "spin",
    name: "回転攻撃",
    act: "spin",
    /**
     * **密着しているときだけ。**
     *
     * > 全周を薙ぐ技なので、**離れて出すと当たらないのに隙だけ晒す。**
     * > **張り付かれたときの追い払い**として置く。
     */
    min: 0,
    max: 4,
    chance: 0.5,
    windup: 14,
    length: 34,
    /** **半回転 2 回。** 1 回の掃きにつき 1 度当たる */
    hitAt: [11, 27],
    damage: 60,
    reach: 10,
    knock: 1.7,
    arc: 180,
    cool: 100,
    air: false,
  },
  {
    id: "rush_bite",
    name: "突進からの噛みつき",
    act: "charge",
    min: 4,
    max: 20,
    windup: 16,
    length: 44,
    hitAt: [26],
    damage: 110,
    reach: 6,
    knock: 1.5,
    arc: 100,
    cool: 90,
    air: false,
    rush: { kind: "line", until: 20, power: 1.05, touch: 55, touchReach: 4.5, knock: 1.2 },
    finish: { act: "bite", at: 20 },
  },
  {
    id: "fireball",
    name: "火の玉",
    act: "fireball",
    min: 7,
    max: 34,
    windup: 22,
    length: 18,
    hitAt: [],
    damage: 45,
    reach: 34,
    knock: 0.9,
    arc: 180,
    cool: 120,
    air: false,
    shoot: 2,
  },
  {
    id: "dash",
    name: "踏み込み",
    act: "charge",
    /**
     * **寄るための突進。**
     *
     * > ### この竜は歩いて寄らない（6-2-0）
     * >
     * > **距離を詰めたいときは、突進するか、飛ぶ。**
     * > だらだら歩かないぶん、**動くときは必ず溜めが見える。**
     */
    min: 6,
    max: 40,
    windup: 10,
    length: 26,
    hitAt: [],
    damage: 0,
    reach: 0,
    knock: 0,
    arc: 180,
    cool: 30,
    air: false,
    rush: { kind: "line", until: 22, power: 1.15, touch: 30, touchReach: 4.0, knock: 1.0 },
  },
  // ---- 空中
  {
    id: "fireball_air",
    name: "火の玉（空）",
    act: "fireball",
    /**
     * **横殴りより先に選ばれる間合いにする。**
     *
     * > ### 近い攻撃を優先する仕組みが裏目に出ていた
     * >
     * > 横殴りは**着地で終わる**。これが先に選ばれ続けると、
     * > **飛んでも 1 回突っ込んで降りるだけ**になり、火の玉が出ない。
     */
    min: 10,
    max: 28,
    windup: 20,
    length: 18,
    hitAt: [],
    damage: 45,
    reach: 30,
    knock: 0.9,
    arc: 180,
    cool: 100,
    air: true,
    shoot: 2,
  },
  {
    id: "strafe",
    name: "急降下からの横殴り",
    act: "strafe_l",
    min: 14,
    max: 36,
    windup: 16,
    length: 28,
    hitAt: [],
    damage: 100,
    reach: 4.5,
    knock: 2.0,
    arc: 180,
    cool: 110,
    air: true,
    rush: { kind: "strafe", until: 26, power: 1.3, touch: 100, touchReach: 4.5, knock: 2.0 },
  },
];

/**
 * その間合いで使える攻撃を選ぶ。
 *
 * **近い攻撃を優先**——目の前に居るのに火の玉を吐くと間が抜ける。
 */
export function pickAct(distance: number, air: boolean, ready: (id: ActId) => boolean): ActDef | undefined {
  const usable = ACTS.filter((a) => a.air === air && distance >= a.min && distance <= a.max && ready(a.id));
  usable.sort((a, b) => a.max - b.max);
  for (const a of usable) {
    // **抽選する技は、外れたら次の技へ回す**
    if (a.chance !== undefined && Math.random() >= a.chance) continue;
    return a;
  }
  return undefined;
}

/** その相手が、攻撃の当たる範囲に居るか */
export function inRange(def: ActDef, distance: number, angle: number): boolean {
  if (distance > def.reach) return false;
  return Math.abs(angle) <= def.arc;
}
