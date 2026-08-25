/**
 * ワイヤー射出装置（グラップリングフック）。
 *
 * 仕様は `docs/spec/13-grapple.md`。
 *
 * ## 何が面白いのか
 *
 * **移動の途中でワイヤーを切ると、その勢いのまま前へ飛べる。**
 *
 * 引き寄せは終点で止まる。だが**途中で切れば速度は残る。**
 * どこで切るかで到達点が変わる。
 *
 * ## 状態はメモリだけに持つ
 *
 * **`/reload` で全部切れる。** それでよい。
 * 宙に浮いたまま固まるより、落ちて着地するほうが安全。
 * ガスだけは動的プロパティに持つ（`gas.ts`）。
 *
 * ## 移動は加速度で作る
 *
 * **毎 tick、いまの速度にワイヤーの向きへの加速度を足す。**
 *
 * 速度を決め打ちで置き換える形も、テレポートで動かす形も試して
 * どちらもだめだった（2026-08-24）。
 *
 * | やり方 | 何が起きたか |
 * | --- | --- |
 * | テレポート | **壁を貫通し、見た目が飛び飛びになる** |
 * | 速度を置き換える | ゲーム側の計算と喧嘩して**がたつく** |
 * | **加速度を足す** | 慣性も衝突もゲーム側に任せられる |
 *
 * 重力ぶんだけ上に足せば、引き寄せ中は落ちない。
 * 切ったあとの飛び出しは**何もしなくても続く。** 物理がそうなっている。
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Entity,
  type Player,
  type Vector3,
} from "@minecraft/server";

import { isRunning, teamOf, type Team } from "../../lib/match-state.js";
import { BAR, bar } from "../../lib/fx.js";
import { GAS_MAX, addGas, drainGas, gasOf, spendGas } from "./gas.js";
// **ワイヤーを使っているかは v2 と共通で見る**（docs/spec/21-grapple-v2.md 5章）
import { isBusy, isFlying, land, markFlying } from "./busy.js";
import { crashDrone, droneOwner, isFlyingDrone } from "../drone/index.js";

/** この道具のアイテム。**支給品** */
export const GRAPPLE_ITEM = "game:grapple";

/**
 * ワイヤーを撃てるもの。
 *
 * 仕様は `docs/spec/13-grapple.md` 9 章。
 *
 * > ### 武器を持ったままでも飛べる。
 *
 * 剣を買うと**ワイヤーが撃てなくなる**——
 * これでは「武器を持つ」ことが**移動を捨てる**という意味になり、
 * 立体機動のゲームなのに**戦うほど動けなくなる。**
 *
 * **売る剣はすべてワイヤー射出装置そのもの。**
 * 段階で変わるのは**火力だけ**で、飛び方は変わらない。
 *
 * **ガスは共通。** 持ち替えても増えない
 *（`gas.ts` はプレイヤーに紐づけて持っている）。
 */
export const GRAPPLE_ITEMS: ReadonlySet<string> = new Set([
  GRAPPLE_ITEM,
  "game:sword_wood",
  "game:sword_stone",
  "game:sword_iron",
  "game:sword_diamond",
]);

/** それはワイヤーを撃てるものか */
export function isGrappleItem(typeId: string | undefined): boolean {
  return typeId !== undefined && GRAPPLE_ITEMS.has(typeId);
}

/** ドローンの実体。**動く的として刺さる**（docs/spec/23-drone.md 4-A） */
const DRONE_ENTITY = "game:drone";

/**
 * 機体に刺さる箱の半径（マス）。**実際の大きさの 2 倍。**
 *
 * 仕様は `docs/spec/23-drone.md` 3-A。
 *
 * 機体は 0.9 x 0.4。**その半分**（0.45 / 0.2）が本来の半径で、
 * ここはその**倍**を入れてある。
 *
 * **空を動く小さな的に、25 マス先から線を当てる**のは無理がある。
 * 掛ける側に少し寄せないと、**狙う遊びにならない。**
 */
const DRONE_HIT = { x: 0.9, y: 0.4, z: 0.9 } as const;

/** 機体の中心が、足元からどれだけ上か（マス） */
const DRONE_CENTER_Y = 0.2;

/**
 * 線と箱の交差。**入る所までの距離を返す**（当たらなければ undefined）。
 *
 * よくある「スラブ法」。3 軸それぞれで
 * **入る時刻と出る時刻**を出し、重なりが残れば当たっている。
 */
function rayBox(from: Vector3, dir: Vector3, center: Vector3, maxDist: number): number | undefined {
  const c = { x: center.x, y: center.y + DRONE_CENTER_Y, z: center.z };
  let near = 0;
  let far = maxDist;
  const axes: readonly ["x" | "y" | "z", number][] = [
    ["x", DRONE_HIT.x],
    ["y", DRONE_HIT.y],
    ["z", DRONE_HIT.z],
  ];
  for (const [axis, half] of axes) {
    const d = dir[axis];
    const min = c[axis] - half - from[axis];
    const max = c[axis] + half - from[axis];
    if (Math.abs(d) < 1e-6) {
      // **その軸には進んでいない。** 箱の中に居なければ当たらない
      if (min > 0 || max < 0) return undefined;
      continue;
    }
    const t1 = min / d;
    const t2 = max / d;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return undefined;
  }
  return near;
}

/**
 * 敵のドローンに刺して動いたあと、落ちるまで（tick）。
 *
 * **0.5 秒。** 刺した瞬間ではなく、**引いてから落ちる。**
 * 刺さっただけで落ちるなら、**狙って刺す意味しか無い。**
 */
const DRONE_CRASH_DELAY = 10;

// ---------------------------------------------------------------- 数値
//
// **速さは 1 tick あたりのマス数。** 1 秒 = 20 tick

/**
 * 届く距離（マス）。
 *
 * **当たったときのガスの消費はこの距離ぶん。**
 */
const RANGE = 25;

