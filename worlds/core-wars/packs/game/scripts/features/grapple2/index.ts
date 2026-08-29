/**
 * ワイヤー射出装置 v2（円運動）。
 *
 * 仕様は `docs/spec/21-grapple-v2.md`。
 *
 * ## v1 と何が違うのか
 *
 * > **刺した点に引っ張られるのではない。視点の方向へ自分が加速する。**
 *
 * ワイヤーは**動力ではなく、曲げるもの。**
 * 押している間、視点の向きへ加速しつつ、刺した点へ**だんだん強く**引かれる。
 * 弱いうちはまっすぐ飛び、強くなるにつれて回り込み、最後は張り付く。
 *
 * ## 速度は自分で持つ
 *
 * **`player.getVelocity()` を毎 tick 読んで足す形は採らない。**
 * 読んだ値には重力も衝突も乗っていて、**足し込むと毎 tick 揺れる**
 *（v1 が通った道。`docs/spec/13-grapple.md`）。
 *
 * **こちらで速度を 1 つ持ち、毎 tick それを与える。**
 * 重力もこちらで足す——毎 tick 与える以上、ゲームの重力は上書きされる。
 *
 * ## 切るのは離したときだけ
 *
 * **近づいたら切る・角度を外れたら切るは持たない**（v1 との一番の違い）。
 * **いつ放すかが操作そのもの**なので、こちらで切ってはいけない。
 */

import { system, world, type Player, type Vector3 } from "@minecraft/server";

import { BAR, bar } from "../../lib/fx.js";
import { GAS_MAX, drainGas, gasOf, spendGas } from "../grapple/gas.js";
import { markFlying, setBusy } from "../grapple/busy.js";

/** この道具のアイテム */
export const GRAPPLE2_ITEM = "game:grapple_v2";

// ---------------------------------------------------------------- ガス
//
// **v1 と同じ値にする**（`docs/spec/21-grapple-v2.md` 4章）。
// 動きの違いだけを見たいので、値段は揃える。
//
// v1 の定数は外に出していないので、**ここにも書く。**
// 変えるときは両方を、というより**仕様書を正として**直す。

/** 刺すのに必要 */
const ATTACH_MIN = 10;

/** 刺すと減る */
const ATTACH_COST = 5;

/** 外したときに減る */
const MISS_COST = 10;

/** 動き始めに減る */
const PULL_START_COST = 5;

/** 動いている間、1 tick あたり */
const MOVE_COST_PER_TICK = 1;

// ---------------------------------------------------------------- 動き
//
// **速さは 1 tick あたりのマス数。** 1 秒 = 20 tick

/** 届く距離（マス）。**v1 と同じ** */
const RANGE = 25;

/**
 * 面からどれだけ手前に刺すか。
 *
 * **面ちょうどだと、点がブロックの中に見える**（v1 と同じ事情）。
 */
const SURFACE_GAP = 0.4;

/**
 * 視点の向きへの加速（マス/tick²）。
 *
 * **これが推進。** 見ている方へ進む力。
 *
 * 0.09 では**速すぎた**（2026-08-25 調整）。
 */
const ACCEL = 0.06;

/**
 * 出せる速さの上限（マス/tick）。
 *
 * 1.6（v1 の最高速より上）にしていたが、**全体に速すぎた**
 *（2026-08-25 調整）。**v1 の最高速より下**に落とした。
 *
 * ひもの拘束はこの上限より優先する。**縮むひもに追いつけなくなる**ため。
 */
const SPEED_MAX = 1.0;

/**
 * 推進が 0 になる距離（マス）。
 *
 * 仕様は `docs/spec/21-grapple-v2.md` 3-1。
 *
 * **ここから内側はワイヤー任せ。**
 * 手元まで来てから吹かせると、**張り付く直前に振り回される。**
 */
const PROPEL_NONE = 3;

/**
 * 推進が満額になる距離（マス）。
 *
 * `PROPEL_NONE` との間で真っ直ぐ減る。
 *
 * **この境目はまだ当てずっぽう。** 飛んでみて決める。
 */
const PROPEL_FULL = 12;

