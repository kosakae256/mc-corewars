/**
 * 札ごとのエフェクト。**どの札が、どの粒を出すか。**
 *
 * 仕様は `docs/spec/13-feedback.md` 4 章、粒は `tools/pve2-fx.py`。
 *
 * ## 割り当ては 1 か所
 *
 * **札の中身（`features/enchant/onhit.ts` ほか）は `fx("powder", …)` と呼ぶだけ。**
 * **見た目を変えたくなったら、この表だけ直す。**
 *
 * | 属性 | 顔 |
 * | --- | --- |
 * | **火** | ふくらんで消える塊（橙 → 赤） |
 * | **雷** | 細い光が散る（黄 → 白） |
 * | **氷** | 六角の粒がゆっくり落ちる（水色 → 白） |
 * | **水** | 柔らかい光が昇る（青緑） |
 * | **風** | 横へ流れる筋（薄緑） |
 *
 * ## 音の鳴らし方（2026-08-31 決定）
 *
 * | 何 | どう鳴るか |
 * | --- | --- |
 * | **通常ヒット・クリティカル** | **殴った本人にだけ**（距離に関係なく手元で鳴る） |
 * | **札のエフェクト** | **5 マス以内に居る人にだけ**（その位置から） |
 *
 * > ### 音量では距離を切れない（2026-08-31 に確かめた）
 * >
 * > `WorldSoundOptions.volume` は「相対的な音量と広がり」だが、
 * > **バニラの音自体が持つ到達距離**（`sound_definitions.json` の設定）に引きずられ、
 * > **音量を下げても遠くまで届く音がある**（延焼の `random.fizz` がそうだった）。
 * >
 * > **近くに居る人にだけ配る**——`dim.getPlayers({ maxDistance })` で絞り、
 * > **その人に位置つきで鳴らす。** 範囲の外には一切届かない。
 */

import type { Dimension, Vector3 } from "@minecraft/server";

interface FxDef {
  /** **重ねてよい**——閃光と筋を同時に出すなど（クリティカル） */
  readonly particle: readonly string[];
  /** **この中から 1 つだけ**選んで出す（クリティカルの筋の色） */
  readonly pick?: readonly string[];
  /** 出す高さ（足元から） */
  readonly y: number;
  readonly sound?: string;
  readonly pitch?: number;
  /** **届く距離**。0.3 でおよそ 5 マス */
  readonly volume?: number;
  /**
   * **同じ粒を、ばらまいて何個も出す**（爆発の煙・炎）。
   *
   * 1 粒ずつが小さいものは、**数と置き場所で塊を作る**ほうが形になる。
   */
  readonly scatter?: {
    readonly id: string;
    readonly count: number;
    /** 横に散らす幅（マス。±この値） */
    readonly spread: number;
    /** 縦に散らす幅（マス。0〜この値） */
    readonly lift: number;
  };
}

/** 燃えている印に使う粒（**バニラの炎**）と、散らし方 */
const BURN_FLAME = "pve_v3:burn_flame";
const BURN_SPREAD = 0.45;
const BURN_COUNT = 3;

/**
 * **属性値でエフェクトの量が決まる**（`docs/spec/13-feedback.md` 4-2）。
 *
 * | 属性値 | 段 | 出る量 |
 * | --- | --- | --- |
 * | 0〜4 | 0 | **出ない** |
 * | 5〜9 | 1 | 25％ |
 * | 10〜14 | 2 | 50％ |
 * | 15〜19 | 3 | 75％ |
 * | 20 | 4 | 100％ |
 *
 * **粒の数は JSON に固定で書く**ので、割合では変えられない——
 * **1 回ぶんを 25％で作っておき、段のぶんだけ繰り返し出す。**
 */
export function tier(value: number): number {
  if (value < 5) return 0;
  return Math.min(4, Math.floor(value / 5));
}

/** 札の音が届く距離（マス）。**これより遠い人には鳴らさない** */
const FX_RANGE = 5;

/** 札の音の大きさ */
const NEAR = 0.5;

function p(particle: string | readonly string[], y = 1, sound?: string, pitch = 1, volume = NEAR): FxDef {
  const list = typeof particle === "string" ? [particle] : particle;
  // **`:` を含む名前はそのまま**——バニラの粒（`minecraft:…`）を混ぜられる
  return { particle: list.map((n) => (n.includes(":") ? n : `pve_v3:${n}`)), y, sound, pitch, volume };
}

