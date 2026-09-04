/**
 * 撃つ。**弾が飛んでいく。**
 *
 * 仕様は `docs/spec/10-bow.md` 2 章、威力は `docs/spec/11-damage.md`、
 * 札は `docs/spec/20-enchant.md`。
 *
 * ## 実体は出さない。**粒だけで見せる**
 *
 * ```
 * 毎 tick：4 マスぶん進める
 *          └ 追尾なら、まず向きを曲げる
 *          └ その区間に相手が居るか見る（点で見ると隙間を抜ける）
 *          └ 壁 → 反射があれば跳ね返る。無ければ消える
 *          └ 当たった → 炸裂・連鎖・貫通
 * ```
 *
 * ## 弾が持つもの
 *
 * | | |
 * | --- | --- |
 * | `mult` | **その 1 本の倍率**（マルチショット・貫通の減衰） |
 * | `pierceLeft` | 残り貫通数 |
 * | `bounceLeft` | 残り反射数 |
 * | `hitIds` | **同じ弾が同じ敵に 2 回当たらない**ように |
 * | `depth` | **連鎖の深さ。** 連鎖から連鎖は生まれない |
 *
 * **威力の式はここに書かない**——`lib/attack.ts` に投げる。
 */

import { Player, system, type Dimension, type Entity, type Vector3 } from "@minecraft/server";

import { BOW_HIT, HEAT_COOL, buildShot } from "../../lib/attack.js";
import { critFx, fx, healCircle, tier } from "../../lib/fx.js";
import { alliesNear, enemiesNear, isAlly, single, splash } from "../../lib/special.js";
import * as el from "../../state/element.js";
import * as ench from "../../state/enchant.js";
import { has, heal } from "../../state/hp.js";
import * as slow from "../../state/slow.js";
import * as st from "../../state/status.js";
import * as zones from "../../state/zones.js";
import { hit } from "../damage/index.js";

/** 弾の速さ（マス/tick）。**80 マス/秒** */
const SPEED = 4;

/** 届く距離（マス） */
const RANGE = 48;

/** 当たりとみなす太さ（半径・マス） */
const FAT = 0.9;

/** 狙う高さ（足元から。胴と頭） */
const MARKS = [0.9, 1.6] as const;

/** 軌跡の粒（`docs/spec/10-bow.md` 3-3）。**最初に置いたものに戻した** */
const TRAIL = "pve_v2:arrow_trail";

/**
 * 業火の矢。**確率・最低の間隔（tick）・軌跡・撃つ音。**
 *
 * > ### 抽選は撃った瞬間（2026-08-31 決定）
 * >
 * > 当たってから引くと、**音も軌跡も変えられない。**
 * > **撃つ前に決めて、飛んでいる間から「来る」と分かるようにする。**
 * >
 * > **1 射に 1 回だけ引く**——マルチショットで本数を増やしても発動は増えない。
 */
const INFERNO_CHANCE = 0.1;
const INFERNO_GAP = 20;
const INFERNO_TRAIL = "pve_v2:inferno_trail";

/** 貫き風で**貫いた後**の軌跡（緑）。**貫通した矢だけ色が変わる** */
const GALE_TRAIL = "pve_v2:gale_trail";
const INFERNO_SOUND = "mob.blaze.shoot";

/** クリティカルの音。**その場ではなく、殴った本人に鳴らす** */
const CRIT_SOUND = "random.anvil_land";

/** 壁を触って探すときの刻み（マス）。**細かいほど面に近づく** */
const PROBE_STEP = 0.25;

/** 反射したとき、面からどれだけ浮かせるか（マス） */
const OFF_WALL = 0.3;

/** 反射後、**面から離れる向き**を最低どれだけ持たせるか（0〜1） */
const MIN_AWAY = 0.2;

/** 粒を置く間隔（マス）。**空けすぎると点線に見える** */
const TRAIL_GAP = 0.7;

/** マルチショットが当たる確率（段あたり）と、当たったときの本数 */
const MULTI_CHANCE = 0.1;
const MULTI_COUNT = 5;

/** マルチショットの広がり（度・1 本ごと） */
const MULTI_SPREAD = 4;