/**
 * 外したときのガス。**固定**（2026-08-24 変更）。
 *
 * 以前は「一番遠くまで撃った」とみなして距離の上限ぶん取っていたが、
 * 射程を 25 に伸ばしたことで**外した瞬間に 4 分の 1 が消える**
 * ことになり、撃つこと自体をためらわせていた。
 *
 * **外すのは安く、遠くへ当てるのは高い。**
 * そのほうが「狙って遠くへ撃つ」ことに意味が出る。
 */
const MISS_COST = 10;

/**
 * 刺すのに必要なガス。**10。**
 *
 * **足りないなら、そもそも撃たせない**（2026-08-25 変更）。
 *
 * 撃てるだけ撃てると、**刺さった直後にガス切れで落ちる。**
 * 刺してから引き寄せるまでが 1 つの動作なので、
 * **引く分が残っていない状態で刺せてはいけない。**
 */
const ATTACH_MIN = 10;

/**
 * 刺すのに使うガス。**5。**
 *
 * 以前は**距離ぶん**取っていた（遠いほど高い）。
 * 分かりにくいうえ、**遠くへ撃つほど引く分が残らない。**
 *
 * **固定にする。** 必要 10・消費 5 なので、
 * 刺した直後には必ず 5 以上残っている。
 */
const ATTACH_COST = 5;

/**
 * 動き出しの速さ。**ダッシュの 2 倍くらい**（約 11 マス/秒）。
 *
 * 当初はダッシュジャンプと同じ（0.35）にしていたが、
 * **踏み出しがもたついた**（2026-08-24）。
 * 引っ掛けてから乗るまでの間は短いほうが気持ちよい。
 */
const SPEED_START = 0.7;

/** 最高速。**ダッシュの 5 倍くらい**（約 28 マス/秒） */
const SPEED_MAX = 1.4;

/**
 * 加速（マス/tick²）。**毎 tick、目標の速さがこの分だけ上がる。**
 *
 * 一時は「数 tick に 1 回だけ与える」形にしていたが、
 * そのとき加速も同じ回数しか進めておらず、**実質 1/5 になっていた**
 *（2026-08-24 の「速度が出ない」）。
 */
const PULL_ACCEL = 0.06;

/**
 * 引っ掛けた点を、面からどれだけ手前にずらすか。
 *
 * **面ちょうどだと、ブロックの中に見える。**
 * 中を目指すことになるので、たどり着けずに押し付け続ける。
 */
const SURFACE_GAP = 0.4;

/**
 * 動き出しでずらす角度（度）。
 *
 * **見ている側へ横にずらす。**
 *
 * 引っ掛けた点をまっすぐ狙うと、**壁に叩きつけられる。**
 * 少し横へ逃がせば、壁沿いに擦り抜けられる。
 *
 * ずらす向きは**プレイヤーが向いている側。**
 * 左を見ていれば左へ、右を見ていれば右へ。
 * 「避けたい側を見る」という操作がそのまま効く。
 *
 * **真正面を見ているとずれない。** 左右どちらでもないため。
 */
const BEND_START = 22;

/**
 * 引き寄せ中にずらす角度（度）。**動き出しより浅い。**
 *
 * ## 効きにくい理由
 *
 * 向きは**毎 tick、引っ掛けた点から計算し直している。**
 * ずらしても次の tick でまた点のほうを向くので、
 * **ずれは溜まらず、その場で打ち消される。**
 *
 * 見た目に出すには、角度そのものを大きくする必要がある
 *（2026-08-24 の「ずれてない気がする」）。
 */
const BEND_PULL = 12;

/**
 * 切れずに居られる範囲の広さ（度）。
 *
 * 引っ掛けた点から見て、**引き寄せ開始位置のほうへ開いた円錐**。
 * この角度の外へ出たら「奥へ行った」とみなして切る。
 *
 * | 値 | 形 |
 * | --- | --- |
 * | 180 | 引っ掛けた点を通る**平面**。真横まで許す |
 * | 120 | 左右 60 度まで |
 * | 60 | 左右 30 度まで |
 * | **40** | 左右 20 度まで。20 では**狭すぎた** |
 *
 * 狭めたのは、横向きに引かれると
 * **進行方向と関係ない向きに曲げられる**ため（2026-08-24）。
 */
const CUT_ANGLE = 40;

/**
 * ここまで近づいたら切る（マス）。
 *
 * **着くのを待たない**（2026-08-24 変更）。
 *
 * 引っ掛けた点の目の前まで引かれると、
 * **勢いが壁に吸われて止まる。** 飛び続けたいのに減速する。
 *
 * 手前で切れば、そのままの勢いで通り過ぎられる。
 * **止まりたいなら壁にぶつかればいい**ので、切る側で止める必要が無い。
 */
const CLOSE_DIST = 3;

/** これより遅ければ「止まっている」とみなす（マス/tick） */
const STUCK_SPEED = 0.06;

/** 止まったまま何 tick で諦めるか。**0.4 秒** */
const STUCK_TICKS = 8;

/**
 * 移動キーで横に動ける量（マス/tick）。**空中にいるときだけ。**
 *
 * **引き寄せの速度に足す形。** 最高速に対する割合で効き目が決まる。
 *
 * ## 操作を強くする方に倒した（2026-08-24 決定）
 *
 * 当初は「どこに引っ掛けたか」で結果が決まるほうが面白いと考え、
 * 曲げ幅を引きより小さく保っていた。
 *
 * **本人の判断で逆にした。**
 * 引っ掛けた先は「そこへ向かう力が出る場所」であって、
 * **飛ぶ方向は飛びながら決める。** そのほうが立体機動に近い。
 */
const STEER = 0.28;

/**
 * 地面にいるときの曲げ幅。
 *
 * **足が着いているうちは効かせない**（2026-08-24）。
 *
 * 空中と同じだけ効かせると、**地上を異常な速さで走れてしまう。**
 * 立体機動は空中でこそ意味があり、地上の走りを速くする道具ではない。
 */
const STEER_GROUND = 0;

/**
 * 引き寄せを始めるときの消費。
 *
 * **踏み切りに値段を付ける**（2026-08-24 追加）。
 * 引っ掛けるだけなら安く、**動くと高い。**
 */
const PULL_START_COST = 5;

