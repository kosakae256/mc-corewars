/**
 * **共通部品の旗。** **`EnemyDef` が持つ「どう動くか」の宣言。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md`。
 *
 * > ### **敵を 1 体足すのは「1 行」だけにする**
 * >
 * > **旗を書けば、`features/mob/traits.ts` が部品へつなぐ。**
 * > **敵ごとにコードを書かない**——**同じ旗は、必ず同じ動きになる。**
 */

import type { ShotTraits } from "./trait-shot.js";

export interface EnemyTraits extends ShotTraits {
  /** **飛ぶ**（`25-enemy-kit.md` 11 章）。**書かなければ歩く** */
  readonly fly?: boolean;
  /**
   * **中立**（`25-enemy-kit.md` 12 章）。**殴られるまで襲ってこない。**
   *
   * **最初に殴ってきた人だけを追う。** **その人が倒れたら、また中立に戻る。**
   */
  readonly neutral?: boolean;
  /** **動かない**（追尾弾）。**書かなければ動く** */
  readonly still?: boolean;
  /**
   * **速度 1.0 のときの `minecraft:movement`。** **書かなければ `WALK`（0.2875）。**
   *
   * > ### **飛ぶ敵は物差しが違う**（実測・2026-09-08）
   * >
   * > **バニラのガストは 0.03**——**歩く敵の 1/10 未満。**
   * > **同じ物差しで 1.0 にすると、目で追えない速さになる。**
   * > **その種族の「ふつう」を 1.0 にする。**
   */
  readonly baseSpeed?: number;
  /**
   * **狙う人から見た高さの帯**（マス）。**飛ぶ敵だけ。**
   *
   * > ### **上に居続けると、弓でしか届かない**（2026-09-08）
   * >
   * > **バニラの `float_wander` は高さを選ばない。**
   * > **帯から出たら、script がそっと押し戻す**（`services/hover.ts`）。
   */
  readonly hover?: { readonly min: number; readonly max: number; readonly ground?: boolean };
  /**
   * **壁を抜ける**（ファントム）。**飛ぶ ＋ ぶつからない。**
   *
   * **ヴェックスと同じ手**（`physics.has_collision: false`）。
   */
  readonly ghost?: boolean;
  /**
   * **帯電させる**（帯電クリーパー）。
   *
   * > ### **同じ実体データで、別の性質**（2026-09-08 決定）
   * >
   * > **バニラのクリーパーは `minecraft:charged_creeper` の群を足すと帯電になる。**
   * > **湧いた瞬間に `pve_v3:charge` を鳴らす**（`services/spawn.ts`）。
   */
  readonly charged?: boolean;
  /**
   * **帯電したときの導火線の長さ**（tick）。**実体を分け合う敵のぶん。**
   *
   * **書かなければ `interval` と同じ。**
   */
  readonly chargedInterval?: number;

  /**
   * **湧かせる実体の名前。** **書かなければ `pve_v3:<id>`。**
   *
   * > ### **バニラそのものを置き換えた敵**（クリーパー・2026-09-08）
   * >
   * > **`query.swell_amount` はバニラのクリーパーでしか動かない**ので、
   * > **`minecraft:creeper` を上書きしてある**（`tools/pve3-newmob.mjs --replace`）。
   * > **クリーパーも帯電クリーパーも、湧かせるのは同じ `minecraft:creeper`**——
   * > **違うのは足す群と、`roster` の値だけ。**
   */
  readonly spawnId?: string;

  /**
   * **背の高いまま飛ぶ。** **書かなければ当たり判定を 1 マスに切る。**
   *
   * > ### **`navigation.hover` は小さい体を想定している**（`25-enemy-kit.md` 11 章）
   * >
   * > **バニラ**: ミツバチ 0.5 ／ アレイ 0.6 ／ オウム 1.0。
   * > **背が高いと 1 マスの段差に引っかかる**ので、既定では切る。
   * > **引っかからない敵だけ、これを書いて元の大きさを保つ。**
   */
  readonly tallFly?: boolean;