/** 貫いた先の倍率（`docs/spec/20-enchant.md`） */
const PIERCE_FALL = [0.5, 0.4, 0.3, 0.2, 0.2] as const;

/** 追尾が曲がる角度（度・段あたり・1 tick） */
const HOMING_TURN = 2;

/** 追尾が相手を探す距離 */
const HOMING_RANGE = 24;

/** 連鎖が飛ぶ距離 */
const CHAIN_RANGE = 12;

/** 恵みの雨が届く半径。**狭い**——当てた味方の周りだけ */
const RAIN_RADIUS = 1.5;

/** 飛んでいる弾。**メモリだけ** */
interface Bullet {
  readonly by: Player;
  readonly dim: Dimension;
  dir: Vector3;
  /** 撃った所。**狙撃・接射が見る距離の基準** */
  readonly from: Vector3;
  /** 撃った瞬間に動いていたか（疾走射） */
  readonly moving: boolean;
  at: Vector3;
  flown: number;
  /** その 1 本の倍率 */
  mult: number;
  pierceLeft: number;
  bounceLeft: number;
  readonly homing: number;
  readonly hitIds: Set<string>;
  /** 連鎖の深さ。**1 以上なら、そこから連鎖しない** */
  readonly depth: number;
  /** **どの射撃で出た弾か**（熱暴走が見る）。連鎖の弾は 0 */
  readonly volley: number;
  /** **もう回復を撒いたか**（恵みの雨）。1 本につき 1 回だけ */
  rained: boolean;
  /** **業火が乗った射撃か**（撃った瞬間に決まる。音と軌跡が変わる） */
  readonly inferno: boolean;
  /** **もう貫いたか**（貫き風）。**貫いた後だけ軌跡が緑になる** */
  pierced: boolean;
}

/**
 * 1 回の射撃（`docs/spec/20-enchant.md` の熱暴走）。
 *
 * | | |
 * | --- | --- |
 * | 積むのは | **1 射につき 1 段**（マルチショットで 5 本出ても 1 段） |
 * | 貫通 | **何体貫いても 1 段**（当たった数では数えない） |
 * | 冷めるのは | **全弾が外れたときだけ** |
 *
 * **本数で有利不利が出ないように**——「撃ち続けた時間」で育つ札にする。
 */
interface Volley {
  readonly by: Player;
  /** まだ飛んでいる本数 */
  alive: number;
  /** 1 本でも当たったか */
  hit: boolean;
}

const volleys = new Map<number, Volley>();
let nextVolley = 1;

const bullets: Bullet[] = [];

/** 誰が、どの敵に、もう当てたか（初撃）。**メモリだけ** */
const touched = new Map<string, Set<string>>();

