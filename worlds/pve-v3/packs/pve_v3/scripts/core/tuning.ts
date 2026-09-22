/**
 * **共通部品の調整つまみ。**
 *
 * 仕様は `docs/spec/25-enemy-kit.md`。
 *
 * ## なぜ 1 箇所に集めるのか
 *
 * > ### **同じ仕組みを、敵ごとに書かせない**
 * >
 * > **爆発を使う敵は 5 体ある。** **別々に書けば、5 種類の爆発ができる。**
 * > **仕組みは 1 つ、値は敵ごと**——**その「1 つ」の既定値がここ。**
 *
 * **敵ごとに違う値は `EnemyDef` に書く。** **ここは「書かなかったとき」の値。**
 * **触るのはここだけでよい**ようにしてある。
 */

/** 爆発（`services/boom.ts`） */
export const BOOM = {
  /** 届く半径（マス）。**中心が最大、縁で 0** */
  radius: 4,
  /** 押す強さの上限。**その敵が `knockback` を持っていればそちら** */
  knock: 3.0,
  /** 上へ飛ばす強さ。**爆発だけの例外**（`22-feedback.md` 6-2） */
  up: 0.55,
  /** 見た目の粒 */
  particle: "minecraft:large_explosion",
  /**
   * **この半径から、真ん中を大きい爆発にする**（2026-09-09）。
   *
   * **`minecraft:huge_explosion_emitter` は 50 粒を広く撒く**——
   * **半径 2 の爆発に使うと、見た目だけ倍ほど広く見えた**（ボマー）。
   * **小さい爆発は、粒 1 つの `large_explosion` で足りる。**
   */
  hugeFrom: 3.5,
  /** 音 */
  sound: "random.explode",
} as const;

/**
 * **落雷**（帯電の死に際。`services/fx.ts` の `boltFx`）。
 *
 * **絵は pve-v2 から借りた**（`25-enemy-kit.md` 10-1）。
 */
export const BOLT = {
  /** 絵の通り数。**1 本ごとに引く**——**同じ形が続くと「絵」に見える** */
  kinds: 5,
  /** 絵の高さ（マス）。**真ん中で位置が決まるので、半分だけ持ち上げる** */
  height: 8.0,
  /** 1 回で落とす本数 */
  times: 5,
  /** **範囲のどこまで落とすか**（半径に対する割合）。**縁まで落とすと外に見える** */
  spread: 0.85,
  /** 範囲を示す円 */
  circle: "pve_v3:bolt_circle",
} as const;

/** **湧いたときの声**（`EnemyDef.call`・`25-enemy-kit.md` 8-A） */
export const CALL = {
  /** 届く範囲（マス）。**遠くの人にも聞こえる**（2026-09-10 に 64 から伸ばした） */
  range: 200,
  /**
   * > ### **音量で「聞こえる距離」が決まる**（bedrock-wiki）
   * >
   * > **聞こえる範囲 ＝ `min(max_distance, max(volume × 16, 16))`。**
   * > **音量 1.0 では 16 マスまでしか鳴っていなかった**——**範囲内の人に鳴らしても、届かない。**
   *
   * **13.0 ＝ 208 マス**（登録側の `max_distance` は 256）。**大きさ自体は 1.0 で頭打ち。**
   */
  volume: 13.0,
} as const;

/** 地面に残る円（`services/zone.ts`） */
export const ZONE = {
  /** 半径（マス） */
  radius: 3,
  /** 続く長さ（tick）。**5 秒** */
  life: 100,
  /** 削る間隔（tick） */
  gap: 2,
  /** 1 回で削る割合（最大 HP に対する %） */
  cut: 1,
  /**
   * 見た目の粒。**劇薬の毒だまりと同じ絵**（中まで塗りつぶした緑の円）。
   *
   * **こちらは「続く長さ」を渡せる**（`v.life`）——
   * **1 枚を最後まで残す。** **敷き直すとちらつく**（2026-09-10）。
   */
  particle: "pve_v3:zone_circle",
  /** **円の中から立ちのぼる毒の霧**（2026-09-10） */
  mist: "pve_v3:zone_mist",
  /** **霧を出す長さ**（tick）。**円は 5 秒残るが、霧は最初の 3 秒だけ** */
  mistFor: 60,
} as const;

/** 周りへ効く力（`services/aura.ts`。恵み・鼓舞） */
export const AURA = {
  /** 届く半径（マス） */
  radius: 5,
  /** 効き目を配る間隔（tick） */
  gap: 4,
  /** プレイヤーからどれだけ離れていたいか（マス） */
  keepAway: 10,
  /** 逃げる速さの倍率 */
  fleeSpeed: 1.0,
} as const;

