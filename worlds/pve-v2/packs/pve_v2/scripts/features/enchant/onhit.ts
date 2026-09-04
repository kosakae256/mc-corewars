/**
 * 当たったときに起きるもの。**札の中身はここ。**
 *
 * 仕様は `docs/spec/20-enchant.md`。
 *
 * ## 通り道は 1 本
 *
 * **通常攻撃が当たると `onHit` が呼ばれる**（`features/damage/index.ts`）。
 * ここで**燃やす・爆ぜる・落とす・凍らせる**をまとめて捌く。
 *
 * | 決まり | |
 * | --- | --- |
 * | 参照元 | **通常攻撃の最終火力（クリ前）** ＝ `info.power` |
 * | クリ | **特殊攻撃には乗らない**（`lib/special.ts` が `kind: "extra"` で入れる） |
 * | 範囲 | **主対象に全部、周囲 25％・6 体まで** |
 *
 * > **武器が増えても、ここは変わらない**——`onHit` は弓に限らない。
 */

import { Player, type Entity } from "@minecraft/server";

import { THIN_CALM, avg, duo, trio } from "../../lib/attack.js";
import { chargeGround, fx, strikeFx, tier, zapBody, zapLine } from "../../lib/fx.js";
import { enemiesNear, single, splash } from "../../lib/special.js";
import * as el from "../../state/element.js";
import * as ench from "../../state/enchant.js";
import { heal, max as hpMax } from "../../state/hp.js";
import * as slow from "../../state/slow.js";
import * as st from "../../state/status.js";
import * as zones from "../../state/zones.js";
import { onHit, type HitInfo } from "../damage/index.js";

/** 状態異常の長さ（tick）。**3 秒** */
const DEBUFF_TIME = 60;

/** 雷速・烈風が続く長さ（tick） */
const RUSH_BOLT = 30;
const RUSH_GUST = 60;

/** 氷片が届く距離（マス） */
const SHARD_RADIUS = 3.5;

/** 大技の間隔（tick） */
const ALLSHOT_EVERY = 60;

/** 帯電が溜まるクリ数と、放電の半径 */
const CHARGE_EVERY = 5;
const CHARGE_RADIUS = 6;

/** 落雷・火薬矢・雷鳴の炎の半径 */
const BLAST = 2.5;

/** 放電が流れる距離 */
const STATIC_RADIUS = 4;

/** 動いているか。**落下は数えない**（`features/bow/shoot.ts` と同じ見方） */
function moving(p: Player): boolean {
  try {
    const v = p.getVelocity();
    return Math.hypot(v.x, v.z) > 0.05;
  } catch {
    return false;
  }
}

function ratioOf(p: Player, e: el.Element): number {
  return el.ratio(p, e);
}

/**
 * **エフェクトの量**（`docs/spec/13-feedback.md` 4-2）。
 *
 * **属性値 5 刻みで 0〜4 段**——0 なら何も出さない、4 で作り込んだ量。
 * **性能は連続に変わるが、見た目だけ刻む。**
 */
function fxTier(p: Player, e: el.Element): number {
  return tier(el.get(p, e));
}

/**
 * 燃やす。**渡すのは「毎秒の値」。**
 *
 * **当てた回数ぶん積み上がり**、1 秒ごとにまとめて入る（`state/status.ts`）。
 * **3 秒より前に入れたぶんは落ちる**ので、無限には重ならない。
 */
function ignite(by: Player, target: Entity, per: number, now: number): void {
  st.ignite(target.id, by, per, now);
  fx("ember", by.dimension, target.location, false, fxTier(by, "fire"));
}

/** 前方へ線を引いて当てる（雷雲）。**1 体 1 回** */
function line(by: Player, from: Entity, amount: number): void {
  try {
    const at = from.location;
    const dir = by.getViewDirection();
    const hitIds = new Set<string>([from.id]);
    for (let d = 1; d <= 10; d += 1) {
      const p = { x: at.x + dir.x * d, y: at.y + dir.y * d + 1, z: at.z + dir.z * d };
      // **線が見えないと当たったか分からない**ので、粒を並べる（**仮**。`lib/fx.ts`）
      try {
        by.dimension.spawnParticle("pve_v2:arc", p);
      } catch {
        /* 読み込まれていない */
      }
      if (d % 2 !== 0) continue;
      for (const e of enemiesNear(by.dimension, p, 2)) {
        if (hitIds.has(e.id)) continue;
        hitIds.add(e.id);
        single(by, e, amount, "pve_v2:thundercloud");
      }
    }
  } catch {
    /* 消えている */
  }
}