function norm(v: Vector3): Vector3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < 1e-6 ? { x: 0, y: 0, z: 1 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** 横に振る（マルチショットの広がり） */
function yawed(dir: Vector3, deg: number): Vector3 {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return norm({ x: dir.x * cos - dir.z * sin, y: dir.y, z: dir.x * sin + dir.z * cos });
}

/**
 * その相手は、この区間の上に居るか。**居るなら、始点からの距離**。
 *
 * **点ではなく区間で見る**——1 tick に 4 マス進むので、
 * **点で見ると隙間を抜けてしまう。**
 */
function alongSegment(from: Vector3, dir: Vector3, length: number, target: Entity): number | undefined {
  let at: Vector3;
  try {
    at = target.location;
  } catch {
    return undefined;
  }
  let best: number | undefined;
  for (const h of MARKS) {
    const v = { x: at.x - from.x, y: at.y + h - from.y, z: at.z - from.z };
    const t = v.x * dir.x + v.y * dir.y + v.z * dir.z;
    if (t < 0 || t > length) continue;
    const dx = v.x - dir.x * t;
    const dy = v.y - dir.y * t;
    const dz = v.z - dir.z * t;
    if (dx * dx + dy * dy + dz * dz > FAT * FAT) continue;
    if (best === undefined || t < best) best = t;
  }
  return best;
}

/** 壁。**当たった距離と、跳ね返る向き** */
interface Wall {
  readonly at: number;
  readonly normal: Vector3;
}

function wallWithin(dim: Dimension, from: Vector3, dir: Vector3, length: number): Wall | undefined {
  try {
    // **少し先まで見て、面までの距離で切る**（2026-08-31）。
    //
    // > ### 「進む距離まで」で探すと、壁に埋まる
    // >
    // > `maxDistance` は**ブロック単位で切られる**ので、
    // > **面はこの区間の中なのに、見つからない壁**がある。
    // > 見落とすと弾はそのまま進み、**壁に埋まって次の tick で消える。**
    // >
    // > **余分に 2 マス先まで探し、面までの距離が区間の外なら捨てる。**
    // > **弾速はそのままで直せる。**
    const shot = dim.getBlockFromRay(from, dir, { maxDistance: length + 2 });
    if (shot === undefined) return undefined;
    // **当たった面の点**まで測る（2026-08-31 に直した）。
    //
    // > ### ブロックの中心までではない
    // >
    // > 中心までの距離だと**最大で半マスぶん行き過ぎる**——
    // > **壁の中で反射したように見える**原因だった。
    // > `faceLocation` は**ブロックの北西下からの相対位置**なので、足すと当たった点になる。
    const b = shot.block.location;
    const f = shot.faceLocation;
    const at = Math.hypot(b.x + f.x - from.x, b.y + f.y - from.y, b.z + f.z - from.z);
    // **面から法線を作る**（反射に要る）
    const face = String(shot.face);
    const normal: Vector3 =
      face === "Up"
        ? { x: 0, y: 1, z: 0 }
        : face === "Down"
          ? { x: 0, y: -1, z: 0 }
          : face === "North"
            ? { x: 0, y: 0, z: -1 }
            : face === "South"
              ? { x: 0, y: 0, z: 1 }
              : face === "West"
                ? { x: -1, y: 0, z: 0 }
                : { x: 1, y: 0, z: 0 };
    // **この区間の外なら、まだ当たらない**
    if (at > length) return undefined;
    return { at, normal };
  } catch {
    return undefined;
  }
}

/** 通った跡に粒を置く */
function drawTrail(dim: Dimension, from: Vector3, dir: Vector3, length: number, id = TRAIL): void {
  for (let d = 0; d < length; d += TRAIL_GAP) {
    try {
      dim.spawnParticle(id, { x: from.x + dir.x * d, y: from.y + dir.y * d, z: from.z + dir.z * d });
    } catch {
      /* 読み込まれていない */
    }
  }
}

/**
 * 軌跡の札（`docs/spec/20-enchant.md` の「軌跡」）。
 *
 * **飛んでいる線そのものが働く。**
 *
 * | 札 | 何をするか |
 * | --- | --- |
 * | 焦土の軌跡 | **線が 2 秒燃える**（残るので `state/zones.ts` へ置く） |
 * | 氷結の軌跡 | 触れた敵を鈍らせる |
 * | 雷の尾 | 左右 2 マスへ放電（**1 体 1 回**） |
 * | 追い風の尾 | 触れた味方を速くする |
 * | 癒しの雨脚 | 触れた味方を回復する |
 */
function trailCards(b: Bullet, from: Vector3, dir: Vector3, length: number, now: number): void {
  const p = b.by;
  const scorch = ench.lv(p, "scorchtrail");
  const frost = ench.lv(p, "frosttrail");
  const tail = ench.lv(p, "thundertail");
  const wind = ench.lv(p, "windtail");
  const rain = ench.lv(p, "raintail");
  if (scorch + frost + tail + wind + rain === 0) return;

  const base = BOW_HIT * b.mult;
  for (let d = 0; d < length; d += 2) {
    const at = { x: from.x + dir.x * d, y: from.y + dir.y * d, z: from.z + dir.z * d };

    if (scorch > 0) {
      zones.place({
        by: p,
        dim: b.dim,
        at,
        radius: 1.6,
        per: base * 0.125 * scorch * el.ratio(p, "fire"),
        until: now + 40,
        tag: "scorchtrail",
      });
      fx("scorchtrail", b.dim, at);
    }

    if (frost > 0 || tail > 0) {
      for (const e of enemiesNear(b.dim, at, 2)) {
        if (frost > 0) {
          slow.add(e, slow.effect(e) * 0.4 * frost * el.ratio(p, "ice"), now);
          fx("frosttrail", b.dim, e.location);
        }
        if (tail > 0 && !b.hitIds.has(e.id)) {
          b.hitIds.add(e.id);
          single(p, e, base * 0.1 * tail * el.ratio(p, "thunder"), "pve_v2:thundertail");
          fx("thundertail", b.dim, e.location);
        }
      }
    }

    if (wind > 0 || rain > 0) {
      try {
        for (const e of b.dim.getEntities({ location: at, maxDistance: 2 })) {
          if (!(e instanceof Player)) continue;
          if (wind > 0) {
            // **効果ではなく倍率で渡す**（`features/element/` が属性へ書く）
            st.boostSpeed(e.id, 1 + 0.3 * el.ratio(p, "wind"), 60, now);
            fx("windtail", b.dim, e.location);
          }
          if (rain > 0) {
            heal(e, base * 0.05 * rain * el.ratio(p, "water"));
            fx("raintail", b.dim, e.location);
          }
        }
      } catch {
        /* 消えている */
      }
    }
  }
}

/**
 * その 1 本が飛び終わった。**当たっても外れても通る。**
 *
 * **全弾が外れて初めて熱暴走が冷める**——
 * マルチショットの 1 本が壁に刺さっただけでは戻らない。
 */
function retire(b: Bullet): void {
  const v = volleys.get(b.volley);
  if (v === undefined) return;
  v.alive -= 1;
  if (v.alive > 0) return;
  if (!v.hit) {
    // **全弾外した。** 積み上げ系はまとめて 0 へ
    st.coolHeat(v.by.id);
    st.focusReset(v.by.id);
    st.quickReset(v.by.id);
  }
  volleys.delete(b.volley);
}

/**
 * その射撃で初めて当たった。**積み上げ系を 1 段だけ進める。**
 *
 * | 札 | 何を数えるか |
 * | --- | --- |
 * | 熱暴走 | 当て続けた射撃の数 |
 * | 狙い澄まし | **同じ敵に**当て続けた射撃の数 |
 * | 矢継ぎ早 | 当て続けた射撃の数（間隔が縮む） |
 */
function markHit(b: Bullet, target: Entity, now: number): void {
  const v = volleys.get(b.volley);
  if (v === undefined || v.hit) return;
  v.hit = true;
  if (ench.lv(b.by, "overheat") > 0) st.heatUp(b.by.id, 999, HEAT_COOL, now);
  if (ench.lv(b.by, "aim") > 0) st.focusOn(b.by.id, target.id);
  if (ench.lv(b.by, "quickdraw") > 0) st.quickUp(b.by.id);
}

/**
 * 恵みの雨。**味方に当てると、その場所で範囲回復する。**
 *
 * 仕様は `docs/spec/20-enchant.md`（2026-08-31 変更）。
 *
 * > ### 敵に当てて自分が回復する札ではない
 * >
 * > **矢は味方を貫通する。** 通り抜けた所が回復の中心になる——
 * > **自分も範囲に入っていれば回復する。**
 */
function rainOn(b: Bullet, at: Vector3, now: number): void {
  const lv = ench.lv(b.by, "rain");
  if (lv <= 0) return;
  const shot = buildShot(BOW_HIT * b.mult, { shooter: b.by, now });
  const amount = shot.power * 0.1 * lv * el.ratio(b.by, "water");
  if (amount <= 0) return;
  for (const e of alliesNear(b.dim, at, RAIN_RADIUS)) heal(e, amount);
  // **量は水の属性値で決まる**（`docs/spec/13-feedback.md` 4-2）
  const step = tier(el.get(b.by, "water"));
  fx("rain", b.dim, at, false, step);
  // **円は地面に置く**（段差でも浮かない）
  healCircle(b.dim, at, step);
}

/** 動いているか。**落下は数えない** */
function isMoving(player: Player): boolean {
  try {
    const v = player.getVelocity();
    return Math.hypot(v.x, v.z) > 0.05;
  } catch {
    return false;
  }
}

/** 貫いた先の倍率。**貫き風があると、落ち方が緩む** */
function pierceMult(player: Player, index: number): number {
  const base = PIERCE_FALL[Math.min(index, PIERCE_FALL.length - 1)] ?? 0.2;
  if (ench.lv(player, "gale") <= 0) return base;
  return Math.max(base, 0.3 + 0.2 * el.ratio(player, "wind"));
}

/** 1 発撃つ。**マルチショットはここで本数を増やす** */
export function shoot(player: Player): void {
  try {
    const now = system.currentTick;
    const at = player.getHeadLocation();
    const dir = norm(player.getViewDirection());
    const moving = isMoving(player);

    // **マルチショット**（2026-08-31 に作り直した）。
    //
    // > ### 「必ず増えるが 1 本が弱い」をやめた
    // >
    // > 前は段のぶん本数が増える代わりに 1 本が 55〜25％ になっていた——
    // > **合計はほぼ変わらず、狙いが散るぶんむしろ弱い。取りたくない札**だった。
    // >
    // > **`10％ × 段` の確率で 5 発。外れたら 1 発。1 本の威力はそのまま。**
    // > **入れ得**にする。
    const multi = ench.lv(player, "multishot");
    const many = multi > 0 && Math.random() < MULTI_CHANCE * multi;
    const count = many ? MULTI_COUNT : 1;
    // **この射撃ぶんをまとめて覚える**（熱暴走は 1 射 1 段）
    const volley = nextVolley++;
    volleys.set(volley, { by: player, alive: count, hit: false });
    // **1 本あたりの威力は落とさない**
    const mult = 1;
    // **業火はここで引く**（1 射に 1 回）。当たってからでは音も軌跡も変えられない
    const inferno =
      ench.lv(player, "inferno") > 0 &&
      Math.random() < INFERNO_CHANCE &&
      st.ready(player.id, "inferno", INFERNO_GAP, now);
    // **貫通は貫き風だけ**（2026-08-31）。
    // 「貫通」の札は消した——**貫き風と役目が丸かぶりだった**
    const pierce = ench.lv(player, "gale");

    for (let i = 0; i < count; i++) {
      // **左右に振り分ける**（1 本なら真っ直ぐ）
      const offset = count === 1 ? 0 : (i - (count - 1) / 2) * MULTI_SPREAD;
      bullets.push({
        by: player,
        dim: player.dimension,
        dir: yawed(dir, offset),
        from: at,
        moving,
        at,
        flown: 0,
        mult,
        pierceLeft: pierce,
        bounceLeft: ench.lv(player, "bounce"),
        homing: ench.lv(player, "homing"),
        hitIds: new Set<string>(),
        depth: 0,
        volley,
        rained: false,
        inferno,
        pierced: false,
      });
    }
    if (inferno) {
      // **業火は音から違う**——低く長い音を重ねる
      player.playSound(INFERNO_SOUND, { volume: 0.8, pitch: 0.7 });
      player.playSound("random.bow", { volume: 0.5, pitch: 0.8 });
    } else {
      // **音量は半分**（2026-08-31）——連射するので、既定のままだと耳に張り付く
      player.playSound("random.bow", { volume: 0.5, pitch: 1.1 + Math.random() * 0.1 });
    }
  } catch {
    /* 消えている */
  }
}

/** 連鎖で 1 本生やす。**通常攻撃として飛ぶ**（そこからまた特殊攻撃が起きる） */
function chainFrom(b: Bullet, target: Entity, now: number): void {
  const lv = ench.lv(b.by, "chain");
  if (lv <= 0 || b.depth > 0) return;
  if (Math.random() >= 0.1 * lv) return;

  try {
    const at = target.location;
    const next = enemiesNear(b.dim, at, CHAIN_RANGE).find((e) => e.id !== target.id);
    if (next === undefined) return;
    const to = next.location;
    const dir = norm({ x: to.x - at.x, y: to.y + 1 - (at.y + 1), z: to.z - at.z });
    bullets.push({
      by: b.by,
      dim: b.dim,
      dir,
      from: { x: at.x, y: at.y + 1, z: at.z },
      moving: b.moving,
      // **連鎖の弾に業火は乗らない**（元の 1 射で 1 回きり）
      inferno: false,
      pierced: false,
      at: { x: at.x, y: at.y + 1, z: at.z },
      flown: 0,
      mult: b.mult,
      pierceLeft: 0,
      bounceLeft: 0,
      homing: b.homing,
      hitIds: new Set<string>(),
      depth: b.depth + 1,
      // **連鎖の弾は射撃に数えない**（元の 1 発で既に数えている）
      volley: 0,
      rained: false,
    });
    fx("chain", b.dim, at);
  } catch {
    /* 消えている */
  }
  void now;
}

/** 当てる。**威力の組み立ては `lib/attack.ts`** */
function land(b: Bullet, target: Entity, distance: number, now: number, at: Vector3): void {
  const seen = touched.get(b.by.id) ?? new Set<string>();
  const first = !seen.has(target.id);

  const shot = buildShot(BOW_HIT * b.mult, {
    shooter: b.by,
    target,
    distance,
    moving: b.moving,
    firstHit: first,
    now,
  });

  seen.add(target.id);
  touched.set(b.by.id, seen);
  b.hitIds.add(target.id);
  markHit(b, target, now);

  // **クリと素の値を渡す**——特殊攻撃はクリ前の値を参照する
  //（`docs/spec/11-damage.md` 3 章）。札の中身は `features/enchant/onhit.ts`
  hit({
    by: b.by,
    target,
    attack: shot.final,
    via: "pve_v2:bow",
    crit: shot.crit,
    power: shot.power,
    inferno: b.inferno,
  });

  // ---- 連鎖
  chainFrom(b, target, now);

  // ---- 当たった合図。**光は当たった点に、音は本人に**
  //
  // **音を場所から鳴らすと、遠くの敵に当てたとき聞こえない**
  //（弓は 48 マス届く。`docs/spec/13-feedback.md`）。
  try {
    if (shot.crit) {
      // **止まった的で出たクリは青い筋**（`docs/spec/13-feedback.md`）——
      // `fired` に "pinned" が入っていれば、**氷で止めた敵に刺さった**クリ
      critFx(b.dim, at, shot.fired.includes("pinned"));
      b.by.playSound(CRIT_SOUND, { volume: 0.35, pitch: 1.9 });
    } else {
      fx("hit", b.dim, at, true);
    }
  } catch {
    /* 消えている */
  }
}

/** 追尾。**いちばん近い敵へ、少しだけ向きを寄せる** */
function steer(b: Bullet): void {
  if (b.homing <= 0) return;
  const target = enemiesNear(b.dim, b.at, HOMING_RANGE).find((e) => !b.hitIds.has(e.id));
  if (target === undefined) return;
  try {
    const to = target.location;
    const want = norm({ x: to.x - b.at.x, y: to.y + 1 - b.at.y, z: to.z - b.at.z });
    const maxTurn = (HOMING_TURN * b.homing * Math.PI) / 180;
    const dot = Math.max(-1, Math.min(1, b.dir.x * want.x + b.dir.y * want.y + b.dir.z * want.z));
    const angle = Math.acos(dot);
    const t = angle <= maxTurn ? 1 : maxTurn / angle;
    b.dir = norm({
      x: b.dir.x + (want.x - b.dir.x) * t,
      y: b.dir.y + (want.y - b.dir.y) * t,
      z: b.dir.z + (want.z - b.dir.z) * t,
    });
  } catch {
    /* 消えている */
  }
}

/**
 * そこは壁の中か。
 *
 * > ### 壁の中から出したレイは、何にも当たらない（2026-08-31）
 * >
 * > **敵に当てた後は `hitAt + 0.6` 進める**ので、
 * > **敵の裏が壁だと、弾が壁の中や向こう側に置かれる。**
 * > そこから先は当たり判定が働かず、**壁を貫通して飛んでいく。**
 * >
 * > **毎 tick、いま壁の中に居ないかを見て、居たら消す。**
 */
function insideWall(dim: Dimension, at: Vector3): boolean {
  try {
    const block = dim.getBlock(at);
    if (block === undefined) return false;
    return !block.isAir && !block.isLiquid;
  } catch {
    // 読み込まれていない所は「壁ではない」——消してしまうより飛ばす
    return false;
  }
}

/**
 * **進んだ先が壁なら、手前へ戻す。**
 *
 * > ### レイだけに頼らない（2026-08-31）
 * >
 * > `getBlockFromRay` は**見落とすことがある**（区間の切り方・角の抜け）。
 * > 見落とすと弾は壁の中へ入り、**埋まるか、そのまま貫通する。**
 * >
 * > **区間の終わりが壁の中かを実際に見て、壁なら 0.25 ずつ戻して面を探す。**
 * > **弾速はそのまま**で、レイが外しても必ず止まる。
 *
 * @returns 壁に当たった位置と面。**当たらなければ `undefined`**
 */
function wallByProbe(dim: Dimension, from: Vector3, dir: Vector3, length: number): Wall | undefined {
  const end = { x: from.x + dir.x * length, y: from.y + dir.y * length, z: from.z + dir.z * length };
  if (!insideWall(dim, end)) return undefined;

  // **手前へ戻して、壁から出る所を探す**
  let free = 0;
  for (let t = length; t > 0; t -= PROBE_STEP) {
    const at = { x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t };
    if (!insideWall(dim, at)) {
      free = t;
      break;
    }
  }

  // **面の向き**——壁に入る手前と入った後で、どの軸のブロックが変わったかで決める
  const a = { x: from.x + dir.x * free, y: from.y + dir.y * free, z: from.z + dir.z * free };
  const b = { x: a.x + dir.x * PROBE_STEP, y: a.y + dir.y * PROBE_STEP, z: a.z + dir.z * PROBE_STEP };
  const dx = Math.floor(b.x) - Math.floor(a.x);
  const dy = Math.floor(b.y) - Math.floor(a.y);
  const dz = Math.floor(b.z) - Math.floor(a.z);
  const normal: Vector3 =
    dx !== 0
      ? { x: dx > 0 ? -1 : 1, y: 0, z: 0 }
      : dy !== 0
        ? { x: 0, y: dy > 0 ? -1 : 1, z: 0 }
        : { x: 0, y: 0, z: dz > 0 ? -1 : 1 };
  return { at: free, normal };
}

/**
 * 飛んでいる弾を進める。**毎 tick。**
 *
 * **1 回の区間で当たるのは 1 体**（貫通があれば、次の tick で次の敵へ）。
 */
export function stepBullets(now: number): void {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b === undefined) continue;

    steer(b);

    // **壁の中に居たら、そこで終わり**（貫通して飛んでいくのを防ぐ）
    if (insideWall(b.dim, b.at)) {
      retire(b);
      bullets.splice(i, 1);
      continue;
    }

    const step = Math.min(SPEED, RANGE - b.flown);
    const from = b.at;

    // ---- この区間で、いちばん手前の相手
    let target: Entity | undefined;
    let hitAt = step + 1;
    try {
      for (const e of b.dim.getEntities({ location: from, maxDistance: step + FAT + 2 })) {
        if (e.id === b.by.id) continue;
        // **味方は素通りする**（PvE。味方が壁にならない）。
        // **恵みの雨だけは、通り抜けた所で回復を撒く**
        if (isAlly(e)) {
          // **1 本につき 1 回だけ**——並んだ味方を貫くと際限なく回復してしまう
          if (!b.rained && !b.hitIds.has(e.id) && alongSegment(from, b.dir, step, e) !== undefined) {
            b.hitIds.add(e.id);
            b.rained = true;
            try {
              rainOn(b, e.location, now);
            } catch {
              /* 消えている */
            }
          }
          continue;
        }
        if (!has(e) || b.hitIds.has(e.id)) continue;
        const t = alongSegment(from, b.dir, step, e);
        if (t === undefined || t >= hitAt) continue;
        target = e;
        hitAt = t;
      }
    } catch {
      /* 読み込まれていない */
    }

    // ---- 壁のほうが手前なら、反射するか消える
    // **レイで探し、外したときは実際に触って確かめる**（`wallByProbe`）
    const wall = wallWithin(b.dim, from, b.dir, step) ?? wallByProbe(b.dim, from, b.dir, step);
    if (wall !== undefined && (target === undefined || wall.at < hitAt)) {
      drawTrail(b.dim, from, b.dir, wall.at);
      if (b.bounceLeft <= 0) {
        retire(b);
        bullets.splice(i, 1);
        continue;
      }
      // **跳ね返る。威力は落ちない**（`docs/spec/20-enchant.md`）
      //
      // > ### 置き直す場所は「壁に当たった点」
      // >
      // > **その tick の出発点から進める**と、**壁を越えた所や壁の中**に置かれることがあり、
      // > **そこからまた反射して、明後日の方向へ飛んでいく**（2026-08-31 に直した）。
      // > **当たった点まで戻し、壁の面から少しだけ浮かせる。**
      const n = wall.normal;
      const spot = {
        x: from.x + b.dir.x * wall.at,
        y: from.y + b.dir.y * wall.at,
        z: from.z + b.dir.z * wall.at,
      };
      const dot = b.dir.x * n.x + b.dir.y * n.y + b.dir.z * n.z;
      let next = norm({ x: b.dir.x - 2 * dot * n.x, y: b.dir.y - 2 * dot * n.y, z: b.dir.z - 2 * dot * n.z });

      // **面すれすれに返さない**（2026-08-31）。
      //
      // > ### 床・天井は浅く当たりやすい
      // >
      // > 反射しても**ほぼ水平のまま面の上を進む**ので、
      // > **次の tick でまた同じ面に当たり、反射回数を使い切って消える。**
      // > **面から離れる向きを最低でも少し持たせる**と、ちゃんと跳ねる。
      const away = next.x * n.x + next.y * n.y + next.z * n.z;
      if (away < MIN_AWAY) {
        const add = MIN_AWAY - away;
        next = norm({ x: next.x + n.x * add, y: next.y + n.y * add, z: next.z + n.z * add });
      }
      b.dir = next;
      // **面から離して置く**——0.05 では、浅い角度のときすぐ埋まり直す
      b.at = { x: spot.x + n.x * OFF_WALL, y: spot.y + n.y * OFF_WALL, z: spot.z + n.z * OFF_WALL };
      b.bounceLeft -= 1;
      b.flown += wall.at;
      fx("bounce", b.dim, b.at);
      if (b.flown >= RANGE) {
        retire(b);
        bullets.splice(i, 1);
      }
      continue;
    }

    if (target !== undefined) {
      drawTrail(b.dim, from, b.dir, hitAt);
      trailCards(b, from, b.dir, hitAt, now);
      // **矢が止まった点**——ここでクリの光が出る
      const impact = {
        x: from.x + b.dir.x * hitAt,
        y: from.y + b.dir.y * hitAt,
        z: from.z + b.dir.z * hitAt,
      };
      land(b, target, b.flown + hitAt, now, impact);

      if (b.pierceLeft <= 0) {
        retire(b);
        bullets.splice(i, 1);
        continue;
      }
      // **貫く。** 当たるたびに細る
      b.mult *= pierceMult(b.by, b.hitIds.size - 1);
      b.pierceLeft -= 1;
      // **ここから軌跡が緑になる**（貫き風・`docs/spec/13-feedback.md` 4-4）
      b.pierced = true;
      b.at = {
        x: from.x + b.dir.x * (hitAt + 0.6),
        y: from.y + b.dir.y * (hitAt + 0.6),
        z: from.z + b.dir.z * (hitAt + 0.6),
      };
      b.flown += hitAt + 0.6;
      if (b.flown >= RANGE) {
        retire(b);
        bullets.splice(i, 1);
      }
      continue;
    }

    // ---- 何も無ければ進む
    drawTrail(b.dim, from, b.dir, step, b.inferno ? INFERNO_TRAIL : b.pierced ? GALE_TRAIL : TRAIL);
    trailCards(b, from, b.dir, step, now);
    b.at = { x: from.x + b.dir.x * step, y: from.y + b.dir.y * step, z: from.z + b.dir.z * step };
    b.flown += step;
    if (b.flown >= RANGE) {
      retire(b);
      bullets.splice(i, 1);
    }
  }
}

/** 飛んでいる弾の数。**確かめる用** */
export function bulletCount(): number {
  return bullets.length;
}