/**
 * 引きの強さ、推進に対する倍率。
 *
 * 仕様は `docs/spec/21-grapple-v2.md` 3 章。
 *
 * **推進（ガス）より強くする。**
 * 同じか弱いと、**吹かし続ければ振り切れてしまう。**
 * 強ければ、押している限り**必ず内側へ寄っていく。**
 */
const PULL_RATIO = 1.5;

/** 刺した点へ引かれる加速（マス/tick²） */
const PULL_ACCEL = ACCEL * PULL_RATIO;

/** ひもの最短（マス）。**ここまで縮んだら張り付き** */
const ROPE_MIN = 1.2;

/**
 * 与える値の倍率。
 *
 * **v1 と同じ理由**（`applyKnockback` に渡した値はそのままの速度にならない）。
 * 速さが足りない／出すぎるときは、まずここを動かす。
 */
const KNOCK_SCALE = 2.35;

/** ワイヤーの状態。**メモリだけ。** `/reload` で切れてよい */
interface Wire {
  /** 刺した点 */
  readonly at: Vector3;
  /** 刺したブロックの座標。**壊されたら切る** */
  readonly block: Vector3;
  /** 押している最中か */
  moving: boolean;
  /**
   * ひもの長さ（マス）。
   *
   * **押している間、少しずつ短くなる**（`docs/spec/21-grapple-v2.md` 3-3）。
   * これより外へは出られない。
   */
  rope: number;
  /** こちらで持っている速度 */
  vel: Vector3;
  /** 持ち替えを見る */
  slot: number;
}

const wires = new Map<string, Wire>();

// ---------------------------------------------------------------- 小道具
const sub = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: Vector3): number => Math.hypot(v.x, v.y, v.z);

function norm(v: Vector3): Vector3 {
  const l = len(v);
  return l < 1e-6 ? { x: 0, y: 0, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** ワイヤーが出る場所。**視点そのもの**（v1 と同じ理由で照準と合わせる） */
function muzzle(player: Player): Vector3 {
  try {
    return player.getHeadLocation();
  } catch {
    const p = player.location;
    return { x: p.x, y: p.y + 1.62, z: p.z };
  }
}

function holding(player: Player): boolean {
  try {
    const item = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
    return item?.typeId === GRAPPLE2_ITEM;
  } catch {
    return false;
  }
}

/** 刺した足場がまだあるか */
function gone(player: Player, wire: Wire): boolean {
  try {
    const b = player.dimension.getBlock(wire.block);
    if (b === undefined) return false;
    return b.isAir || b.isLiquid;
  } catch {
    // 読み込まれていない。**切らない**——読めないだけで消えたとは限らない
    return false;
  }
}

// ---------------------------------------------------------------- 刺す
function attach(player: Player): void {
  const from = muzzle(player);
  let at: Vector3 | undefined;
  let block: Vector3 | undefined;
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: RANGE });
    if (hit !== undefined) {
      block = { x: hit.block.x, y: hit.block.y, z: hit.block.z };
      const on = {
        x: hit.block.x + hit.faceLocation.x,
        y: hit.block.y + hit.faceLocation.y,
        z: hit.block.z + hit.faceLocation.z,
      };
      const back = norm(sub(from, on));
      at = {
        x: on.x + back.x * SURFACE_GAP,
        y: on.y + back.y * SURFACE_GAP,
        z: on.z + back.z * SURFACE_GAP,
      };
    }
  } catch {
    /* 読み込まれていない */
  }

  // **足りないなら撃たせない**（docs/spec/21-grapple-v2.md 4章）
  if (gasOf(player) < ATTACH_MIN) {
    bar(player, `§cガスが足りません §7(${Math.floor(gasOf(player))}/${ATTACH_MIN})`);
    return;
  }

  const cost = at === undefined ? MISS_COST : ATTACH_COST;
  if (!spendGas(player, cost)) {
    bar(player, `§cガスが足りません §7(${Math.floor(gasOf(player))}/${cost})`);
    return;
  }
  if (at === undefined || block === undefined) {
    player.playSound("random.click", { location: player.location });
    return;
  }

  wires.set(player.id, {
    at,
    block,
    moving: false,
    rope: 0,
    vel: { x: 0, y: 0, z: 0 },
    slot: player.selectedSlotIndex,
  });
  setBusy(player.id, true);
  player.playSound("random.bow", { location: player.location });
}