/** 近くの敵へ鈍化を配る（吹雪・氷片） */
function spreadSlow(by: Player, at: Entity, radius: number, rate: number, now: number): void {
  if (rate <= 0) return;
  try {
    for (const e of enemiesNear(by.dimension, at.location, radius)) {
      if (e.id === at.id) continue;
      slow.add(e, slow.effect(e) * rate, now);
    }
  } catch {
    /* 消えている */
  }
}

/** 当たったときに全部見る */
function handle(info: HitInfo): void {
  const by = info.by;
  const target = info.target;
  if (by === undefined) return;

  const now = info.now;
  // **参照元はクリティカルを掛ける前の最終火力**（2026-08-31 決定）。
  //
  // **クリ時だけ発動する札**（落雷・雷鳴の炎・雷雲・灼熱の渦）が
  // **発動条件と威力の両方でクリを数える**のを避ける。
  // 特殊攻撃の数字が**毎回同じ**になるので、調整もしやすい。
  const power = info.power ?? info.attack;
  const crit = info.crit === true;
  const d = slow.ratio(target, now);
  const burning = st.burning(target.id, now);

  // ================================================ 火
  const ember = ench.lv(by, "ember");
  if (ember > 0) ignite(by, target, power * 0.03 * ember * ratioOf(by, "fire"), now);

  const melt = ench.lv(by, "melt");
  if (melt > 0 && burning && d > 0) {
    st.weaken(target.id, 0.4 * melt * duo(by, "fire", "ice") * d, DEBUFF_TIME, now);
    fx("scorch", by.dimension, target.location, false, fxTier(by, "fire"));
  }

  // **熱暴走を積むのは `features/bow/shoot.ts`**——「1 射につき 1 段」を数えるため

  const powder = ench.lv(by, "powder");
  if (powder > 0) {
    splash({
      by,
      dim: by.dimension,
      at: target.location,
      radius: BLAST,
      amount: power * 0.4 * powder * ratioOf(by, "fire"),
      main: target,
      // **周りへは 10％ だけ**（2026-08-31 決定）——火は単体特化なので、
      // 巻き込みは「おまけ」に留める（既定の 25％ より薄い）
      rate: 0.1,
      via: "pve_v2:powder",
    });
    fx("powder", by.dimension, target.location, false, fxTier(by, "fire"));
  }

  // **業火**。**抽選は撃った瞬間**（`features/bow/shoot.ts`・2026-08-31 変更）。
  //
  // > ### ここでは引かない
  // >
  // > **音と軌跡を変えるには、撃つ前に決まっていないといけない。**
  // > ここは**引いた結果（`info.inferno`）を見るだけ。**
  const inferno = ench.lv(by, "inferno");
  if (inferno > 0 && info.inferno === true) {
    single(by, target, power * 6 * inferno * ratioOf(by, "fire"), "pve_v2:inferno");
    for (const e of enemiesNear(by.dimension, target.location, 3)) {
      ignite(by, e, power * 0.03 * ratioOf(by, "fire"), now);
    }
    fx("inferno", by.dimension, target.location, false, fxTier(by, "fire"));
  }

  // ---- 凪。**殴られずに 4 秒たっている間に当てると、水しぶきが上がる**（2026-08-31）。
  //
  // **効いているかを見せる**——火力が上がっているのは数字だけでは分からない
  if (ench.lv(by, "calm") > 0 && st.calmFor(by.id, now) >= THIN_CALM) {
    fx("calm", by.dimension, target.location, false, fxTier(by, "water"));
  }

  // ---- 疾走射。**走りながら当てたときだけ葉が散る**（2026-08-31）。
  //
  // **撃った瞬間ではなく、当たった瞬間の動きを見る**——
  // `lib/attack.ts` は撃った時の状態を持っているが、ここには来ない。
  // **矢が飛ぶ間に止まることは稀**なので、これで足りる
  if (ench.lv(by, "dash") > 0 && moving(by)) fx("dash", by.dimension, target.location, false, fxTier(by, "wind"));

  // ================================================ 雷
  const strike = ench.lv(by, "strike");
  if (strike > 0 && crit) {
    splash({
      by,
      dim: by.dimension,
      at: target.location,
      radius: BLAST,
      amount: power * 0.4 * strike * ratioOf(by, "thunder"),
      main: target,
      via: "pve_v2:strike",
    });
    fx("strike", by.dimension, target.location);
    // **雷は v1 の絵を落とす**（`lib/fx.ts` の `strikeFx`）
    strikeFx(by.dimension, target.location, fxTier(by, "thunder"));
  }

  // **帯電**——雷弓の奥義（2026-08-31 決定）。
  //
  // **クリを 5 回溜めて、周囲へ一気に落とす。**
  // **雷は範囲**（`docs/spec/12-element.md` 2-1）なので、単体連打ではなく放電にする。
  // **周りにも減衰なしで同じ値**が入る——溜める時間が代償。
  const charge = ench.lv(by, "charge");
  if (charge > 0 && crit && st.countCrit(by.id, CHARGE_EVERY)) {
    splash({
      by,
      dim: by.dimension,
      at: target.location,
      radius: CHARGE_RADIUS,
      amount: power * 0.5 * charge * ratioOf(by, "thunder"),
      main: target,
      rate: 1,
      via: "pve_v2:charge",
    });
    fx("charge", by.dimension, target.location);
    // **範囲の地面に電気を敷く**（半径は上の `CHARGE_RADIUS` と同じ）
    chargeGround(by.dimension, target.location, CHARGE_RADIUS, fxTier(by, "thunder"));
  }

  // **追い討ち**——クリが手数になる（弓の個性。`docs/spec/20-enchant.md` 1-1）
  const followup = ench.lv(by, "followup");
  if (followup > 0 && crit) {
    single(by, target, power * 0.5 * followup * ratioOf(by, "thunder"), "pve_v2:followup");
    fx("followup", by.dimension, target.location, false, fxTier(by, "thunder"));
  }

  // **放電**——当てた敵から**周りへ流れる**（2026-08-31 決定）。
  // 倒したときではなく、**当てるたび**に伝播する
  const staticE = ench.lv(by, "static");
  if (staticE > 0) {
    splash({
      by,
      dim: by.dimension,
      at: target.location,
      radius: STATIC_RADIUS,
      amount: power * 0.025 * staticE * ratioOf(by, "thunder"),
      // **周りへは「主対象の 25％」ではなく、そのまま配る**（伝播が本体）
      rate: 1,
      // **当てた敵にも入る**（2026-08-31 追記）——伝播だけでなく、当たった所でも弾ける
      main: target,
      via: "pve_v2:static",
    });
    // ---- 電気が流れたことを見せる（2026-08-31）。
    //
    // **地面（当てた敵の周り）→ 結ぶ線 → 伝播先の体**、の順に出す。
    // **誰へ流れたかを知っているのはここだけ**なので、線もここで引く。
    const step = fxTier(by, "thunder");
    fx("static", by.dimension, target.location, false, step);
    if (step > 0) {
      const from = target.location;
      // **当てた敵にも纏わせる**（2026-08-31）——ダメージが入る所には電気が出る
      zapBody(by.dimension, from, step);
      for (const e of enemiesNear(by.dimension, from, STATIC_RADIUS)) {
        if (e.id === target.id) continue;
        const to = e.location;
        zapLine(by.dimension, { x: from.x, y: from.y + 1, z: from.z }, { x: to.x, y: to.y + 1, z: to.z }, step);
        zapBody(by.dimension, to, step);
      }
    }
  }

  if (ench.lv(by, "boltspeed") > 0 && crit) {
    st.rush(`${by.id}:bolt`, RUSH_BOLT, now);
    // **見た目は出さない**（2026-08-31 決定）。
    //
    // > ### 自分に纏わせるのはやめた
    // >
    // > **クリのたびに自分の周りで光る**ので、**当てている最中ずっと邪魔だった。**
    // > 他人にだけ見せる形も試したが、**そこまでして見せる価値のある情報ではない。**
    // > 効いているかは**連射の速さ**と、ステータスの本で分かる。
  }

  const cloud = ench.lv(by, "thundercloud");
  if (cloud > 0 && crit) line(by, target, power * 0.175 * cloud * duo(by, "thunder", "wind"));

  const flame = ench.lv(by, "thunderflame");
  if (flame > 0 && crit) {
    splash({
      by,
      dim: by.dimension,
      at: target.location,
      radius: BLAST,
      amount: power * 0.5 * flame * duo(by, "fire", "thunder"),
      main: target,
      via: "pve_v2:thunderflame",
    });
    fx("thunderflame", by.dimension, target.location, false, fxTier(by, "thunder"));
  }

  const vortex = ench.lv(by, "vortex");
  if (vortex > 0 && crit) {
    zones.place({
      by,
      dim: by.dimension,
      at: target.location,
      radius: 3,
      per: power * 0.15 * vortex * trio(by, "fire", "wind", "thunder"),
      until: now + 60,
      tag: "vortex",
    });
    fx("vortex", by.dimension, target.location, false, fxTier(by, "fire"));
  }

  // ================================================ 水
  const steam = ench.lv(by, "steam");
  if (steam > 0 && burning) {
    splash({
      by,
      dim: by.dimension,
      at: target.location,
      radius: BLAST,
      amount: power * 0.125 * steam * duo(by, "fire", "water"),
      main: target,
      via: "pve_v2:steam",
    });
    heal(by, power * 0.02);
    fx("steam", by.dimension, target.location);
  }

  // ================================================ 氷
  const fill = el.iceFill(by);
  if (fill > 0) slow.add(target, power * fill, now);

  // **氷片**。**その一発が積んだぶん**の 10％ × 段 を、周りへ撒く（2026-08-31 決定）。
  //
  // > ### ゲージの割合ではなく、攻撃が積んだ量の割合
  // >
  // > 「蓄積効果値の◯％」だと**当てるたびに全員が満タンに近づく**——強すぎた。
  // > **積んだぶん（`power × 氷の積み`）を配る**なら、**氷を盛るほど増える**という
  // > 素直な形になり、**1 発の重みも変わらない。**
  //
  // **鈍化中かどうかは見ない**（2026-08-31）——
  // **積んだぶんを配るだけ**なので、条件を付ける意味が無い。
  const shard = ench.lv(by, "shard");
  if (shard > 0 && fill > 0) {
    const share = power * fill * 0.1 * shard;
    try {
      for (const e of enemiesNear(by.dimension, target.location, SHARD_RADIUS)) {
        if (e.id === target.id) continue;
        slow.add(e, share, now);
      }
    } catch {
      /* 消えている */
    }
    fx("shard", by.dimension, target.location, false, fxTier(by, "ice"));
  }

  const blizzard = ench.lv(by, "blizzard");
  if (blizzard > 0) {
    spreadSlow(by, target, 3, 0.2 * blizzard * duo(by, "ice", "wind"), now);
    fx("blizzard", by.dimension, target.location);
  }

  // ================================================ 5 属性平均
  const allshot = ench.lv(by, "allshot");
  if (allshot > 0 && st.ready(by.id, "allshot", ALLSHOT_EVERY, now)) {
    single(by, target, power * 3 * allshot * avg(by), "pve_v2:allshot");
    ignite(by, target, power * 0.06, now);
    slow.add(target, slow.effect(target) * 0.5, now);
    st.weaken(target.id, 0.2, DEBUFF_TIME, now);
    fx("allshot", by.dimension, target.location);
  }

  // ================================================ 倒したとき
  if (!info.killed) return;

  const gust = ench.lv(by, "gust");
  if (gust > 0) {
    // **掛け直しでは出さない**（`docs/spec/13-feedback.md` 4-4）——
    // **続けて倒すと、羽と音が途切れなくなる。** 効果が切れているときだけ見せる
    const fresh = !st.rushing(`${by.id}:gust`, now);
    st.rush(`${by.id}:gust`, RUSH_GUST, now);
    // **効果ではなく倍率で渡す**（`features/element/` がビヘイビアの段へ流す）
    st.boostSpeed(by.id, 1 + 0.5 * gust * ratioOf(by, "wind"), RUSH_GUST, now);
    if (fresh) fx("gust", by.dimension, by.location, false, fxTier(by, "wind"));
  }

  // ---- 延焼が移る（**燃えたまま死ぬと隣へ**）。**自分が付けた火を配る**
  const burn = st.burnOf(target.id, by.id);
  if (burn !== undefined && ember > 0) {
    // **いまの厚みを、そのまま隣へ配る**
    const rate = st.burnRate(burn);
    for (const e of enemiesNear(by.dimension, target.location, 4)) {
      st.ignite(e.id, by, rate, now);
    }
  }
  st.clearBurn(target.id);
  void hpMax;
}

/** 足す。**トップレベルから 1 度だけ** */
export function registerOnHit(): void {
  onHit(handle);
}