/** 移動中の消費。**1 tick あたり 1**（1 秒あたり 20） */
const MOVE_COST_PER_TICK = 1;

/** 時間での回復。**1 秒あたり 3.3（空から 30 秒で満タン）** */
const REGEN_PER_TICK = GAS_MAX / (30 * 20);

/**
 * 与える値の倍率。
 *
 * **ノックバックに渡した値は、そのままの速度にならない。**
 * 内部で半分以下に目減りしているらしく、
 * 1.6 では**初速が遅い**と言われた（2026-08-24）。
 *
 * **速さが足りない／出すぎるときは、まずここを動かす。**
 * 全体が揃って変わる。
 *
 * 2.35 → 2.12（1 割）→ **2.01**（さらに 5 分）と下げた（2026-08-25）。
 */
const KNOCK_SCALE = 2.01;

/**
 * 下へ刺したときの、**踏み切りの上向き。**
 *
 * 仕様は `docs/spec/13-grapple.md` 8章。
 *
 * **一蹴りの 1 回だけ。** そのあとの引きでは足さない
 *（2026-08-25 修正）。
 *
 * 引いている間ずっと浮かせる形も試したが、**上向きは要らなかった。**
 * 踏み切りで少し持ち上がれば、あとは縦 0 のまま滑ればよい。
 */
const DOWN_KICK = 0.45;

/**
 * 下へ引くときに、向きを上へ起こす角度（度）。
 *
 * 仕様は `docs/spec/13-grapple.md` 8章。
 *
 * 真下へ引くと**落ちるだけ**になり、回り込む余地が無い。
 * 少し起こすと**前へ抜けながら降りる。**
 *
 * **水平より上には向けない。** 上向きになると、
 * 「下に刺したのに上がる」という直したばかりの不具合に戻る。
 */
const DOWN_RAISE = 30;

/**
 * ずらし始める角度（度）。
 *
 * **視線と引きの向きがこれより開いているときだけずらす**（2026-08-24）。
 *
 * 真っ直ぐ狙っているのにずれると、**狙いが当たらない道具**になる。
 * 「避けたいときだけ横を向く」という操作にする。
 */
const BEND_DEADZONE = 10;

/** キルでの回復 */
export const KILL_GAS = 40;

/**
 * 着地したあと、コアを削れない時間（tick）。**3 秒。**
 *
 * **飛び込んだ勢いのまま削れると、守る余地が無い**
 *（`docs/spec/13-grapple.md` 7章）。
 */
const CORE_LOCK_TICKS = 60;

/**
 * 最後に**着地した**時刻。**メモリだけ。**
 *
 * **数え始めるのは着地から**（2026-08-26 変更）。
 *
 * 以前は**ワイヤーを切った時点**から数えていたので、
 * **飛んでいる 3 秒がそのまま待ち時間に化けていた。**
 * 高い所から長く飛べば、着いた瞬間に削れる——
 * **一番速い入り方が、一番待たない入り方**になっていた。
 */
const lastLanding = new Map<string, number>();

/**
 * 引き寄せを終えたが、**まだ着地していない人。**
 *
 * この間は**削れない**（時間を数え始めてすらいない）。
 */
const airborne = new Set<string>();

/**
 * いまコアを削れるか。
 *
 * `features/core` から呼ぶ。**移動の直後は false。**
 */
export function canBreakCore(player: Player): boolean {
  // **まだ空中。** 数え始めてもいない
  if (airborne.has(player.id)) return false;
  const at = lastLanding.get(player.id);
  return at === undefined || system.currentTick - at >= CORE_LOCK_TICKS;
}

/** あと何秒待てばよいか。**理由を出すため** */
export function coreLockLeft(player: Player): number {
  // **着地してから 3 秒。** 空中なら、まだ丸ごと残っている
  if (airborne.has(player.id)) return CORE_LOCK_TICKS / 20;
  const at = lastLanding.get(player.id);
  if (at === undefined) return 0;
  return Math.max(0, Math.ceil((CORE_LOCK_TICKS - (system.currentTick - at)) / 20));
}

/**
 * 着地した。**待ち時間はここから数える。**
 *
 * 見張りの周期から呼ぶ（足が着いた tick）。
 */
function landedForLock(playerId: string): void {
  if (!airborne.delete(playerId)) return;
  lastLanding.set(playerId, system.currentTick);
}

// ---------------------------------------------------------------- 状態
interface Wire {
  /** 引っ掛けた点 */
  at: Vector3;
  /**
   * 引っ掛けた**実体**（ドローン）。
   *
   * 仕様は `docs/spec/23-drone.md` 4-A。
   *
   * **動く的。** 刺さっている間、`at` を毎 tick その位置に合わせる。
   * 消えたら切る（`gone`）。
   */
  readonly target?: Entity;
  /**
   * 引っ掛けた**ブロックの座標。**
   *
   * **点だけでは足りない**（2026-08-25 追加）。
   * 掛けた足場が壊されても、点はその場に残るので**宙に引かれ続ける。**
   *
   * **ゲームが返した `hit.block` をそのまま持つ。**
   * 点から割り出そうとすると、
   * **面の向きによって隣の空気のマスを指す**（2026-08-25 修正）。
   */
  readonly block: Vector3;
  /** 引き寄せ中か */
  moving: boolean;
  /**
   * 引き寄せを始めた地点から引っ掛けた点へ向かう単位ベクトル。
   *
   * **通り過ぎたかどうかの基準。**
   * 引っ掛けた点を通り、この向きに垂直な面を境にする。
   * 面の向こう側へ出たら、それは「奥へ行った」ということ。
   */
  axis: Vector3;
  /** ほとんど動けていない tick 数。**壁に押し付けられた判定** */
  stuck: number;
  /** いまの目標の速さ（マス/tick）。**毎 tick 上がる** */
  speed: number;
  /** 切る判定に使う。**持ち物を切り替えたら切る** */
  slot: number;
  /**
   * 前の tick の位置。
   *
   * **通った跡に粒を置くため**（`docs/spec/13-grapple.md` 8-B）。
   * 1 tick に 1 つでは点にしかならない。
   */
  last?: Vector3;
}

