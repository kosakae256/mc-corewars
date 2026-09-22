/**
 * **弾の見た目と、当たり方の細かい旗。**
 *
 * **`core/trait.ts` から切り出した**（2026-09-09）——**1 ファイル 300 行の上限に収めるため。**
 * **中身は変えていない。**
 */

export interface ShotTraits {
  /**
   * **これより近づかない**（マス）。**投げる敵・撃つ敵が間合いを取る。**
   *
   * > ### **投げる敵が殴りに来ていた**（実測・2026-09-08）
   * >
   * > **`melee_box_attack` は「寄る」役でもある**ので、**投げる敵も顔まで寄ってくる。**
   * > **バニラの経路探索に「下がる」動きは無い**（`attack_radius_min` は撃たなくなるだけ）。
   * > **近すぎるときだけ、こちらで押し返す。**
   */
  readonly standoff?: number;
  /**
   * **壁を無視する**（追尾弾だけ・`25-enemy-kit.md` 6-1）。
   *
   * > ### **遠距離の共通判断の、唯一の例外**（`38-ranged-ai-and-cover.md`）
   * >
   * > **ほかの敵は「射線が無ければ近づく」。**
   * > **追尾弾は動けない**ので、それだと壁の裏に入られた瞬間に無力になる。
   *
   * | | |
   * | --- | --- |
   * | **撃つとき** | **射線を見ない** |
   * | **弾と壁** | **当たっても消えない。** **手前で向きを変えて迂回する** |
   */
  readonly throughWall?: boolean;
  /**
   * **弾の寿命**（tick）。**書くと、距離では消えない**（`25-enemy-kit.md` 6-1-1）。
   *
   * **追尾弾は 400（20 秒）**——**当たるか、時間が切れるまで追ってくる。**
   */
  readonly shotLife?: number;
  /**
   * **狙う相手を 1 人だけ決める**（`25-enemy-kit.md` 6-1-2）。**選ぶ範囲（マス）。**
   *
   * **撃った瞬間にランダムで 1 人選び、その人だけを追う**——
   * **書かなければ、毎 tick いちばん近い人へ寄せる。**
   */
  readonly lockOn?: number;
  /** **追ってくる弾**（追尾弾）。**曲がる強さ 0〜1** */
  readonly homing?: number;
  /**
   * **弾の軌跡の粒**（`24-mob-howto.md` 10-4）。**書かなければ赤い矢の粒。**
   *
   * **弓の弾と見分けが付かない敵は、ここを変える**（ガストの火の玉など）。
   */
  readonly trail?: string;
  /**
   * **弾に連れて歩く見た目の実体**（`24-mob-howto.md` 10-4）。
   *
   * **バニラの火の弾のような「玉」を飛ばしたいときに書く**（`pve_v3:fireball`）。
   * **書かなければ粒だけ。**
   */
  readonly body?: string;
  /**
   * **跡を出さない**（`25-enemy-kit.md` 3-2）。
   *
   * **遅く飛ぶ物を投げる敵に書く**（投石ハスクの石）——**跡が残ると「物」に見えない。**
   * **`body` と組で使う。**
   */
  readonly noTrail?: boolean;
  /**
   * **狙いの散らばり**（およその度数）。**書かなければ既定**（約 1.7 度）。
   */
  readonly spread?: number;
  /**
   * **弾の当たりの太さ**（マス）。**書かなければ既定**（0.45）。
   *
   * **大きい玉は、見た目に合わせて当たりも太くする。**
   */
  readonly shotFat?: number;
  /**
   * **前方へまとめて撃つ弾**（散弾・`25-enemy-kit.md` 7-2）。
   *
   * > ### **実体のある弾を、本当に飛ばす**（2026-09-09 に作り直した）
   * >
   * > **前は「その場で当たりを決めて、見た目だけ出す」だった**——**避ける手が無い。**
   * > **20 発なら飛ばしても重くない。**
   */
  readonly buck?: {
    /** 発数 */
    readonly count: number;
    /** 広がり（度）。**この角の中へ散らす** */
    readonly spread: number;
    /** 弾速（マス／tick） */
    readonly speed: number;
    /** 届く距離（マス） */
    readonly range: number;
    /** 連れて飛ぶ実体。**書かなければ粒だけ** */
    readonly body?: string;
    /** 当たりの太さ（マス） */
    readonly fat?: number;
  };
  /** **周りへまとめて撒く弾**（弾幕・`25-enemy-kit.md` 6-1） */
  readonly orbit?: {
    /** 何発か */
    readonly count: number;
    readonly speed: number;
    readonly range: number;
    /**
     * **連れて飛ぶ実体**（`pve_v3:orb`）。**書かなければ粒だけ。**
     *
     * **玉が飛んでくるのが見えないと避けられない**——**実体を飛ばし、跡は出さない。**
     */
    readonly body?: string;
    /** 実体を生成しない丸弾パーティクル（spec/36）。 */
    readonly sprite?: string;
    /** 当たりの太さ（マス）。**書かなければ既定**（0.45） */
    readonly fat?: number;
  };
  /** **割合ダメージ**（急所）。**最大 HP の %** */
  readonly ratio?: number;
  /** **たまに大きく当たる**（痛恨の一撃） */
  readonly crit?: {
    /** 出る確率（0〜1） */
    readonly chance: number;
    /** 何倍か */
    readonly mult: number;
    /** **出たときの押す強さ**（普段は `knockback`） */
    readonly knock: number;
    /**
     * **出たときだけ上へ飛ばす強さ**（2026-09-08 決定）。
     *
     * > **浮かせるのは爆発だけ**という決まりの例外
     * > （[22-feedback.md](../../../../docs/spec/22-feedback.md) 6-2）。
     * > **20 倍の一撃だけは、当たったと分かるように浮かせる。**
     */
    readonly up?: number;
  };
  /** **跳ぶ**（テレポート）。**跳ぶ間隔（tick）** */
  readonly blink?: number;
}
