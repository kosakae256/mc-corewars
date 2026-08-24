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

import { system, world, type Player, type Vector3 } from "@minecraft/server";

import { isRunning } from "../../lib/match-state.js";
import { GAS_MAX, addGas, drainGas, gasOf, spendGas } from "./gas.js";

/** この道具のアイテム */
export const GRAPPLE_ITEM = "game:grapple";

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
 * 動き出しの速さ。**ダッシュの 2 倍くらい**（約 11 マス/秒）。
 *
 * 当初はダッシュジャンプと同じ（0.35）にしていたが、
 * **踏み出しがもたついた**（2026-08-24）。
 * 引っ掛けてから乗るまでの間は短いほうが気持ちよい。
 */
const SPEED_START = 0.85;

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

/** 移動中の消費。**1 秒あたり 10** */
const MOVE_COST_PER_TICK = 0.5;

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
 */
const KNOCK_SCALE = 2.35;

/** キルでの回復 */
export const KILL_GAS = 40;

// ---------------------------------------------------------------- 状態
interface Wire {
  /** 引っ掛けた点 */
  readonly at: Vector3;
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
  const a = ((cross > 0 ? 1 : -1) * deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: dir.x * cos - dir.z * sin, y: dir.y, z: dir.x * sin + dir.z * cos };
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
    return item?.typeId === GRAPPLE_ITEM;
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

  // **外したら固定。** 当たったら距離ぶん
  const cost = hitAt === undefined ? MISS_COST : Math.max(1, Math.ceil(len(sub(hitAt, from))));
  if (!spendGas(player, cost)) {
    player.onScreenDisplay.setActionBar(`§cガスが足りません §7(${Math.floor(gasOf(player))}/${cost})`);
    return;
  }
  if (hitAt === undefined) {
    player.playSound("random.click", { location: player.location });
    return;
  }

  wires.set(player.id, {
    at: hitAt,
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
  try {
    player.applyKnockback(
      { x: dir.x * SPEED_START * KNOCK_SCALE, z: dir.z * SPEED_START * KNOCK_SCALE },
      dir.y * SPEED_START * KNOCK_SCALE
    );
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
  if (!moving) return;
  try {
    player.playSound("random.break", { location: player.location, pitch: 1.8, volume: 0.5 });
  } catch {
    /* 消えている */
  }
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

// ---------------------------------------------------------------- 毎 tick
function step(player: Player, wire: Wire): void {
  const here = muzzle(player);
  const toward = sub(wire.at, here);
  const dist = len(toward);

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
  const pull = bend(norm(toward), BEND_PULL, view);
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

  const vx = (pull.x * wire.speed + steer.x * turn) * KNOCK_SCALE;
  const vy = pull.y * wire.speed * KNOCK_SCALE;
  const vz = (pull.z * wire.speed + steer.z * turn) * KNOCK_SCALE;

  // **下へ引くときは縦を触らない。**
  //
  // ノックバックの縦は上向きの想定で、
  // 負の値を渡しても素直に下がらない。
  // いまの縦をそのまま渡せば、**重力がそのまま効いて落ちていく。**
  // 地面へ引っ掛けたときに降りられなかったのはこれが原因
  const upDown = vy < 0 ? cur.y : vy;

  try {
    player.applyKnockback({ x: vx, z: vz }, upDown);
  } catch {
    cut(player, false);
  }
}

/**
 * ワイヤーを見せる。
 *
 * **少し前から描き始める。** 目の位置から描くと、
 * 粒子が顔に張り付いて前が見えなくなる。
 */
function drawWire(player: Player, wire: Wire): void {
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
      dim.spawnParticle("minecraft:balloon_gas_particle", {
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
  player.onScreenDisplay.setActionBar(`${color}${"|".repeat(filled)}§8${"|".repeat(20 - filled)} §r${g}`);
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
    const running = isRunning();
    for (const player of world.getAllPlayers()) {
      const wire = wires.get(player.id);

      // ---- 試合中でないなら動かさない（docs/spec/13-grapple.md 5-3）
      if (!running) {
        if (wire !== undefined) cut(player, false);
        continue;
      }

      if (wire !== undefined) {
        step(player, wire);
        const still = wires.get(player.id);
        if (still !== undefined) drawWire(player, still);
      } else {
        // **使っていない間、かつ足が着いている間だけ回復する。**
        //
        // 引っ掛けたまま回復すると、ぶら下がって待つのが得になる。
        // 空中でも回復すると、**飛びながら次のぶんが溜まり、
        // 降りずに繋ぎ続けられてしまう。**
        //
        // 一度地面に降りる、という区切りを作る
        let onGround = false;
        try {
          onGround = player.isOnGround;
        } catch {
          /* 消えている */
        }
        if (onGround) addGas(player, REGEN_PER_TICK);
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
    if (ev.itemStack.typeId !== GRAPPLE_ITEM) return;
    const player = ev.source;
    if (!isRunning()) return;
    const wire = wires.get(player.id);
    if (wire === undefined) attach(player);
    else if (!wire.moving) startPull(player, wire);
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