  /**
   * **バニラの見た目の種類**（`minecraft:variant`）。
   *
   * > ### **書かないと透明になる実体がある**（実測・2026-09-08）
   * >
   * > **スライムは `query.variant` で大きさを決める。**
   * > **部品が無いと倍率 0**——**エラーも出さずに消える。**
   * > **小 1 ／ 中 2 ／ 大 4。**
   */
  readonly variant?: number;
  /**
   * **撃つ前の溜め**（`minecraft:behavior.ranged_attack`）。**撃つ敵だけ。**
   *
   * **バニラの値をそのまま書く**——**段（呪い）で一緒に縮む**（`pve3-mobjson.mjs`）。
   */
  readonly charge?: {
    /** 一度溜め始めたら射程外へ出ても連射を完了する（spec/40）。 */
    readonly commit?: boolean;
    /** 溜め中もこの距離まで接近する。未指定なら溜め中は停止（spec/40）。 */
    readonly approach?: number;
    /** 発射前の溜め中にまとわせる短命のパーティクル（4tickごと）。 */
    readonly particle?: string;
    /** 溜め始めてから撃つまで（秒）。ガスト 2 ／ ブレイズ 4 */
    readonly shoot: number;
    /** 溜めが満ちたと見なす秒。ガスト 1 */
    readonly charged?: number;
    /** 連射の数。ブレイズ 3 */
    readonly burst?: number;
    /** 連射の間隔（秒）。ブレイズ 0.3 */
    readonly burstGap?: number;
  };
  /**
   * **殴りでは削らない**（`25-enemy-kit.md` 14 章）。**書かなければ殴る。**
   *
   * > ### **「寄る」と「削る」は別物**（実測・2026-09-08 に踏んだ）
   * >
   * > **一度は `melee_box_attack` ごと外した。** **すると寄る動きまで消えた**——
   * > **クリーパーは近づけず、導火線に火が付かない。**
   * > **ボマーも投げる間合いに入れない。**
   * >
   * > **`melee_box_attack` は「寄る」役でもある。** **残したまま、削るのを止める。**
   *
   * | | |
   * | --- | --- |
   * | **ビヘイビア** | `melee_box_attack` は**残す**（寄るため）。`minecraft:attack` の力を 0 に |
   * | **script** | `services/melee.ts` が**当たっても削らない** |
   *
   * **`kind: "boom"` は書かなくてもこの扱い**（クリーパーの攻撃は爆発だけ）。
   */
  readonly noMelee?: boolean;
  /**
   * **人を追わない**（`25-enemy-kit.md` 14 章）。**ずっとうろつく。**
   *
   * > ### **弾幕はプレイヤーを追わない**（`07-enemy-plan.md` ★5）
   * >
   * > **狙いを付ける部品も、殴られて狙う部品も外す。** **うろつくだけになる。**
   * > **弾は目標が無くても撒ける**（`orbit`）。
   */
  readonly roam?: boolean;
  /** **接触で爆ぜる**（クリーパー・帯電クリーパー）。`kind: "boom"` と対で書く */
  readonly boom?: {
    /** 届く半径（マス） */
    readonly radius?: number;
    /** 上へ飛ばす強さ */
    readonly up?: number;
    /** **膨らんだら止まらない**（帯電クリーパー）。**離れても爆発する** */
    readonly noStop?: boolean;
  };
  /** **死に際**（`services/onfall.ts`。爆弾・帯電・汚染・大スライム） */
  readonly fall?: {
    /** `bolt` は**青い円と落雷**（帯電・`25-enemy-kit.md` 10-1） */
    readonly boom?: { readonly radius?: number; readonly up?: number; readonly bolt?: boolean };
    readonly bomb?: { readonly radius?: number; readonly fuse?: number };
    readonly zone?: { readonly radius?: number; readonly life?: number; readonly cut?: number };
    readonly split?: { readonly into: string; readonly count: number };
  };
  /** **山なりに投げる**（`services/lob.ts`。投石ハスク・ボマー） */
  readonly lob?: {
    /** 飛距離（マス） */
    readonly range: number;
    /** 着弾までの長さ（tick） */
    readonly flight: number;
    /** **着弾で爆ぜる**（ボマー）。**書かなければ当たった人だけ** */
    readonly boomRadius?: number;
    /**
     * **着弾してから爆ぜるまで**（tick）。**書かなければその場で爆ぜる。**
     *
     * **書くと、落ちた所に爆弾が転がって、膨らみながら数える**——
     * **死に際に落とす爆弾と同じ仕組み**（`services/onfall.ts` の `putBomb`）。
     */
    readonly fuse?: number;
    /**
     * **山なりに投げる**（`kind: "shoot"` の敵だけ）。
     *
     * > ### **撃つ敵に、投げさせる**（2026-09-08）
     * >
     * > **バニラの `ranged_attack` は「間合いまで寄って、止まって撃つ」**——
     * > **スケルトンの動き。** **投石ハスクはこれが欲しい。**
     * > **弾だけ山なりにすれば、近接を持たずに石を投げる敵になる。**
     */
    readonly arc?: boolean;
    /**
     * **着弾した所に毒の霧を撒く**（劇薬）。**力ではなく毒で削る。**
     *
     * `pct` は**合計で削る割合**（最大 HP の %）、`radius` は霧の広さ。
     */
    readonly poison?: { readonly pct: number; readonly ticks: number; readonly radius: number };
    /**
     * **投げる前の溜め**（tick）。**書かなければ溜めない。**
     *
     * **腕を振り上げてから離す**——**見てから避ける手がかりになる。**
     */
    readonly windup?: number;
    /**
     * **落とす所のばらつき**（マス）。**書かなければ狙いどおり。**
     *
     * > ### **必ず当たると、避ける遊びが無い**（ボマー・2026-09-09）
     * >
     * > **狙った足元から、この半径の中へ散らす。**
     * > **外れた所にも爆弾が転がる**ので、**どこへ逃げるかを考えることになる。**
     */
    readonly scatter?: number;
    /** **連れて飛ぶ実体**（劇薬の瓶）。**書かなければ粒だけ** */
    readonly body?: string;
    /** **跡を出さない**（実体を飛ばすとき） */
    readonly noTrail?: boolean;
  };
  /** **即着の線**（`services/beam.ts`。カウボーイ・チェンバー） */
  readonly beam?: {
    readonly range: number;
    /** **貫通するか**（チェンバー） */
    readonly pierce?: boolean;
    /**
     * **弾速**（マス／tick）。**書かなければ即着**（撃った瞬間に当たる）。
     *
     * **書くと本物の弾が飛ぶ**（`services/bullet.ts`）——**見てから避けられる。**
     * **カウボーイは 4**（`07-enemy-plan.md` 6-3）。
     */
    readonly speed?: number;
    /**
     * **構えの長さ**（tick）。**書かなければ構えない**（`25-enemy-kit.md` 8-3）。
     *
     * **構え → 撃つ → 休む で、攻撃間隔ぶんの 1 周。**
     * **チェンバーは 20（1 秒）。**
     */
    readonly windup?: number;
    /**
     * **撃った瞬間、広い範囲に鈍い銃声**（`25-enemy-kit.md` 8-2-2）。
     *
     * **書かなければ鳴らない**——**連射する敵で鳴らすと煩い**（カウボーイ）。
     */
    readonly loud?: boolean;
    /** 敵専用の発砲音。省略時は共通の音（spec/35）。 */
    readonly report?: { readonly sound: string; readonly pitch: number };
  };
  /** **薙ぎ払い**（`services/sweep.ts`。回転・妖狐・散弾） */
  readonly sweep?: {
    readonly radius: number;
    /** 広がり（度）。**360 なら全周** */
    readonly angle: number;
    /** **同じ人に何回当たるか**（散弾は 50） */
    readonly hits?: number;
    /**
     * **遠くから撃つ**（散弾）。**書かなければ近接**（回転・妖狐）。
     *
     * > ### **近接と遠距離で、動かし方が違う**（実測・2026-09-08）
     * >
     * > **近接は `minecraft:behavior.delayed_attack`**——**間合いまで寄って振る。**
     * > **遠距離はそれでは撃てない**（殴る距離まで寄ってしまう）。
     * > **`standoff` で間合いを取り、script の時計で撃つ。**
     */
    readonly atRange?: boolean;
    /** 静止して追尾する溜め（tick）。呪いの攻撃間隔倍率で短縮（spec/34）。 */
    readonly windup?: number;
    /** 発射後の戻り動作（tick）。 */
    readonly recover?: number;
    /** 当たりとは独立した扇形の演出。 */
    readonly effect?: "foxfire";
    /** 命中後の炎上時間（秒）。指定した敵だけ燃やす。 */
    readonly igniteSeconds?: number;
  };
  /** **殴った相手に付く状態異常**（`services/ailment.ts`。冷気・劇薬） */
  readonly ailment?: {
    readonly slow?: { readonly amp: number; readonly ticks: number };
    /** **合計で削る割合**（最大 HP の %） */
    readonly poison?: { readonly pct: number; readonly ticks: number };
  };
  /** **周りの敵へ効く力**（`services/aura.ts`。恵み・鼓舞） */
  readonly aura?: {
    readonly radius?: number;
    /** **1 tick ごとに戻す割合**（最大 HP の %。恵み） */
    readonly healPct?: number;
    /** **攻撃力の倍率**（鼓舞） */
    readonly atkMult?: number;
    /** 倍率が続く長さ（tick） */
    readonly atkTicks?: number;
    /** **プレイヤーからどれだけ離れていたいか**（マス） */
    readonly keepAway?: number;
  };
}