/** 状態異常（`services/ailment.ts`） */
export const AILMENT = {
  /** 鈍足の強さ（`amplifier`） */
  slowAmp: 1,
  /** 鈍足の長さ（tick） */
  slowTicks: 40,
  /** 毒で削る割合（最大 HP に対する %・合計） */
  poisonPct: 20,
  /** 毒の長さ（tick）。**5 秒**（2026-09-09 に 10 秒から縮めた——**長すぎた**） */
  poisonTicks: 100,
  /** 毒を刻む間隔（tick）。**1 秒に 1 回**（2026-09-09。前は 0.5 秒） */
  poisonGap: 20,
} as const;

/** 薙ぎ払い（`services/sweep.ts`。回転・妖狐・散弾） */
export const SWEEP = {
  /** 届く半径（マス） */
  radius: 4,
  /** 広がり（度）。**360 なら全周** */
  angle: 360,
  /** 見た目の粒 */
  particle: "minecraft:critical_hit_emitter",
  /** 粒を置く数 */
  marks: 16,
} as const;

/** 即着の線（`services/beam.ts`。カウボーイ・チェンバー） */
export const BEAM = {
  /** 届く距離（マス） */
  range: 20,
  /** 当たりの太さ（マス） */
  fat: 0.6,
  /** 貫通するか */
  pierce: false,
  /**
   * 見た目の粒。**銃弾の曳光**（2026-09-09 に矢の粒から変えた）。
   *
   * **矢と同じ粒では、銃に見えない**と言われた（カウボーイ）。
   * **小さく強い光の点を詰めて置く**——**芯が白く、すぐ赤くなって消える。**
   *
   * > ### **横に伸びた筋は駄目だった**（2026-09-09）
   * >
   * > **画面に向けて置くので、どの向きに撃っても筋が横倒しになる。**
   * > **点にして、間隔（`gap`）を詰めて線に見せるほうが素直。**
   */
  particle: "pve_v3:tracer",
  /** 粒を置く間隔（マス）。**詰めないと点が並んでいるように見える** */
  gap: 0.35,
  /**
   * **線が端まで走る長さ**（秒）。**粒ごとに `v.delay` を渡す**（`25-enemy-kit.md` 8-2-1）。
   *
   * **当たりはその場で決まっている**——**走るのは見た目だけ。**
   */
  travel: 0.12,
  /** **銃声**（`beam.loud` を書いた敵だけ・`25-enemy-kit.md` 8-2-2） */
  report: {
    sound: "random.explode",
    /** **低くすると鈍く重い**（1.0 が素の高さ） */
    pitch: 0.6,
    /**
     * > ### **音量で「聞こえる距離」が決まる**（bedrock-wiki・2026-09-10）
     * >
     * > **聞こえる範囲 ＝ `min(max_distance, max(volume × 16, 16))`。**
     * > **`random.explode` は `max_distance` を持たない**（legacy）ので、**`volume × 16` がそのまま届く距離。**
     * > **1.6 では 25.6 マスしか届いていなかった**——**50 マス圏内に届かせるには 3.2 以上要る。**
     *
     * **3.4 ＝ 54.4 マス**（50 マスに少し余裕を持たせた）。**大きさ自体は 1.0 で頭打ち。**
     */
    volume: 3.4,
    /** 届く範囲（マス）。**射程と同じ 50** */
    range: 50,
  },
} as const;

/** 山なりの投擲（`services/lob.ts`。投石ハスク・ボマー） */
export const LOB = {
  /** 届く距離（マス） */
  range: 7,
  /** 着弾までの長さ（tick） */
  flight: 10,
  /** 落ちる速さ（マス／tick²） */
  gravity: 0.03,
  /** 軌跡の粒 */
  trail: "pve_v3:foe_trail",
} as const;

/** 死に際（`services/onfall.ts`） */
export const FALL = {
  /** 落とした爆弾が爆ぜるまで（tick）。**2 秒** */
  fuse: 40,
  /** 予告の粒 */
  warn: "minecraft:villager_angry",
  /** 予告を置く間隔（tick） */
  warnGap: 4,
  /** **範囲の円を敷き直す間隔**（tick）。**粒の寿命 0.6 秒より短くする** */
  drawGap: 8,
  /** 分裂した子を、どれだけ散らすか（マス） */
  spread: 1.0,
} as const;

/** 跳ぶ（`services/blink.ts`。テレポート） */
export const BLINK = {
  /** 跳ぶ間隔（tick）。**10 秒** */
  gap: 200,
  /** 相手から何マス離れた所に出るか */
  back: 0.5,
} as const;