/**
 * 動き始める。
 *
 * **いまの速度から続ける。** 走り込んでから撃つと伸びる。
 */
function startMove(player: Player, wire: Wire): void {
  if (!spendGas(player, PULL_START_COST)) {
    bar(player, "§cガスが足りません");
    cut(player, false);
    return;
  }
  wire.moving = true;
  // **押した瞬間の距離が、ひもの長さ**（docs/spec/21-grapple-v2.md 3-2）
  wire.rope = Math.max(ROPE_MIN, len(sub(wire.at, muzzle(player))));
  try {
    const v = player.getVelocity();
    wire.vel = { x: v.x, y: v.y, z: v.z };
  } catch {
    wire.vel = { x: 0, y: 0, z: 0 };
  }
  player.playSound("game.levelup", { location: player.location, pitch: 1.6, volume: 0.4 });
}

/**
 * 外す。
 *
 * **速度には触らない。** 与えるのをやめた瞬間、そのままの勢いで飛んでいく。
 */
function cut(player: Player, moving: boolean): void {
  if (!wires.delete(player.id)) return;
  setBusy(player.id, false);
  // **着地するまでガスは戻らない**（docs/spec/13-grapple.md 2章）
  markFlying(player.id);
  if (!moving) return;
  try {
    player.playSound("random.break", { location: player.location, pitch: 1.8, volume: 0.5 });
  } catch {
    /* 消えている */
  }
}

/**
 * 1 tick 進める。
 *
 * **押している間だけ呼ばれる。**
 */
function step(player: Player, wire: Wire): void {
  // ---- 持ち替えた／足場が消えた
  if (player.selectedSlotIndex !== wire.slot || !holding(player) || gone(player, wire)) {
    cut(player, wire.moving);
    return;
  }
  if (!wire.moving) return;

  // ---- ガス
  if (drainGas(player, MOVE_COST_PER_TICK) <= 0) {
    bar(player, "§cガス切れ");
    cut(player, true);
    return;
  }

  const eye = muzzle(player);
  const toward = sub(wire.at, eye);
  const dist = len(toward);

  let view: Vector3 = { x: 0, y: 0, z: 1 };
  try {
    view = player.getViewDirection();
  } catch {
    cut(player, true);
    return;
  }

  const u = norm(toward);

  // ---- **推進は近づくほど弱まる**（docs/spec/21-grapple-v2.md 3-1）
  //
  // 3 マス以下で 0。**そこから内側はワイヤー任せ**にして、
  // 張り付く直前に振り回されないようにする
  const reach = Math.max(1e-6, PROPEL_FULL - PROPEL_NONE);
  const fade = Math.max(0, Math.min(1, (dist - PROPEL_NONE) / reach));
  const push = ACCEL * fade;

  // ---- 推進と引きを足す
  //
  // **推進は視点の向き。** ワイヤーの向きは関係しない。
  // **引きは推進より強い**（`PULL_RATIO`）ので、押している限り内側へ寄る。
  //
  // **重力は足さない**（docs/spec/21-grapple-v2.md 3-4）。
  // 毎 tick 速度を与える以上、ゲームの重力は上書きされている——
  // ここで足さなければ、かかっている間は落ちない
  let vx = wire.vel.x + view.x * push + u.x * PULL_ACCEL;
  let vy = wire.vel.y + view.y * push + u.y * PULL_ACCEL;
  let vz = wire.vel.z + view.z * push + u.z * PULL_ACCEL;

  // ---- **速さの上限。ひもより先に掛ける**
  //
  // 丸めるほうが後だと、**縮むひもに追いつけない**
  const speed = Math.hypot(vx, vy, vz);
  if (speed > SPEED_MAX) {
    const k = SPEED_MAX / speed;
    vx *= k;
    vy *= k;
    vz *= k;
  }

  // ---- **ひもの長さより遠くへは行けない**（docs/spec/21-grapple-v2.md 3-2）
  //
  // ばねとして引き戻す形は捨てた。**伸びて張り付かなかった**
  //（2026-08-25 の「紐伸びすぎかも」）。
  //
  // **ちょうど長さに来るのに必要な速さ**を出し、
  // 足りないぶんだけ足す。遠ざかる速度はこれで消える。
  // 残るのは**円に沿った速度だけ**——これが円運動
  if (dist > wire.rope) {
    const along = vx * u.x + vy * u.y + vz * u.z;
    const needed = dist - wire.rope;
    if (along < needed) {
      const add = needed - along;
      vx += u.x * add;
      vy += u.y * add;
      vz += u.z * add;
    }
  }

  wire.vel = { x: vx, y: vy, z: vz };

  // ---- **ひもは縮むだけ。伸びない**（docs/spec/21-grapple-v2.md 3-3）
  //
  // 近づいたら、その距離が新しい長さになる。
  // **一度詰めた分は戻らない**ので、振り戻されても外へは出られない
  wire.rope = Math.max(ROPE_MIN, Math.min(wire.rope, dist));

  try {
    player.applyKnockback({ x: vx * KNOCK_SCALE, z: vz * KNOCK_SCALE }, vy * KNOCK_SCALE);
  } catch {
    cut(player, true);
  }
}