/** プレイヤー id → ワイヤー。**メモリだけ** */
const wires = new Map<string, Wire>();

// ---------------------------------------------------------------- 小道具
const sub = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: Vector3): number => Math.hypot(v.x, v.y, v.z);

function norm(v: Vector3): Vector3 {
  const l = len(v);
  return l < 1e-6 ? { x: 0, y: 0, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * 向きを、プレイヤーが見ている側へ横にずらす。
 *
 * **縦は変えない。** 上下にずらすと、地面や天井へ突っ込む向きが変わって
 * 引き寄せそのものが成り立たなくなる。
 *
 * 左右どちらへずらすかは、**見ている向きが引きの左右どちら側にあるか**で決める。
 * 外積の符号がそのまま「どちら側か」を表す。
 */
function bend(dir: Vector3, deg: number, view: Vector3): Vector3 {
  const cross = dir.x * view.z - dir.z * view.x;
  if (cross === 0) return dir;

  // ---- **正面を向いているうちはずらさない**（docs/spec/13-grapple.md 9章）
  //
  // 水平だけで見た開き角。外積の大きさが sin にあたる
  const fh = Math.hypot(dir.x, dir.z);
  const vh = Math.hypot(view.x, view.z);
  if (fh < 1e-6 || vh < 1e-6) return dir;
  const open = Math.abs(cross) / (fh * vh);
  if (Math.asin(Math.min(1, open)) * (180 / Math.PI) < BEND_DEADZONE) return dir;
  const a = ((cross > 0 ? 1 : -1) * deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: dir.x * cos - dir.z * sin, y: dir.y, z: dir.x * sin + dir.z * cos };
}

/**
 * 向きを上へ起こす。**下を向いているときだけ。**
 *
 * 横向きは変えない。真下ちょうどで横が決まらないときは、
 * **見ている向き**へ倒す（`docs/spec/13-grapple.md` 8章）。
 */
function raise(dir: Vector3, deg: number, view: Vector3): Vector3 {
  if (dir.y >= 0) return dir;

  let h = Math.hypot(dir.x, dir.z);
  let hx = dir.x;
  let hz = dir.z;
  if (h < 1e-6) {
    // **真下。** 横向きが無いので、見ている向きを借りる
    const vh = Math.hypot(view.x, view.z);
    if (vh < 1e-6) return dir;
    hx = view.x;
    hz = view.z;
    h = vh;
  }

  // **水平より上には向けない**
  const next = Math.min(0, Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) + (deg * Math.PI) / 180);
  const cos = Math.cos(next);
  return { x: (hx / h) * cos, y: Math.sin(next), z: (hz / h) * cos };
}

/**
 * ワイヤーが出る場所。**視点そのもの。**
 *
 * 足元や胸から撃つと、**狙った所と刺さる所がずれる。**
 * 特に下を向いたときに手前の地面へ刺さり、
 * 「見えている壁に届かない」という理不尽になる。
 *
 * `getHeadLocation()` は目の位置を返す。**照準と完全に一致する。**
 */
function muzzle(player: Player): Vector3 {
  try {
    return player.getHeadLocation();
  } catch {
    const p = player.location;
    return { x: p.x, y: p.y + 1.62, z: p.z };
  }
}

function holdingGrapple(player: Player): boolean {
  try {
    const inv = player.getComponent("minecraft:inventory");
    const item = inv?.container?.getItem(player.selectedSlotIndex);
    return isGrappleItem(item?.typeId);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 引っ掛ける
/**
 * 引っ掛ける。
 *
 * **ガスは距離ぶん。** 外したら最大（15）。
 * 一番遠くまで撃ったのと同じ扱いにする。
 */
function attach(player: Player): void {
  const from = muzzle(player);
  let hitAt: Vector3 | undefined;
  /** 引っ掛けたブロックの座標。**ゲームが返したものをそのまま使う** */
  let hitBlock: Vector3 | undefined;
  try {
    // **プレイヤー専用の走査を使う**（2026-08-24 変更）。
    //
    // 以前は `dimension.getBlockFromRay` に目の位置と向きを渡していたが、
    // **ほとんど当たらなかった。**
    // 目の位置や向きの扱いを自分で組み立てるぶん、ずれる余地がある。
    //
    // `getBlockFromViewDirection` は「そのプレイヤーが見ている先」を
    // ゲーム側が出してくれる。**照準と必ず一致する。**
    const hit = player.getBlockFromViewDirection({ maxDistance: RANGE });
    if (hit !== undefined) {
      // ---- **ブロックの座標は計算し直さない**（2026-08-25 修正）
      //
      // 引っ掛けた点から割り出していたが、
      // **その点は面より手前へ引いてある**（`SURFACE_GAP`）ので、
      // 面の向きによって**隣の空気のマスを指していた。**
      //
      // 「x・z の + 方向で、壁 1 枚だと刺さらない」の正体はこれ。
      // 刺さった直後に「足場が無い」と判定されて切れていた
      hitBlock = { x: hit.block.x, y: hit.block.y, z: hit.block.z };
      // `faceLocation` はブロックの中での位置（0〜1）。足すと世界の座標になる
      const on = {
        x: hit.block.x + hit.faceLocation.x,
        y: hit.block.y + hit.faceLocation.y,
        z: hit.block.z + hit.faceLocation.z,
      };
      // **面より少し手前を狙う。**
      //
      // 面ちょうどだと、引っ掛けた点がブロックの中に見える
      //（2026-08-24 の「埋まってるところに当たってる」）。
      // 中を目指すぶん、たどり着けずに壁へ押し付け続けることにもなる
      const back = norm(sub(from, on));
      hitAt = {
        x: on.x + back.x * SURFACE_GAP,
        y: on.y + back.y * SURFACE_GAP,
        z: on.z + back.z * SURFACE_GAP,
      };
    }
  } catch {
    // 読み込まれていない
  }

  // ---- **ドローンにも刺さる**（docs/spec/23-drone.md 4-A）
  //
  // **動く的。** ブロックより手前に居るなら、そちらを取る。
  //
  // ---- **当たり判定は自分で見る**（2026-08-26 変更）
  //
  // `getEntitiesFromRay` はゲーム側の当たり判定を使うので、
  // **機体の実際の大きさ（0.9 x 0.4）でしか当たらない。**
  // 空を高速で動く小さな的に、25 マス先から線を当てるのは無理がある。
  //
  // **箱を 2 倍にして、こちらで交差を見る**（`DRONE_HIT`）
  let hitDrone: Entity | undefined;
  try {
    const reach = hitAt === undefined ? RANGE : len(sub(hitAt, from));
    const dir = player.getViewDirection();
    let nearest = Number.POSITIVE_INFINITY;
    for (const e of player.dimension.getEntities({
      type: DRONE_ENTITY,
      location: from,
      maxDistance: reach + DRONE_HIT.x + 1,
    })) {
      const t = rayBox(from, dir, e.location, reach);
      if (t === undefined || t >= nearest) continue;
      nearest = t;
      hitDrone = e;
    }
  } catch {
    /* 読み込まれていない */
  }

  // ---- **足りないなら撃たせない**（docs/spec/13-grapple.md 2章）
  //
  // 当たり外れを見る前に確かめる。**外しても撃った分は減る**が、
  // 「撃てたのに引けない」状態を作らない
  if (gasOf(player) < ATTACH_MIN) {
    bar(player, `§cガスが足りません §7(${Math.floor(gasOf(player))}/${ATTACH_MIN})`);
    return;
  }

  // **外しても当たっても同じ。** 距離では変えない
  const cost = hitAt === undefined && hitDrone === undefined ? MISS_COST : ATTACH_COST;
  if (!spendGas(player, cost)) {
    bar(player, `§cガスが足りません §7(${Math.floor(gasOf(player))}/${cost})`);
    return;
  }
  // ---- ドローンに刺さった
  if (hitDrone !== undefined) {
    let at: Vector3;
    try {
      at = hitDrone.location;
    } catch {
      player.playSound("random.click", { location: player.location });
      return;
    }
    wires.set(player.id, {
      at,
      target: hitDrone,
      block: { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) },
      moving: false,
      axis: norm(sub(at, from)),
      stuck: 0,
      speed: SPEED_START,
      slot: player.selectedSlotIndex,
    });
    player.playSound("random.bow", { location: player.location });

    // ---- **敵の機体なら、刺した 0.5 秒後に落ちる**（docs/spec/23-drone.md 4-A）
    //
    // **引いてからではなく、掛けた時点で**（2026-08-26 変更）。
    //
    // 引くまで落ちない形だと、**刺してから引かない**という選択が生まれ、
    // 「刺さっているのに何も起きない」時間ができていた。
    //
    // **味方の機体には何も起きない。** 足場として使える
    if (isEnemyDrone(player, hitDrone)) {
      const hostile = hitDrone;
      system.runTimeout(() => crashDrone(hostile), DRONE_CRASH_DELAY);
    }
    return;
  }

  if (hitAt === undefined || hitBlock === undefined) {
    player.playSound("random.click", { location: player.location });
    return;
  }

  wires.set(player.id, {
    at: hitAt,
    block: hitBlock,
    moving: false,
    axis: norm(sub(hitAt, from)),
    stuck: 0,
    speed: SPEED_START,
    slot: player.selectedSlotIndex,
  });
  player.playSound("random.bow", { location: player.location });
}

/**
 * 引き寄せを始める。
 *
 * **走り込んでから撃つと伸びる。**
 * いまの速度はゲーム側が持っているので、こちらで覚える必要が無い。
 */
function startPull(player: Player, wire: Wire): void {
  wire.moving = true;
  wire.speed = SPEED_START;
  // **引き寄せを始めた地点を基準にする。**
  // 引っ掛けてから歩き回っていることがあるので、ここで取り直す
  wire.axis = norm(sub(wire.at, muzzle(player)));
  // **最初の一蹴りだけは置き換える。**
  //
  // 加速度を足すだけだと、止まった状態から撃ったときに
  // 動き出しがもたつく。**踏み切りの分をここで与える**
  // **見ている側へずらす。** まっすぐ狙うと壁に叩きつけられる
  const dir = bend(norm(sub(wire.at, muzzle(player))), BEND_START, player.getViewDirection());
  // ---- **踏み切りも、下向きなら浮きを渡す**（2026-08-25 修正）
  //
  // ここだけ刺した点の向きをそのまま渡していたので、
  // **下に刺した瞬間だけ下へ蹴られていた。**
  // ジャンプ中に使うと、上へ跳んでいる速度がその 1 tick で置き換わり、
  // **一瞬だけ沈んで見えた**（docs/spec/13-grapple.md 8章）。
  //
  // 毎 tick 側（`step`）と同じ規則にする
  const kick = dir.y < 0 ? DOWN_KICK : dir.y * SPEED_START * KNOCK_SCALE;
  try {
    player.applyKnockback({ x: dir.x * SPEED_START * KNOCK_SCALE, z: dir.z * SPEED_START * KNOCK_SCALE }, kick);
  } catch {
    /* 消えている */
  }
  player.playSound("random.levelup", { location: player.location, pitch: 1.6, volume: 0.4 });
}

/**
 * 切る。
 *
 * **速度には触らない。**
 *
 * 引き寄せは毎 tick 速度を与えて作っているので、
 * **与えるのをやめた瞬間、そのままの勢いで飛んでいく。**
 * ここがこの道具の肝（`docs/spec/13-grapple.md` 1章）だが、
 * 何かを足す必要は無い。物理がそうなっている。
 */
function cut(player: Player, moving: boolean): void {
  if (!wires.delete(player.id)) return;
  // ---- **ワイヤーで浮いた印を付ける**（docs/spec/13-grapple.md 2章）
  //
  // 着地するまでガスが戻らない。**飛びながら次のぶんを溜めさせない**
  markFlying(player.id);
  if (!moving) return;
  // ---- **移動で終わったときだけ数える**（docs/spec/13-grapple.md 7章）
  //
  // **ここではまだ数え始めない。** 数えるのは**着地してから**
  airborne.add(player.id);
  try {
    player.playSound("random.break", { location: player.location, pitch: 1.8, volume: 0.5 });
  } catch {
    /* 消えている */
  }
}

/**
 * その機体は敵のものか。
 *
 * **味方の機体には何も起きない**（`docs/spec/23-drone.md` 4-A）。
 * 足場として使えるので、味方同士で邪魔にならない。
 */
function isEnemyDrone(player: Player, drone: Entity): boolean {
  const owner = droneOwner(drone);
  // **自分の機体には何もしない。** 足場として使える
  if (owner !== undefined && owner.id === player.id) return false;

  const mine = teamOf(player);
  const theirs = owner === undefined ? undefined : teamOf(owner);
  // ---- **どちらかに所属が無いなら、味方ではない**（2026-08-25 修正）
  //
  // 所属は試合中にしか無い（`docs/spec/11-match.md` 6-Y）。
  // 「所属が無いなら落とさない」にしていたので、
  // **試合をしていない間は、刺しても何も起きなかった。**
  if (mine === undefined || theirs === undefined) return true;
  return theirs !== mine;
}

/** 操作方向を世界の向きに直す。**前後左右のキー入力** */
function steerVector(player: Player): Vector3 {
  try {
    const m = player.inputInfo.getMovementVector();
    if (m.x === 0 && m.y === 0) return { x: 0, y: 0, z: 0 };
    const v = player.getViewDirection();
    // 視線の水平成分を前、その直交を右とする
    const f = norm({ x: v.x, y: 0, z: v.z });
    const r = { x: -f.z, y: 0, z: f.x };
    return { x: f.x * m.y + r.x * m.x, y: 0, z: f.z * m.y + r.z * m.x };
  } catch {
    return { x: 0, y: 0, z: 0 };
  }
}

/** 掛けた足場が無くなったか。**読めないときは「ある」ことにする** */
function gone(player: Player, wire: Wire): boolean {
  // ---- **実体に刺している場合は、その実体を見る**
  //
  // 動く的なので、ブロックの座標には意味が無い
  if (wire.target !== undefined) {
    try {
      // 読めれば生きている
      void wire.target.location;
      return false;
    } catch {
      return true;
    }
  }
  try {
    const b = player.dimension.getBlock(wire.block);
    if (b === undefined) return false;
    return b.isAir || b.isLiquid;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 毎 tick
function step(player: Player, wire: Wire): void {
  // ---- **動く的に付いていく**（docs/spec/23-drone.md 4-A）
  //
  // 刺した点をその場に固定すると、**機体だけ先に行ってしまう**
  if (wire.target !== undefined) {
    try {
      const at = wire.target.location;
      wire.at = { x: at.x, y: at.y, z: at.z };
    } catch {
      /* 消えている。`gone` が拾う */
    }
  }
  const here = muzzle(player);
  const toward = sub(wire.at, here);
  const dist = len(toward);

  // ---- 掛けた足場が無くなった（2026-08-25 追加）
  //
  // **壊された・消えた時点で外れる。**
  // 支柱は 5 秒で崩れる（`docs/spec/18-pillar.md` 4章）ので、
  // **掛けたまま消えることが普通に起きる。**
  //
  // 読めないときは切らない。**読み込まれていないだけ**のことがある
  if (gone(player, wire)) {
    cut(player, wire.moving);
    return;
  }

  // ---- 離れすぎたら切れる
  if (dist > RANGE + 2) {
    cut(player, wire.moving);
    return;
  }

  // ---- 持ち物を切り替えたら切る（docs/spec/13-grapple.md 3章）
  if (player.selectedSlotIndex !== wire.slot) {
    cut(player, wire.moving);
    return;
  }

  if (!wire.moving) return;

  // ---- ガス切れ
  if (drainGas(player, MOVE_COST_PER_TICK) <= 0) {
    cut(player, true);
    return;
  }

  // ---- 引っ掛けた点より奥へ行った
  //
  // **引っ掛けた点を通り、進んできた向きに垂直な面**を境にする。
  // その向こう側へ出たら、もう引き寄せではなく引き戻しになる。
  //
  // 放っておくと、行き過ぎた先から引き戻され、
  // **点の周りを行ったり来たりする。** 見た目も操作感も悪い
  const past = toward.x * wire.axis.x + toward.y * wire.axis.y + toward.z * wire.axis.z;
  // **円錐の外なら切る。** 180 度なら平面と同じ
  if (past < dist * Math.cos(((CUT_ANGLE / 2) * Math.PI) / 180)) {
    // **勢いは残す。** 通り過ぎたぶんだけ遠くへ飛べる
    cut(player, true);
    return;
  }

  // ---- 壁に当たって止まった
  //
  // **終点に着かなくても、壁に阻まれれば終わり。**
  // 押し付けたまま速度を与え続けると、めり込んだように見える。
  // 見た目が壊れるうえ、ガスも減り続ける
  let cur: Vector3 = { x: 0, y: 0, z: 0 };
  try {
    cur = player.getVelocity();
  } catch {
    /* 消えている */
  }
  wire.stuck = Math.hypot(cur.x, cur.y, cur.z) < STUCK_SPEED ? wire.stuck + 1 : 0;
  if (wire.stuck >= STUCK_TICKS) {
    cut(player, false);
    return;
  }

  // ---- 近づいたら切る
  //
  // **着くのを待たない。** 目の前まで引かれると勢いが壁に吸われる。
  // 手前で切れば、そのままの勢いで通り過ぎられる
  if (dist <= CLOSE_DIST) {
    cut(player, true);
    return;
  }

  // ---- 進む向き。**見ている側へずらす**（動き出しより浅い）
  let view: Vector3 = { x: 0, y: 0, z: 1 };
  try {
    view = player.getViewDirection();
  } catch {
    /* 消えている */
  }
  // **下向きは少し起こしてから引く**（docs/spec/13-grapple.md 8章）
  const pull = raise(bend(norm(toward), BEND_PULL, view), DOWN_RAISE, view);
  const steer = steerVector(player);

  // ---- 目標の速さは毎 tick 上がる
  wire.speed = Math.min(SPEED_MAX, wire.speed + PULL_ACCEL);

  // ---- **毎 tick、目標の速度をそのまま与える**
  //
  // ## いまの速度を混ぜない
  //
  // 「いまの速度に足す」形は捨てた（2026-08-24）。
  // 読み取った速度には重力も衝突も乗っているので、
  // **それを足し込むと値が毎 tick 揺れ、そのまま視点の揺れになる。**
  //
  // 目標だけから決めれば、向きも速さもなめらかに変わる。
  //
  // ## 間引かない
  //
  // 数 tick に 1 回に減らす形も捨てた。
  // **間の tick では重力で落ちる**ので、落ちて引き上げ、を繰り返す。
  // 下にがたつくのはこれが原因だった。
  //
  // 毎 tick 与えれば、**縦は常に目標のまま。** これが「重力を無視する」
  // **地面にいるうちは曲げない。**
  // 空中と同じだけ効かせると、地上を異常な速さで走れてしまう
  let onGround = false;
  try {
    onGround = player.isOnGround;
  } catch {
    /* 消えている */
  }
  const turn = onGround ? STEER_GROUND : STEER;

  // ---- **下向きも同じ式で引く**（docs/spec/13-grapple.md 8章）
  //
  // 下だけ別扱いにするのは全部やめた（2026-08-25）。
  //
  // | 試したこと | どうなったか |
  // | --- | --- |
  // | 引きを 1/4 に弱める | **計算しただけで、どこにも渡っていなかった** |
  // | 縦を 0 にする | 落ちない＝**上へ引かれているように感じる** |
  // | いまの落下速度を返す | **真下に刺すと少しずつ上がっていく** |
  //
  // **素直にワイヤーの向きへ引く。** 上へ引くときと同じにする
  const vx = (pull.x * wire.speed + steer.x * turn) * KNOCK_SCALE;
  const vy = pull.y * wire.speed * KNOCK_SCALE;
  const vz = (pull.z * wire.speed + steer.z * turn) * KNOCK_SCALE;

  try {
    player.applyKnockback({ x: vx, z: vz }, vy);
  } catch {
    cut(player, false);
  }
}

/**
 * 疾走感の粒を置く。
 *
 * 仕様は `docs/spec/13-grapple.md` 8-B。
 *
 * **速いときだけ、通った跡に置き去りにする。**
 * 常に出すとただの飾りになり、速さの合図として読めなくなる。
 */
function drawSlipstream(player: Player, wire: Wire): void {
  const now = player.location;
  const prev = wire.last;
  wire.last = { x: now.x, y: now.y, z: now.z };
  if (prev === undefined) return;

  const move = sub(now, prev);
  const dist = len(move);
  // **歩いているときには出さない**
  if (dist < SLIP_SPEED) return;

  const dir = norm(move);
  // 進む向きと直角な 2 本。**散らす向きを作る**
  const side = norm({ x: -dir.z, y: 0, z: dir.x });
  const up = {
    x: dir.y * side.z - dir.z * side.y,
    y: dir.z * side.x - dir.x * side.z,
    z: dir.x * side.y - dir.y * side.x,
  };

  const id = SLIP_PARTICLE[teamOf(player) ?? "blue"];
  const dim = player.dimension;
  for (let i = 0; i < SLIP_STEPS; i++) {
    // **前の位置と今の位置の間を埋める。** 速いほど長い線になる
    const t = i / SLIP_STEPS;
    const a = (Math.random() - 0.5) * 2 * SLIP_SPREAD;
    const b = (Math.random() - 0.5) * 2 * SLIP_SPREAD;
    try {
      dim.spawnParticle(id, {
        x: prev.x + move.x * t + side.x * a + up.x * b,
        y: prev.y + move.y * t + side.y * a + up.y * b + 1,
        z: prev.z + move.z * t + side.z * a + up.z * b,
      });
    } catch {
      /* 読み込まれていない */
    }
  }
}

/**
 * ワイヤーを見せる。
 *
 * **少し前から描き始める。** 目の位置から描くと、
 * 粒子が顔に張り付いて前が見えなくなる。
 */
/**
 * ワイヤーを見せる粒。**チームの色で出す。**
 *
 * **専用のものを作ってある**（`resource_packs/game/particles/wire*.json`）。
 *
 * バニラの粒はどれも**寿命が長く、通った跡が残り続ける**——
 * ワイヤーではなく**煙の帯**に見えていた（2026-08-25 の指摘）。
 *
 * バニラの寿命は変えられないので、**0.1 秒で消えるものを自分で定義した。**
 * 毎 tick 描き直しているので、**残らなくても線として見える。**
 *
 * **薄さは 2 色で揃えてある。** 色だけを入れ替えている
 *（`docs/spec/13-grapple.md` 8-A）。
 */
const WIRE_PARTICLE: Readonly<Record<Team, string>> = {
  red: "game:wire_red",
  blue: "game:wire",
};

/**
 * 引かれている間に置き去りにする粒。**チームの色。**
 *
 * 仕様は `docs/spec/13-grapple.md` 8-B。
 */
const SLIP_PARTICLE: Readonly<Record<Team, string>> = {
  red: "game:speed_red",
  blue: "game:speed",
};

/** これより速いときだけ出す（マス/tick）。**歩きでは出さない** */
const SLIP_SPEED = 0.5;

/**
 * 通った跡を何点に分けて埋めるか。
 *
 * **多いほど線に見えるが、多すぎると壁になる。**
 * 8 では出しすぎだった（2026-08-25 調整）。**粒の寿命を伸ばして数を減らす。**
 */
const SLIP_STEPS = 4;

/** 進む向きと直角にどれだけ散らすか（マス） */
const SLIP_SPREAD = 0.45;

/**
 * その人のワイヤーの色。
 *
 * **所属が無いなら水色**（ロビーで練習しているときなど）。
 * どちらの色でもないので、既定の側に倒す。
 */
function wireParticle(player: Player): string {
  const team = teamOf(player);
  return team === undefined ? WIRE_PARTICLE.blue : WIRE_PARTICLE[team];
}

function drawWire(player: Player, wire: Wire): void {
  const particle = wireParticle(player);
  const eye = muzzle(player);
  const v = player.getViewDirection();
  const from = { x: eye.x + v.x * 0.6, y: eye.y + v.y * 0.6, z: eye.z + v.z * 0.6 };
  const to = wire.at;
  const d = sub(to, from);
  const n = Math.max(2, Math.min(24, Math.ceil(len(d))));
  const dim = player.dimension;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    try {
      dim.spawnParticle(particle, {
        x: from.x + d.x * t,
        y: from.y + d.y * t,
        z: from.z + d.z * t,
      });
    } catch {
      /* 読み込まれていない */
    }
  }
}

/** ガスの残りを出す */
function showGas(player: Player): void {
  const g = Math.floor(gasOf(player));
  const filled = Math.round((g / GAS_MAX) * 20);
  const color = g >= RANGE ? "§b" : "§c";
  // **いちばん弱い優先度で出す**（docs/spec/13-grapple.md）。
  // 毎 tick 書くので、他の知らせを押し流してしまう
  bar(player, `${color}${"|".repeat(filled)}§8${"|".repeat(20 - filled)} §r${g}`, BAR.ambient, 2);
}

// ---------------------------------------------------------------- 登録
/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function startGrapple(): void {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const wire = wires.get(player.id);

      if (wire !== undefined) {
        step(player, wire);
        const still = wires.get(player.id);
        if (still !== undefined) {
          drawWire(player, still);
          // **引かれている間だけ。** 刺しただけでは出さない
          if (still.moving) drawSlipstream(player, still);
        }
      } else {
        // **使っていない間だけ回復する。**
        //
        // 引っ掛けたまま回復すると、ぶら下がって待つのが得になる。
        //
        // **ワイヤーを離れたあと、着地するまでは回復しない**
        //（docs/spec/13-grapple.md 2章）。
        // ここを止めないと、**飛びながら次のぶんが溜まり、降りずに繋ぎ続けられる。**
        //
        // 足が着いているかだけで見ていたが、
        // **走ってジャンプしただけで止まっていた**（2026-08-25 修正）
        let onGround = false;
        try {
          onGround = player.isOnGround;
        } catch {
          /* 消えている */
        }
        if (onGround) {
          land(player.id);
          // **コアを削れない時間も、ここから数え始める**（7章）
          landedForLock(player.id);
        }
        // **v2 で飛んでいる間も回復させない**（docs/spec/21-grapple-v2.md 5章）
        if (!isFlying(player.id) && !isBusy(player.id)) addGas(player, REGEN_PER_TICK);
      }

      if (holdingGrapple(player)) showGas(player);
    }
  }, 1);
}