/** 抽選つき。**`pick` からは 1 つだけ出る** */
function pickOne(base: readonly string[], pick: readonly string[], y = 1): FxDef {
  return {
    particle: base.map((n) => `pve_v3:${n}`),
    pick: pick.map((n) => `pve_v3:${n}`),
    y,
  };
}

/** 札 id → 見た目。**無いものは `proc` で出る** */
const FX: Record<string, FxDef> = {
  // ---------------------------------------------------------------- 火
  /**
   * 火薬矢。**火花が散る。**
   *
   * ```
   * 尾を引く火花 44（一点から弾けて、垂れて消える）
   *   ＋ 芯の光（0.12 秒）
   *   ＋ 内側の細かい火花 22（弾けた瞬間の密度）
   *   ＋ 輪 1（どこまで届いたかを示す。薄い）
   * ```
   *
   * 絵（`pve3_flick`）から新しく描いた——**頭が明るく、後ろへ細く伸びる。**
   * **飛ぶ向きに寝かせて**あるので、尾が進行方向へ伸びる。
   * **重力で垂れる**ので、線香花火のように散って落ちる。
   *
   * **跡は残さない**（2026-08-31）——**残り火・煤のように後まで漂うものは入れない。**
   * **一瞬で終わるほうが強く見える。**
   */
  powder: p(["powder_spark", "powder_seed", "powder_flash", "powder_wave"], 1, "random.explode", 1.5),

  /**
   * 業火の一矢。**地面を火の輪が走る。**
   *
   * ```
   * 敵が燃え上がる（炎 240 が地面から吹き上がる）
   *   ＋ 火の輪 360 が中心から外へ走る（3 マスで止まる ＝ 延焼が移る範囲）
   *   ＋ 通ったあとに残る炎 56
   * ```
   *
   * **輪は「どこまで燃え移ったか」、体の炎は「誰が焼かれたか」**を見せる。
   *
   * > ### 火柱はやめた（2026-08-31 決定）
   * >
   * > Bedrock の粒は**カメラを向く板**なので、**縦に長いものほど破綻する**——
   * > 板 1 枚でも、粒を積んでも「絵が立っている」ようにしか見えなかった。
   * > **地面に沿う表現なら、角度で崩れようがない。**
   * > おまけに**どこまで燃え移ったかが、輪の届いた先で分かる。**
   */
  inferno: {
    particle: ["pve_v3:inferno_body", "pve_v3:inferno_ring"],
    y: 0.1,
    sound: "mob.blaze.shoot",
    pitch: 0.8,
    volume: NEAR,
    scatter: { id: "pve_v3:burn_flame", count: 56, spread: 2.2, lift: 0.5 },
  },

  ember: p("ember_tick", 1),
  // ---------------------------------------------------------------- 雷
  /**
   * 落雷。**絵は v1 のものを使う**（`strikeFx`）。ここでは**音だけ**鳴らす。
   */
  strike: p([], 1.4, "ambient.weather.lightning.impact", 1.7),
  /**
   * 帯電。**地面に敷き詰める電気は `chargeGround`**。ここでは**音だけ**鳴らす。
   */
  charge: p([], 1.2, "ambient.weather.thunder", 1.3),
  /**
   * 放電。**流れた道と、流れた先だけを見せる。**
   *
   * **地面の稲妻は出さない**（2026-08-31）——**当てた場所が光るだけで、伝播が伝わらない。**
   * 見せるべきは**どこへ流れたか**：`zapLine`（結ぶ線）と `zapBody`（弾ける電気）。
   * どちらも `features/enchant/onhit.ts` から呼ぶ（誰へ流れたかを知っているのはあそこだけ）。
   */
  static: p([], 1, "random.fizz", 2),

  followup: p("spark_fast", 1, "random.orb", 1.9),
  boltspeed: p("spark_fast", 1.6),
  thundercloud: p("arc", 1.2, "ambient.weather.thunder", 1.6),
  thundertail: p("arc"),
  thunderflame: p("fire_burst", 1.2, "ambient.weather.lightning.impact", 1.2),
  storm: p("bolt", 0.4, "ambient.weather.thunder", 0.9),

  // ---------------------------------------------------------------- 氷
  /**
   * 霜纏い。**自分の体に霜を纏い続ける。**
   *
   * **敵ではなく自分に出す**（2026-08-31 決定）——
   * **「近づくだけで凍らせる」札**なので、**凍らせているのは自分の周り**。
   *
   * > ### 視界を塞がない
   * >
   * > 自分の周りに出るものは、**多いと画面が埋まる。**
   * > **1 回 2 個・薄く・体から 0.95 マス離す**。**音は付けない**（出続けるので）。
   */
  frost: p("frost_aura", 0),
  frosttrail: p("frost"),
  /** 氷片。**霜の粒が散る**（破片が飛ぶのは砕氷の役） */
  shard: p("shard_frost", 1, "random.glass", 1.9),
  shatter: p("shatter", 1, "random.glass", 1.5),
  /**
   * 絶対零度。**見た目は出さない**（2026-08-31 決定）。
   *
   * **霜纏いと役目が被った**——纏うのはあちら。
   * 効いているかは、**特殊攻撃の数字が跳ねる**ことで分かる。
   */
  absolute: p([], 0),

  blizzard: p("frost", 1, "step.snow", 1.2),

  // ---------------------------------------------------------------- 水
  /**
   * 恵みの雨。**地面に水色の円が描かれ、その中の味方が回復する。**
   *
   * ```
   * 半径 1.5 の円を地面に敷く ＋ 円の中から昇る光
   * ```
   *
   * > ### 雨は降らせない（2026-08-31 決定）
   * >
   * > 名前は「雨」だが、**回復はその場で 1 回きり**。
   * > **降らせると「これから続く」ように見える**——**円のほうが、範囲も 1 回性も伝わる。**
   *
   * **円は外縁がはっきり、中は薄い**——**回復する範囲そのもの**
   *（`features/bow/shoot.ts` の `RAIN_RADIUS`）。円は `healCircle` が地面に置く。
   */
  rain: p("rain_up", 0.2, "random.levelup", 1.9),

  raintail: p("heal"),
  regen: p("heal", 0.6),
  leech: p("drop", 1.2, "random.drink", 1.7),
  mirror: p("guard", 1.1, "random.anvil_land", 1.9),
  dew: p("guard", 1.1),
  still: p("drop", 1.1, "random.orb", 1.2),

  /**
   * 凪。**発動中に当てると、敵から水しぶきが上がる。**
   *
   * **バニラの水しぶきの絵**を借りて、粒はこちらで組む（`tools/pve2-fx.py`）——
   * 自分で描いた雫は**氷の破片に見え**、バニラの粒は**そのまま呼ぶと見えなかった**（2026-08-31）。
   */
  calm: p("calm_splash", 0),
  steam: p("drop", 1, "random.fizz", 1),

  // ---------------------------------------------------------------- 風
  /**
   * 烈風。**羽が舞う ＋ 風の音。**
   *
   * **効果が続いている間の掛け直しでは出さない**（`features/enchant/onhit.ts`）——
   * 倒すたびに鳴ると、連続で倒したときに**音と羽が途切れなくなる。**
   */
  gust: p(["gust", "gust_feather"], 0.6, "mob.enderdragon.flap", 1.7),

  /** 疾走射。**走りながら当てたとき、敵に葉が散る** */
  dash: p("dash_leaf", 1),
  windtail: p("gust", 0.6),

  // ---------------------------------------------------------------- 弓・共通
  burst: p("fire_burst", 1, "random.explode", 1.9),
  chain: p("arc", 1, "random.orb", 1.4),
  bounce: p("bounce_spark", 0, "random.bowhit", 1.5),
  allshot: p("fire_big", 1.2, "random.levelup", 0.9),

  /**
   * クリティカル。**当たった所で光の筋が 1 本走る。**
   *
   * ```
   * 火花（**通常ヒットとまったく同じもの**）
   *   ＋ 光の筋 1 本（赤・青・桃・橙から抽選・0.15〜0.25 秒）
   * ```
   *
   * **筋は 1 ヒットにつき 1 本だけ。** 向きも色も毎回変わる
   *（`worlds/pve-v3/user/show.jpg`）——束で出すと爆発に見える。
   * **火花は出さない。**
   *
   * > ### 白い閃光（`crit_core`）は外した（2026-08-31）
   * >
   * > **あたり一面が光ってしまい、筋が埋もれた。**
   * > **代わりに通常ヒットと同じ火花**（`hit_burst`）を置いた。
   * > **クリかどうかは、色つきの筋が走るかどうかで分かる。**
   * > 閃光の定義は残してある（`tools/pve2-fx.py`）——使いたくなったら戻せる。
   */
  crit: pickOne(["hit_burst"], ["crit_ray_red", "crit_ray_blue", "crit_ray_pink", "crit_ray_orange"], 1.2),

  /**
   * 止まった的で出たクリティカル。**筋が必ず青くなる。**
   *
   * **氷で止めた敵に刺さった**ことが、色だけで分かる——
   * 抽選（赤・青・桃・橙）をやめて、**青に固定**する（2026-08-31 決定）。
   */
  crit_ice: p(["hit_burst", "crit_ray_blue"], 1.2),

  /**
   * 通常ヒット。**当たった点で火花が弾ける。**
   *
   * **粒を撒くのではなく、1 枚の絵をコマ送りで動かす**（`pve3_hit_burst`・8 コマ）——
   * **点の集まりでは火花に見えなかった**（2026-08-31）。
   * 向きは 1 発ごとに回り、大きさは 1.0〜1.4 倍に振れる。
   */
  hit: p("hit_burst"),

  /** どれでもない合図。**新しい札を足したとき、割り当てるまでの間に合わせ** */
  proc: p("proc"),
};