/** ワイヤーを見せる */
function drawWire(player: Player, wire: Wire): void {
  const eye = muzzle(player);
  const v = player.getViewDirection();
  const from = { x: eye.x + v.x * 0.6, y: eye.y + v.y * 0.6, z: eye.z + v.z * 0.6 };
  const d = sub(wire.at, from);
  const n = Math.max(2, Math.min(24, Math.ceil(len(d))));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    try {
      // **粒は v1 と共通**（`resource_packs/game/particles/wire.json`）
      player.dimension.spawnParticle("game:wire", {
        x: from.x + d.x * t,
        y: from.y + d.y * t,
        z: from.z + d.z * t,
      });
    } catch {
      /* 読み込まれていない */
    }
  }
}

/** ガスの残りを足元の行に出す */
function showGas(player: Player): void {
  const g = Math.floor(gasOf(player));
  const filled = Math.round((g / GAS_MAX) * 20);
  const color = g >= ATTACH_MIN ? "§b" : "§c";
  bar(player, `${color}${"|".repeat(filled)}§8${"|".repeat(20 - filled)} §r${g} §8MkII`, BAR.ambient, 2);
}

/**
 * 押した／離したを受け取る。
 *
 * **トップレベルから呼ぶこと。**
 *
 * | | |
 * | --- | --- |
 * | 1 回目に押した | 刺す |
 * | 2 回目に押した | 動き出す |
 * | 離した | **外れる**（動いていたときだけ） |
 *
 * 単押しでも `itemStartUse` → `itemStopUse` と続けて飛ぶので、
 * **段はこちらで持つ**（`docs/research/12-item-hold.md`）。
 */
export function registerGrapple2(): void {
  world.afterEvents.itemStartUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== GRAPPLE2_ITEM) return;
    const player = ev.source;
    const wire = wires.get(player.id);
    if (wire === undefined) {
      attach(player);
      return;
    }
    if (!wire.moving) startMove(player, wire);
  });

  world.afterEvents.itemStopUse.subscribe((ev) => {
    // **アイテムは undefined になりうる**（docs/research/12-item-hold.md 3章）
    if (ev.itemStack?.typeId !== GRAPPLE2_ITEM) return;
    const player = ev.source;
    const wire = wires.get(player.id);
    if (wire === undefined) return;
    // **刺しただけの状態では外さない。** 1 回目を離しただけ
    if (!wire.moving) return;
    cut(player, true);
  });

  // **抜けた人を残さない。** 使用中の印が残るとガスが戻らなくなる
  world.afterEvents.playerLeave.subscribe((ev) => {
    wires.delete(ev.playerId);
    setBusy(ev.playerId, false);
  });
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startGrapple2(): void {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const wire = wires.get(player.id);
      if (wire !== undefined) {
        step(player, wire);
        const still = wires.get(player.id);
        if (still !== undefined) drawWire(player, still);
      }
      if (holding(player)) showGas(player);
    }
  }, 1);
}