/**
 * 右クリック。
 *
 * **未装着なら引っ掛け、装着中なら引き寄せ。**
 * ボタンを 1 つで済ませたい。持ち替えずに連続で操作できる。
 */
export function registerGrappleUse(): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (!isGrappleItem(ev.itemStack.typeId)) return;
    const player = ev.source;
    // ---- **ドローンを飛ばしている間は使えない**（docs/spec/23-drone.md 2 章）
    //
    // 飛んでいるのは**本人**なので、そのままだと空中でワイヤーが撃てる。
    // 見るための行動なので、**移動手段を重ねさせない**
    if (isFlyingDrone(player.id)) return;
    // **ロビーでも使える**（docs/spec/13-grapple.md 6章）。
    // これが動かせないと何もできないゲームなので、練習させたい
    const wire = wires.get(player.id);
    if (wire === undefined) {
      attach(player);
      return;
    }
    if (wire.moving) return;
    // **踏み切りに値段を付ける**（docs/spec/13-grapple.md 2章）
    if (!spendGas(player, PULL_START_COST)) {
      bar(player, `§cガスが足りません §7(${Math.floor(gasOf(player))}/${PULL_START_COST})`);
      return;
    }
    startPull(player, wire);
  });

  // ---- 切る操作は**持ち替えだけ**（docs/spec/13-grapple.md 3章）。
  // 毎 tick の見張り（step）が持ち物の枠を見ている

  // ---- 倒したらガスが回復する（docs/spec/13-grapple.md 2章）
  world.afterEvents.entityDie.subscribe((ev) => {
    const killer = ev.damageSource.damagingEntity;
    if (killer === undefined || killer.typeId !== "minecraft:player") return;
    if (ev.deadEntity.typeId !== "minecraft:player") return;
    addGas(killer as Player, KILL_GAS);
  });
}