/**
 * 音を**近くの人にだけ**鳴らす。
 *
 * **その場から鳴らす（`dim.playSound`）と、遠くまで届いてしまう。**
 * **人を絞ってから、位置つきで鳴らす**——範囲の外には一切聞こえない。
 */
function playNear(dim: Dimension, at: Vector3, def: FxDef): void {
  const id = def.sound;
  if (id === undefined) return;
  try {
    for (const player of dim.getPlayers({ location: at, maxDistance: FX_RANGE })) {
      player.playSound(id, { location: at, pitch: def.pitch, volume: def.volume ?? NEAR });
    }
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 出す。**id が無ければ `proc`。**
 *
 * **例外は投げない**——見た目のために処理が止まってはいけない。
 *
 * @param exact 渡された点をそのまま使う（当たった場所が分かっているとき）
 * @param times **何回ぶん出すか**（`tier()` の段）。**0 なら何も出さない**。
 *   粒の数は 25％ぶんで作ってあるので、4 で作り込んだ量になる（`docs/spec/13-feedback.md` 4-2）
 */
export function fx(id: string, dim: Dimension, at: Vector3, exact = false, times = 1): void {
  if (times <= 0) return;
  const def = FX[id] ?? FX["proc"];
  if (def === undefined) return;
  const where = exact ? { x: at.x, y: at.y, z: at.z } : { x: at.x, y: at.y + def.y, z: at.z };
  try {
    for (let t = 0; t < times; t++) {
      for (const name of def.particle) dim.spawnParticle(name, where);
    }
    const sc = def.scatter;
    if (sc !== undefined) {
      // **撒く数も段のぶんだけ**（1 段で 1/4）
      const n = Math.round((sc.count * times) / 4);
      for (let i = 0; i < n; i++) {
        dim.spawnParticle(sc.id, {
          x: where.x + (Math.random() - 0.5) * sc.spread * 2,
          y: where.y + Math.random() * sc.lift,
          z: where.z + (Math.random() - 0.5) * sc.spread * 2,
        });
      }
    }
    playNear(dim, where, def);
    const pick = def.pick;
    if (pick !== undefined && pick.length > 0) {
      const one = pick[Math.floor(Math.random() * pick.length)];
      if (one !== undefined) dim.spawnParticle(one, where);
    }
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * クリティカルの合図。**当たった点に出す。**
 *
 * **実体の足元ではない**——矢が刺さった高さで光らないと、手応えにならない。
 * **音は含まない**（本人に直接鳴らす。`features/bow/shoot.ts`）。
 *
 * @param ice **止まった的で出たクリ**なら、筋を青に固定する
 */
export function critFx(dim: Dimension, at: Vector3, ice = false): void {
  fx(ice ? "crit_ice" : "crit", dim, at, true);
}

/**
 * 燃えている印。**体の周りに炎を散らす。**
 *
 * ## 炎だけはバニラの粒を借りる（v1 から持ってきた・2026-08-31）
 *
 * > **自分で描いた炎より、バニラのほうが炎に見えた**
 * >（v1 の `worlds/pve/packs/pve/scripts/features/element/effects.ts`）。
 *
 * 自分で描いた舌の形は、**真上から見ると板が寝てしまい**、向きも安定しなかった。
 * **バニラの粒は 1 本ずつが小さい**ので、**数と置き場所で炎の塊を作る**——
 * 体の周りに散らして立てれば、どの角度から見ても炎に見える。
 *
 * **音は鳴らさない**（0.5 秒おきに出る。音は削られた瞬間だけ・`features/status/`）。
 */
export function burningFx(dim: Dimension, at: Vector3): void {
  try {
    for (let i = 0; i < BURN_COUNT; i++) {
      dim.spawnParticle(BURN_FLAME, {
        x: at.x + (Math.random() - 0.5) * BURN_SPREAD * 2,
        y: at.y + 0.15 + Math.random() * 1.2,
        z: at.z + (Math.random() - 0.5) * BURN_SPREAD * 2,
      });
    }
  } catch {
    /* もう居ない・読み込まれていない */
  }
}

/** 地面を探す深さ（マス）。**これより下は「地面が無い」とみなす** */
const GROUND_REACH = 8;

/** 落雷の絵（v1 から）。**5 通りあり、高さは 8 マス** */
const BOLT_KINDS = 5;
const BOLT_HEIGHT = 8.0;

/** 放電の粒（`features/enchant/onhit.ts` から呼ぶ） */
const ZAP_BODY = "pve_v3:static_body";
/**
 * 線の粒。**濃さ違いが 4 つ**（`docs/spec/13-feedback.md` 4-2）。
 *
 * **点の数を減らすと線が途切れる**ので、**間隔はそのまま、薄さで量を表す。**
 */
const ZAP_LINK = [
  "pve_v3:static_link_1",
  "pve_v3:static_link_2",
  "pve_v3:static_link_3",
  "pve_v3:static_link_4",
] as const;

/** 線を引くときの粒の間隔（マス）。**1 粒を薄くしたぶん、詰めて置く** */
const ZAP_GAP = 0.14;

/** 電気が流れた敵。**折れた筋が 2 本、体で弾ける**（`pve3_boltarc`） */
export function zapBody(dim: Dimension, at: Vector3, times = 1): void {
  if (times <= 0) return;
  try {
    // **1 回ぶんは 25％の量**（2 本）。段のぶんだけ重ねて出す
    for (let t = 0; t < times; t++) dim.spawnParticle(ZAP_BODY, { x: at.x, y: at.y, z: at.z });
  } catch {
    /* 消えている */
  }
}

/**
 * 電気が流れた道。**2 体のあいだに線を引く。**
 *
 * **粒を等間隔に置くだけ**（矢の軌跡と同じやり方。`features/bow/shoot.ts`）——
 * **線を描く命令は無い**ので、点を並べて線に見せる。
 *
 * 量は**濃さで決まる**（`times`）——段が低いほど薄い。**間隔は変えない**（減らすと線が途切れる）。
 *
 * 置くのは**四方に枝が出る電気の球**（`pve3_elec`）。
 * **隣どうしの枝が噛み合うので、繋がって見える**——
 * 点や、縦向きの稲妻を並べても繋がらなかった（2026-08-31）。
 */
export function zapLine(dim: Dimension, from: Vector3, to: Vector3, times = 4): void {
  if (times <= 0) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.1) return;
  // **薄い版を選ぶ**（`docs/spec/13-feedback.md` 4-2）——間隔は変えない
  const id = ZAP_LINK[Math.min(4, Math.max(1, times)) - 1];
  if (id === undefined) return;
  try {
    for (let d = 0; d < len; d += ZAP_GAP) {
      const t = d / len;
      dim.spawnParticle(id, {
        x: from.x + dx * t,
        y: from.y + dy * t,
        z: from.z + dz * t,
      });
    }
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 落雷。**v1 の雷をそのまま使う**（2026-08-31 決定）。
 *
 * > ### 作り直さない
 * >
 * > v1 で**映像から切り出した 5 通り**が既にある（`tools/pve2-fx.py` が持ってくる）。
 * > **雷 1 本を縦長の絵に丸ごと描き、4 コマの明滅で光らせる**——
 * > **粒を並べるやり方では雷に見えなかった**、というのが v1 の結論。
 *
 * **形は落とすたびに引く**（同じ形が続くと「絵」に見える）。
 * 絵は**真ん中で位置が決まる**ので、**高さの半分だけ持ち上げて**足元に着地させる。
 */
export function strikeFx(dim: Dimension, at: Vector3, times = 1): void {
  if (times <= 0) return;
  try {
    for (let t = 0; t < times; t++) {
      const kind = Math.floor(Math.random() * BOLT_KINDS);
      dim.spawnParticle(`pve_v3:strike_bolt_${kind}`, { x: at.x, y: at.y + BOLT_HEIGHT / 2, z: at.z });
    }
    dim.spawnParticle("pve_v3:strike_flash", { x: at.x, y: at.y + 0.1, z: at.z });
    dim.spawnParticle("pve_v3:strike_spark", { x: at.x, y: at.y + 0.1, z: at.z });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 帯電。**纏う電気と同じ絵を、範囲の地面に敷き詰める。**
 *
 * **床に寝かせてある**（`emitter_transform_xz`）ので、真上から見ても崩れない。
 * 置く数は**半径と段で決まる**——広いほど、盛るほど密になる。
 */
export function chargeGround(dim: Dimension, at: Vector3, radius: number, times = 1): void {
  if (times <= 0) return;
  // **半分に減らした**（2026-08-31）——敷き詰めすぎると地面が見えない
  const n = Math.round(radius * 1.25 * times);
  for (let i = 0; i < n; i++) {
    // **中心に寄らないように**平方根で散らす
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const x = at.x + Math.cos(a) * r;
    const z = at.z + Math.sin(a) * r;
    const y = groundAt(dim, x, at.y, z);
    if (y === undefined) continue;
    try {
      dim.spawnParticle("pve_v3:charge_zap", { x, y: y + 0.15, z });
    } catch {
      /* 読み込まれていない */
    }
  }
}

/**
 * その柱の**地面の高さ**を探す。
 *
 * > ### 平らな床とは限らない（2026-08-31）
 * >
 * > 中心と同じ高さに置くと、**段差では地面に埋まるか、宙に浮く。**
 * > **少し上から真下へ当てて、当たった面の高さを使う。**
 *
 * @param from 探し始める高さ（**ここから 3 マス上**から下へ、8 マスぶん見る）
 * @returns 地面の高さ。**見つからなければ `undefined`**（そこには出さない）
 */
function groundAt(dim: Dimension, x: number, from: number, z: number): number | undefined {
  try {
    const hit = dim.getBlockFromRay(
      { x, y: from + 3, z },
      { x: 0, y: -1, z: 0 },
      { maxDistance: GROUND_REACH, includeLiquidBlocks: true, includePassableBlocks: false }
    );
    if (hit === undefined) return undefined;
    // **当たったブロックの上面**（座標はブロックの角なので +1）
    return hit.block.location.y + 1;
  } catch {
    return undefined;
  }
}

/**
 * 回復の円。**地面に敷く**（恵みの雨）。
 *
 * **足元の高さではなく、真下の地面を探して置く**——
 * 味方の当たった高さに置くと、**段差で浮くか埋まる**（`groundAt`）。
 */
export function healCircle(dim: Dimension, at: Vector3, times = 1): void {
  if (times <= 0) return;
  const y = groundAt(dim, at.x, at.y, at.z);
  if (y === undefined) return;
  try {
    dim.spawnParticle("pve_v3:rain_circle", { x: at.x, y: y + 0.06, z: at.z });
  } catch {
    /* 読み込まれていない */
  }
}

/** どれでもない合図 */
export function proc(dim: Dimension, at: Vector3): void {
  fx("proc", dim, at);
}