/**
 * 届く距離を測る道具。
 *
 * **`/game:reach`。運営のみ。**
 *
 * ## なぜ要るのか
 *
 * **`maxDistance` に書いた数がそのまま届くとは限らない。**
 * ゲーム側の上限や、読み込まれていない区画で**手前で止まる**ことがある。
 *
 * 書いてある数と、**実際に当たった距離**を並べて出す。
 *
 * `/reload all` が要る（コマンドの登録はワールドロード時にしか走らない）。
 */
export function registerReachCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:reach",
      description: "見ている先のブロックまでの距離を測る（射程の確認）",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e as Player;
      const from = muzzle(player);
      const lines: string[] = [];
      // **射程そのものと、その倍を並べる。**
      // 25 で止まっているのか、もっと手前で止まっているのかを見分ける
      for (const max of [RANGE, RANGE * 2]) {
        let text = "当たらず";
        try {
          const hit = player.getBlockFromViewDirection({ maxDistance: max });
          if (hit !== undefined) {
            const on = {
              x: hit.block.x + hit.faceLocation.x,
              y: hit.block.y + hit.faceLocation.y,
              z: hit.block.z + hit.faceLocation.z,
            };
            text = `${hit.block.typeId} まで §f${len(sub(on, from)).toFixed(1)}§7 マス`;
          }
        } catch (err) {
          text = `§c読めない §8${String(err)}`;
        }
        lines.push(`§7上限 §f${max}§7 → ${text}`);
      }
      return { status: CustomCommandStatus.Success, message: lines.join("\n") };
    }
  );
}
