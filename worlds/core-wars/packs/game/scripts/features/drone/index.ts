/**
 * ドローン。**飛ぶのは視点だけ。体は地上に残る。**
 *
 * 仕様は `docs/spec/23-drone.md`。
 *
 * ## なぜ本人を飛ばさないのか
 *
 * 本人を飛ばす形も作って動かした。**滑らかだった。**
 * それでも戻したのは、**例外が際限なく増える**から。
 *
 * > 本人が飛ぶと、**本人はゲームの中に居るまま**になる。
 * > 殴れる・拾える・ワイヤーが使える・ブロックが置ける——
 * > **止めたい行動を 1 つずつ潰して回る**ことになり、
 * > **これから足す機能すべてに「ただし飛んでいる間は」が付く。**
 *
 * 視点だけ飛ばせば、**本人は地上に立って動けないだけ。**
 *
 * ## 代わりに、視点はガタつく
 *
 * スクリプトは 1 秒に 20 回しか動けないので、
 * カメラの位置を渡す形では**必ず 20 回/秒で飛ぶ**
 *（`docs/research/13-scripted-camera.md`）。
 *
 * **向きは滑らか。ガタつくのは位置だけ。**
 *
 * ## 機体は速度で動かす
 *
 * `applyImpulse` は**いまの速度に足す**ので、
 * 狙った速度にするには**差分を足す**（`target - current`）。
 * 速度で動かせば**当たり判定はゲーム側が持つ。**
 *
 * ## 触るのは「動いている場所」だけ
 *
 * 視点と体の解除は、**必ず見張り（`system.runInterval`）の中で行う。**
 * 打ち消しの場（`beforeEvents`）からでは戻らなかった
 *（2026-08-25 の「右クリックだと戻ってこない」）。
 */

import {
  ButtonState,
  EntityDamageCause,
  GameMode,
  HudElement,
  HudVisibility,
  InputButton,
  InputPermissionCategory,
  Player,
  system,
  world,
  CommandPermissionLevel,
  CustomCommandStatus,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Entity,
  type Vector3,
} from "@minecraft/server";

import { BAR, bar, sound } from "../../lib/fx.js";
import { isOp } from "../../lib/op.js";
import { teamOf } from "../../lib/match-state.js";
import { roleOf } from "../../lib/roles.js";
import { gasOf, spendGas } from "../grapple/gas.js";
import { stickDart } from "../spotting/index.js";
import { markTntOwner } from "../special/tnt.js";
import { hideDroneMark, refreshDroneMark } from "./marker.js";

/** ドローンの実体 */
const DRONE = "game:drone";

/** 主のいない機体を探す間隔（tick）。**10 秒** */
const ORPHAN_SWEEP = 200;

/** 出すときに使うマナ（`docs/spec/24-role.md` 4-3） */
const SUMMON_COST = 50;

/**
 * 物を出すときに使うマナ。
 *
 * 仕様は `docs/spec/24-role.md` 4-3。
 *
 * **マナが間隔の代わり。** 高いものほど続けて出せない。
 */
const THROW_COST: Readonly<Record<string, number>> = {
  // **TNT は 30**（2026-08-28 変更。50 → 30）
  "minecraft:tnt": 30,
  "game:fire_charge": 15,
  "minecraft:snowball": 3,
  "game:pillar_shot": 10,
};

/** 一覧に無いものを出すときのマナ */
const THROW_DEFAULT = 5;

/** そのものを出すのに要るマナ */
export function droneThrowCost(item: string): number {
  return THROW_COST[item] ?? THROW_DEFAULT;
}

/** 遠隔操作のアイテム。**これが「その機体」を指す** */
const REMOTE = "game:drone_control";

/** カメラのプリセット。**位置を渡す形しか動かない**（research/13） */
const CAMERA = "minecraft:free";

/** 進む速さ（マス/tick） */
const SPEED = 0.32;

/** 上下の速さ（マス/tick） */
const LIFT = 0.24;

/** 出すときの、目の前からの距離（マス） */
const SPAWN_AHEAD = 1.5;

/** 降りるのに押し続ける長さ（tick）。**1 秒** */
const EXIT_HOLD = 20;

/**
 * 落とす／撃つの間隔（tick）。
 *
 * **押しっぱなしで連射させない。**
 * ブロックに向けた右クリックは**押している間ずっと届く**ので、
 * TNT が一瞬で全部消えていた（2026-08-25 修正）。
 */
const USE_COOLDOWN = 10;

/**
 * カメラを機体のどれだけ上に置くか（マス）。
 *
 * 実体の位置は**足元**なので、そのままだと床すれすれから見ることになる。
 */
const EYE = 0.35;

/**
 * カメラを機体のどれだけ前に置くか（マス）。
 *
 * **自分の機体が視界に入らないように。**
 * 実体を人ごとに隠す手が無いので、**カメラを機体の前へ出す。**
 */
const FRONT = 0.9;

/** ダーツの届く距離（マス）。**30 m**（2026-08-26 変更） */
const DART_RANGE = 30;

/** ダーツ 1 本に使うマナ。**5** */
const DART_COST = 5;

/**
 * ダーツを撃てるもの。**剣を持っているときだけ**（2026-08-26 決定）。
 *
 * 何を持っていても出ていたので、**撃つつもりのない右クリックでも飛んでいた。**
 * 撃つ物を決めておけば、**持ち替えが「撃つ構え」になる。**
 */
const DART_ITEMS: ReadonlySet<string> = new Set([
  "game:sword_wood",
  "game:sword_stone",
  "game:sword_iron",
  "game:sword_diamond",
]);

/**
 * ダーツの実体。**専用の投げ物**（2026-08-26 変更）。
 *
 * 雪玉を使っていたが、**当たると相手が吹き飛ぶ。**
 * かといって雪玉そのものを直すと、**店で売っている雪玉まで効かなくなる**
 * ——あちらは**弾き飛ばすために売っている。**
 *
 * | | |
 * | --- | --- |
 * | ノックバック | **無し** |
 * | 素のダメージ | **0**（1 は script で入れる） |
 * | 重力 | **無し**——30 マス先まで**まっすぐ飛ぶ** |
 */
const DART_ENTITY = "game:dart";

/** ダーツの印。**当たったときに見分ける** */
const DART_TAG = "cw:dart";

/**
 * ダーツの速さ（マス/tick）。**5。**
 *
 * `shoot()` に渡した速さは、**実体の `power` で頭打ちになる**らしい。
 * 雪玉（`power` 1.5）で撃っていたときは、**倍の値を渡しても遅いままだった。**
 * 専用の投げ物には**同じ 5 を書いてある**（`entities/dart.json`）。
 */
const DART_SPEED = 5;

/** ダーツが消えるまで（tick）。**速さで割って 30 マス分** */
const DART_LIFE = Math.ceil(DART_RANGE / DART_SPEED);

/** 機体からどれだけ先に出すか（マス） */
const DART_OFFSET = 0.6;

/**
 * ダーツの尾を引く粒（`resource_packs/game/particles/dart.json`）。
 *
 * **模型は出さない**（2026-08-26 変更）。
 *
 * 独自の実体は、**client_entity を書いても描かれないことがある。**
 * 矢の模型を借りたら**途中で横を向き**、
 * 動きの指定を外したら**何も見えなくなった。**
 *
 * > **見えることが目的なら、粒で描けばいい。**
 *
 * 向きの問題も、模型の粗さも、**そもそも起きない。**
 */
const DART_TRAIL = "game:dart_trail";

/** 1 tick の間に置く粒の数。**速いので、点が離れないように** */
const TRAIL_STEPS = 6;

/** 当たったときのダメージ。**1** */
const DART_DAMAGE = 1;

/** ダーツが刺さっている長さ（tick）。**1 分** */
const DART_TICKS = 60 * 20;

/** TNT のアイテム */
const TNT_ITEM = "minecraft:tnt";

/** ファイヤーチャージ（`features/special/firecharge`） */
const FIRE_ITEM = "game:fire_charge";

/** 待ち時間の目盛りの数。**ガスの半分**（隣に並べるので短くする） */
const CD_SEGMENTS = 10;

/** 着火した TNT の実体 */
const TNT_ENTITY = "minecraft:tnt";

/**
 * **自分の入口を持っているもの。**
 *
 * それぞれの機能が `afterEvents` で受け取り、
 * 出どころは `droneMuzzle` で機体に差し替えている。
 *
 * **ここで打ち消してはいけない**（2026-08-25 修正）。
 * 打ち消すと `afterEvents` が飛ばず、**何も出なくなる。**
 */
const SELF_HANDLED: ReadonlySet<string> = new Set([
  // ファイヤーチャージ（`features/special/firecharge`）
  "game:fire_charge",
  // 支柱弾（`features/pillar`）
  "game:pillar_shot",
]);

/**
 * ドローンから投げられるもの。
 *
 * **バニラの投げ物は本人の手から飛ぶ。**
 * 打ち消して、**機体の位置から同じものを飛ばす。**
 */
const THROWN: Readonly<Record<string, string>> = {
  "minecraft:snowball": "minecraft:snowball",
};

/**
 * ドローンからは使えないもの。
 *
 * **エンダーパールは飛べる場所を壊す。**
 * 空から投げれば、**どこへでも一瞬で入れてしまう。**
 */
const BANNED: ReadonlySet<string> = new Set(["minecraft:ender_pearl"]);

/** 投げる速さ */
const THROW_SPEED = 1.4;

/**
 * 視点を戻すコマンド。
 *
 * **API（`camera.clear()`）が効かない場面があった**
 *（アイテムは消えているのに視点が戻らない。2026-08-25）。
 *
 * **両方叩く。** どちらかが通れば戻る。
 */
const CMD_CAMERA_CLEAR = "camera @s clear";

/** 体の止めを解くコマンド。**API が投げたときの逃げ道** */
const CMD_MOVE_ON = "inputpermission set @s movement enabled";

/** 飛ばしている人 */
interface Flight {
  readonly drone: Entity;
}

const flying = new Map<string, Flight>();

/**
 * 降りたまま残っている機体。
 *
 * **降りても機体はその場に残る。** また使えばそこから再開できる。
 */
const parked = new Map<string, Entity>();

/**
 * 機体の id → 持ち主の id。
 *
 * **死んだ実体は突き合わせられない。**
 * 実体そのものを比べる形にしていたので、**落とされたことに気づけなかった**
 *（2026-08-25 修正）。id なら死んだ後でも照合できる。
 */
const owners = new Map<string, string>();

/** スニーク + ジャンプを押し続けている長さ（tick） */
const holding = new Map<string, number>();

/**
 * 降りる指示を受けた人。
 *
 * **見張りの中で処理する。**
 * 打ち消しの場から視点を戻そうとしても戻らなかったので、
 * **確実に動いている場所でだけ触る。**
 */
const wantExit = new Set<string>();

/**
 * 落ちたことが分かった人。
 *
 * **見張りの中で処理する**（`wantExit` と同じ理由）。
 *
 * 落とされるのは**見張りの外**（ワイヤーで引かれた 0.5 秒後、実体の死亡）なので、
 * そこから視点を戻そうとしても**戻らなかった**
 *（2026-08-25 の「グラップで落とされても視点が戻らない」）。
 */
const wantDown = new Set<string>();

/**
 * 体を止めた人。
 *
 * **飛んでいない人は必ず解除されている**——この決まりを保つための控え。
 *
 * 戻す経路が増えるたびに**どこかで取りこぼしていた**ので、
 * **見張りが毎 tick 突き合わせる**ことにした。
 * 経路を全部数え上げなくても、**ずれたら次の tick で直る。**
 */
const frozen = new Set<string>();

/**
 * 視点を返してほしい人。
 *
 * 仕様は `docs/spec/23-drone.md` 5-C。
 *
 * **誰でも使える逃げ道**（`/game:unstuck`）。
 * 飛んでいる記録が消えていても効くように、**飛行とは別に持つ。**
 */
const wantRelease = new Set<string>();

/**
 * 最後に使った tick。**種類ごとに持つ。**
 *
 * 鍵は `<プレイヤー id>:<種類>`。
 * **1 つにまとめると、TNT の待ち時間が雪玉まで止める。**
 */
const usedAt = new Map<string, number>();

/**
 * **その右クリックで画面を出してはいけないか。**
 *
 * 打ち消し（`ev.cancel`）は**バニラの動きを止めるだけ。**
 * 同じ出来事を見ている**別の購読はそのまま走る**ので、
 * 店やロールの村人は**打ち消しても開いていた**（2026-08-26 の指摘）。
 *
 * **開く側が、自分で見て降りる。**
 *
 * | | なぜ |
 * | --- | --- |
 * | 飛ばしている間 | カメラは空。**開いた画面がどこの話か分からない** |
 * | 遠隔装置を持っている | **その右クリックは機体を上げる操作**。店の用ではない |
 */
export function droneUiBlocked(player: Player, itemId: string | undefined): boolean {
  return itemId === REMOTE || flying.has(player.id);
}

export function isFlyingDrone(playerId: string): boolean {
  return flying.has(playerId);
}

function norm(v: Vector3): Vector3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < 1e-6 ? { x: 0, y: 0, z: 1 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** 角度から向きを作る */
function facing(pitch: number, yaw: number): Vector3 {
  const p = (pitch * Math.PI) / 180;
  const y = (yaw * Math.PI) / 180;
  return { x: -Math.cos(p) * Math.sin(y), y: -Math.sin(p), z: Math.cos(p) * Math.cos(y) };
}

/**
 * 視点と体を返す。
 *
 * **別々に試す。** まとめて 1 つの `try` に入れていたので、
 * **カメラの解除で失敗すると、体の解除まで飛ばされていた**（2026-08-25 修正）。
 */
function release(player: Player): void {
  frozen.delete(player.id);

  // ---- **2 通りで試す**（2026-08-25 追加）
  //
  // `camera.clear()` が効かない場面があった
  //（アイテムは消えているのに視点が戻らない）。
  //
  // **コマンドの側も叩く。** どちらかが通れば戻る。
  // 二重に呼んでも害は無い——どちらも「既定へ戻す」だけ
  let why = "";
  try {
    player.camera.clear();
  } catch (e) {
    why = String(e);
  }
  try {
    // **API が効かない場面があるので、コマンドでも叩く**（上記）
    player.runCommand(CMD_CAMERA_CLEAR);
  } catch (e) {
    if (why === "") why = String(e);
  }

  try {
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true);
  } catch {
    try {
      // **API が投げたときの逃げ道**（上記と同じ理由）
      player.runCommand(CMD_MOVE_ON);
    } catch {
      /* 消えている */
    }
  }

  // **黙って諦めない。** 戻らない理由が分からないのが一番困る
  if (why !== "") {
    try {
      player.sendMessage(`§c視点を戻せませんでした §7${why}`);
    } catch {
      /* 消えている */
    }
  }
}

/** 押しっぱなしを落とす間隔（tick）。**0.3 秒** */
const HOLD_GUARD = 6;

/** 出入りを落とす間隔（tick）。**0.5 秒** */
const TOGGLE_GUARD = 10;

/**
 * **押しっぱなしを 1 回に潰す。**
 *
 * **間隔（CT）は廃止した**（2026-08-26。`docs/spec/24-role.md` 4-3）。
 * **マナがその役をする**——高いものほど続けて出せない。
 *
 * これは CT ではない。**同じ 1 押しを 1 回に数えるための仕掛け。**
 *
 * ブロックを向けた右クリックは、**押している間ずっと届き続ける**
 *（`docs/research/12-item-hold.md`）。同じ tick だけ落としていたが、
 * それでは足りなかった（2026-08-26 の指摘）:
 *
 * - **TNT が押している間だけ何発も出る**
 * - **入った直後に出る**——入口も出口も同じ右クリックなので、
 *   少し長く押しただけで**入って、すぐ戻ってくる**
 *
 * 押しっぱなしと連打を分けられれば良いが、
 * **`InputButton` に「使う」は無い**（Jump と Sneak だけ）。
 * 時間で分ける——人の連打は 0.3 秒より速くはならない。
 */
function pressOnce(player: Player, guard: number): boolean {
  const now = system.currentTick;
  const last = usedAt.get(player.id);
  if (last !== undefined && now - last < guard) return false;
  usedAt.set(player.id, now);
  return true;
}

/** その人の待ち時間を全部忘れる。**降りたら持ち越さない** */
function clearCooldowns(playerId: string): void {
  for (const key of [...usedAt.keys()]) {
    if (key.startsWith(`${playerId}:`)) usedAt.delete(key);
  }
}

/**
 * 遠隔操作のアイテムを取り上げる。
 *
 * **機体が死ねば、操作するものが無くなる**（`docs/spec/23-drone.md` 5-B）。
 */
function takeRemote(player: Player): void {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (c === undefined) return;
    for (let i = 0; i < c.size; i++) {
      if (c.getItem(i)?.typeId !== REMOTE) continue;
      c.setItem(i, undefined);
      return;
    }
  } catch {
    /* 消えている */
  }
}

/**
 * 物を出す場所。**飛ばしていないなら undefined。**
 *
 * ファイヤーチャージも投げ物も、**本人ではなく機体から出す。**
 * 本人は地上に立っているので、そのままだと**足元から出てしまう。**
 */
export function droneMuzzle(player: Player): Vector3 | undefined {
  const f = flying.get(player.id);
  if (f === undefined) return undefined;
  try {
    const at = f.drone.location;
    const v = player.getViewDirection();
    // **カメラと同じ場所から出す。** 機体の中から出ると、自分に当たる
    return { x: at.x + v.x * FRONT, y: at.y + EYE + v.y * FRONT, z: at.z + v.z * FRONT };
  } catch {
    return undefined;
  }
}

/**
 * その人の機体と操作アイテムを、まとめて消す。
 *
 * 仕様は `docs/spec/24-role.md` 2-3。
 *
 * **ロールを変えた・抜けた**ときに呼ぶ。
 *
 * > 置いてきた機体が**主のいないまま残る**と、
 * > 誰も操れない的が盤面に増えるだけになる。
 */
export function removeDroneById(playerId: string): void {
  // ---- 飛んでいる最中なら、まず視点を返す
  if (flying.has(playerId)) {
    wantRelease.add(playerId);
    const f = flying.get(playerId);
    if (f !== undefined) {
      try {
        owners.delete(f.drone.id);
        f.drone.remove();
      } catch {
        /* 既に消えている */
      }
    }
    flying.delete(playerId);
  }

  // ---- 置いてきた機体
  const left = parked.get(playerId);
  if (left !== undefined) {
    try {
      owners.delete(left.id);
      left.remove();
    } catch {
      /* 既に消えている */
    }
    parked.delete(playerId);
  }

  hideDroneMark(playerId);
  clearCooldowns(playerId);

  // ---- 操作アイテムも取り上げる
  const player = world.getAllPlayers().find((p) => p.id === playerId);
  if (player !== undefined) takeRemote(player);
}

/** 同じことを、その人から */
export function removeDroneOf(player: Player): void {
  removeDroneById(player.id);
}

/**
 * その機体の持ち主。**分からなければ undefined。**
 *
 * 刺してよいか（敵か味方か）を決めるのに使う（`features/grapple`）。
 */
export function droneOwner(drone: Entity): Player | undefined {
  try {
    const pilotId = owners.get(drone.id);
    if (pilotId === undefined) return undefined;
    return world.getAllPlayers().find((p) => p.id === pilotId);
  } catch {
    return undefined;
  }
}

/**
 * その人の機体が落ちた。
 *
 * **操縦中なら戻す。置いてきた機体なら、印だけ片付ける。**
 * どちらでもアイテムは失う（`docs/spec/23-drone.md` 5-B）。
 */
function downed(pilotId: string): void {
  // **機体ごと失う。** 待ち時間も一緒に捨てる
  //（買い直した機体が、前の機体の待ちを引き継がないように）
  clearCooldowns(pilotId);
  const player = world.getAllPlayers().find((p) => p.id === pilotId);
  if (flying.has(pilotId)) {
    if (player !== undefined) recall(player, true);
    return;
  }
  parked.delete(pilotId);
  hideDroneMark(pilotId);
  if (player === undefined) return;
  // ---- **操作アイテムは残す**（2026-08-26 変更 / `docs/spec/24-role.md` 4-3）
  //
  // ドローンは**買うものではなく、ロールに付いてくるもの**になった。
  // 落とされてアイテムまで失うと、
  // **その試合の残りずっと、ロールの中身が空になる。**
  //
  // **機体は失う。** 出し直すマナも要る。そこが代償
  bar(player, "§cドローンが落とされた", BAR.important, 60);
}

/**
 * その機体を落とす。
 *
 * 仕様は `docs/spec/23-drone.md` 4-A。
 * **敵にワイヤーを刺されて引かれると落ちる。**
 *
 * @returns 落としたか（持ち主が分からなければ false）
 */
export function crashDrone(drone: Entity): boolean {
  let id: string;
  try {
    id = drone.id;
  } catch {
    return false;
  }
  const pilotId = owners.get(id);
  if (pilotId === undefined) return false;
  owners.delete(id);
  if (!flying.has(pilotId)) {
    try {
      drone.remove();
    } catch {
      /* 既に消えている */
    }
  }
  // **ここでは戻さない。** 見張りが拾う（`wantDown` の説明）
  wantDown.add(pilotId);
  return true;
}

/** 飛ばし始める。**入れなかった理由を返す**（入れたら undefined） */
export function launch(player: Player): string | undefined {
  // ---- **Engineer だけが使える**（`docs/spec/24-role.md` 4-3）
  if (!roleOf(player).drone) return `§c${roleOf(player).name} はドローンを使えません`;

  // ---- **召喚にマナが要る**
  //
  // 出しっぱなしにできると、**上げる判断が要らなくなる。**
  // 落とされたときの損も、マナで払わせる
  if (!parked.has(player.id) && !spendGas(player, SUMMON_COST)) {
    return `§cマナが足りません §7(${Math.floor(gasOf(player))}/${SUMMON_COST})`;
  }
  if (flying.has(player.id)) return undefined;

  let eye: Vector3;
  let rot: { x: number; y: number };
  try {
    eye = player.getHeadLocation();
    rot = player.getRotation();
  } catch {
    return "§c出せませんでした";
  }
  const dir = facing(rot.x, rot.y);

  // ---- **置いてきた機体があるなら、そこから再開する**（docs/spec/23-drone.md 5-B）
  //
  // 出し直すと、**見張りに置いてきた意味が無くなる**
  let drone = parked.get(player.id);
  let at: Vector3 = { x: eye.x + dir.x * SPAWN_AHEAD, y: eye.y + dir.y * SPAWN_AHEAD, z: eye.z + dir.z * SPAWN_AHEAD };
  if (drone !== undefined) {
    try {
      at = drone.location;
    } catch {
      // 消えていた（誰かに壊された）。**新しく出す**
      drone = undefined;
    }
  }

  if (drone === undefined) {
    try {
      drone = player.dimension.spawnEntity(DRONE, at);
    } catch {
      return "§c出せませんでした §7(読み込まれていません)";
    }
  }
  parked.delete(player.id);

  flying.set(player.id, { drone });
  holding.delete(player.id);
  wantExit.delete(player.id);
  try {
    owners.set(drone.id, player.id);
  } catch {
    /* 読めない。見張りが拾う */
  }

  frozen.add(player.id);
  try {
    // **体を止める。** 立ったまま無防備になる（docs/spec/23-drone.md 2 章）
    player.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false);
    player.camera.setCamera(CAMERA, {
      location: { x: at.x + dir.x * FRONT, y: at.y + EYE + dir.y * FRONT, z: at.z + dir.z * FRONT },
      facingLocation: {
        x: at.x + dir.x * (FRONT + 1),
        y: at.y + EYE + dir.y * (FRONT + 1),
        z: at.z + dir.z * (FRONT + 1),
      },
    });
  } catch {
    /* 動かなかった。見張りの中で分かる */
  }
  bar(player, "§b操縦中 §7(スニーク+ジャンプ 1 秒 / ドローンを右クリックで降りる)", BAR.notice, 60);
  return undefined;
}

/**
 * 戻す。
 *
 * @param lost **落とされたなら true。** 機体もアイテムも失う
 */
export function recall(player: Player, lost = false): void {
  const f = flying.get(player.id);
  if (f === undefined) return;
  flying.delete(player.id);
  holding.delete(player.id);
  wantExit.delete(player.id);
  wantDown.delete(player.id);
  hideDroneMark(player.id);

  if (lost) {
    // **落とされた。** 機体もアイテムも終わり（docs/spec/23-drone.md 5-B）
    try {
      owners.delete(f.drone.id);
      f.drone.remove();
    } catch {
      /* 既に消えている */
    }
    // **操作アイテムは残す**（上記と同じ理由）
  } else {
    // **降りただけ。** 機体はその場に残す
    parked.set(player.id, f.drone);
    try {
      owners.set(f.drone.id, player.id);
      f.drone.clearVelocity();
    } catch {
      /* 消えている */
    }
  }

  // **視点と体を返す。** どちらか片方だと、動けないまま取り残される
  release(player);

  if (lost) bar(player, "§cドローンが落とされた", BAR.important, 60);
  else bar(player, "§7降りた §7(また使うとそこから)", BAR.notice, 40);
}

/** TNT を機体の下へ落とす。**投げない**（上から落とすのがこの道具の役） */
function dropTnt(player: Player, at: Vector3): void {
  // **物を出すときもマナを使う**（`docs/spec/24-role.md` 4-3）
  if (!spendGas(player, droneThrowCost(TNT_ITEM))) {
    bar(player, "§cマナが足りません", BAR.notice, 20);
    return;
  }
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (c === undefined) return;
    const slot = player.selectedSlotIndex;
    const it = c.getItem(slot);
    if (it?.typeId !== TNT_ITEM) return;
    if (it.amount <= 1) c.setItem(slot, undefined);
    else {
      it.amount -= 1;
      c.setItem(slot, it);
    }
  } catch {
    return;
  }
  try {
    const tnt = player.dimension.spawnEntity(TNT_ENTITY, { x: at.x, y: at.y - 0.5, z: at.z });
    // **落とした人を覚えておく。** 味方を巻き込まない（`features/combat`）
    markTntOwner(tnt, player, "drone");
    // **導火線は `features/special/tnt` が握る**（着地してから 6 秒）

    player.playSound("random.fuse", { location: player.location });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 画面の表示を戻す。
 *
 * 仕様は `docs/spec/23-drone.md` 2 章。
 *
 * **カメラを移している間、体力も経験値も隠れる。**
 * 飛ばしている間こそ、**自分が削られていることに気づける必要がある。**
 *
 * **持ち物の帯は戻さない。** 手元は使えないので、出しても意味が無い。
 */
function showHud(player: Player): void {
  try {
    player.onScreenDisplay.setHudVisibility(HudVisibility.Reset, [
      HudElement.Health,
      HudElement.ProgressBar,
      HudElement.StatusEffects,
      HudElement.Armor,
    ]);
  } catch {
    /* 消えている */
  }
}

/** 機体から投げる。**1 個減らしてから飛ばす** */
function throwFrom(player: Player, at: Vector3, item: string, entity: string): void {
  // **物を出すときもマナを使う**（`docs/spec/24-role.md` 4-3）
  if (!spendGas(player, droneThrowCost(item))) {
    bar(player, "§cマナが足りません", BAR.notice, 20);
    return;
  }
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (c === undefined) return;
    const slot = player.selectedSlotIndex;
    const it = c.getItem(slot);
    if (it?.typeId !== item) return;
    if (it.amount <= 1) c.setItem(slot, undefined);
    else {
      it.amount -= 1;
      c.setItem(slot, it);
    }
  } catch {
    return;
  }
  try {
    const v = player.getViewDirection();
    const e = player.dimension.spawnEntity(entity, at);
    const proj = e.getComponent("minecraft:projectile");
    if (proj !== undefined) {
      proj.owner = player;
      proj.shoot({ x: v.x * THROW_SPEED, y: v.y * THROW_SPEED, z: v.z * THROW_SPEED });
    }
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * ダーツを撃つ。
 *
 * 仕様は `docs/spec/23-drone.md` 4 章。
 *
 * ## 見えない当たり判定はやめた（2026-08-26 変更）
 *
 * 視線と相手の距離で決めていたので、**撃ったことが分からなかった。**
 * 音も、飛ぶものも、外れた理由も無い。
 *
 * > **速い投げ物にする。**
 * > 飛んでいくものが見えれば、**当たったかどうかは目で分かる。**
 *
 * 実体は雪玉。**当たっても素の damage は 0** なので、
 * こちらで **1 だけ**入れて、名札を貼る（`onDartHit`）。
 */
function shootDart(player: Player, from: Vector3): void {
  // **撃つ前に払う。** 当たっても外しても同じだけ減る
  if (!spendGas(player, DART_COST)) {
    bar(player, "§cマナが足りない §7ダーツ 5", BAR.important, 30);
    return;
  }

  try {
    const v = player.getViewDirection();
    // **機体より少し先から出す。** 出た瞬間に足元へ当たらないように
    const muzzle = { x: from.x + v.x * DART_OFFSET, y: from.y + v.y * DART_OFFSET, z: from.z + v.z * DART_OFFSET };
    const e = player.dimension.spawnEntity(DART_ENTITY, muzzle);
    e.addTag(DART_TAG);
    const proj = e.getComponent("minecraft:projectile");
    if (proj !== undefined) {
      proj.owner = player;
      proj.shoot({ x: v.x * DART_SPEED, y: v.y * DART_SPEED, z: v.z * DART_SPEED });
    }
    // ---- **尾を引かせて、30 マスで落とす**（4 章）
    //
    // 1 tick に 5 マス進むので、**点だけ置くと線に見えない。**
    // **前の位置から今の位置まで**を埋める
    const dim = player.dimension;
    let prev: Vector3 = muzzle;
    let left = DART_LIFE;
    const trail = system.runInterval(() => {
      let at: Vector3 | undefined;
      try {
        at = e.location;
      } catch {
        at = undefined;
      }
      if (at !== undefined) {
        for (let i = 1; i <= TRAIL_STEPS; i++) {
          const t = i / TRAIL_STEPS;
          try {
            dim.spawnParticle(DART_TRAIL, {
              x: prev.x + (at.x - prev.x) * t,
              y: prev.y + (at.y - prev.y) * t,
              z: prev.z + (at.z - prev.z) * t,
            });
          } catch {
            /* 読み込まれていない */
          }
        }
        prev = at;
      }
      left -= 1;
      // **消えたか、届く距離を過ぎたら終わり**
      if (at === undefined || left <= 0) {
        system.clearRun(trail);
        try {
          e.remove();
        } catch {
          /* もう無い */
        }
      }
    }, 1);
  } catch {
    bar(player, "§7ダーツ  撃てなかった", BAR.notice, 20);
    return;
  }

  sound(player, "random.bow", 1.6, 0.9);
  bar(player, "§b→ ダーツ §7(-5)", BAR.notice, 20);
}

/**
 * ダーツが当たった。
 *
 * **雪玉そのものは何もしない。** 効くのはここで入れる分だけ。
 */
function onDartHit(shooter: Player, victim: Player): void {
  // ---- **自分には当たらない**（2026-08-26 修正）
  //
  // 体は地上に置いたまま、機体から撃つ。
  // **機体が自分の真上に居ると、自分の雪玉が自分に落ちてくる。**
  if (victim.id === shooter.id) return;

  // **味方には効かない**（刺しても意味が無い）
  const mine = teamOf(shooter);
  if (mine !== undefined && teamOf(victim) === mine) return;

  stickDart(victim.id, DART_TICKS);
  try {
    victim.applyDamage(DART_DAMAGE, {
      cause: EntityDamageCause.projectile,
      damagingEntity: shooter,
    });
  } catch {
    /* 消えている */
  }
  sound(shooter, "random.bowhit", 1.8, 0.9);
  bar(shooter, `§b${victim.name}§r§b に刺した §7(1 分)`, BAR.notice, 30);
}

/**
 * ダーツが機体に当たった。
 *
 * **機体は体力 1。** 刺されば落ちる（`docs/spec/23-drone.md` 5-A）。
 * **味方の機体には効かない**（`features/protection` と同じ考え方）。
 */
function onDartDrone(shooter: Player, drone: Entity): void {
  const pilot = droneOwner(drone);
  if (pilot === undefined) return;
  if (pilot.id === shooter.id) return;
  const mine = teamOf(shooter);
  if (mine !== undefined && teamOf(pilot) === mine) return;

  try {
    drone.applyDamage(DART_DAMAGE, {
      cause: EntityDamageCause.projectile,
      damagingEntity: shooter,
    });
  } catch {
    return;
  }
  sound(shooter, "random.bowhit", 1.8, 0.9);
  bar(shooter, "§b敵のドローンを落とした", BAR.notice, 30);
}

/**
 * 飛んでいる間に右クリックされた。
 *
 * **持っているもので何をするかが変わる**（`docs/spec/23-drone.md` 4・5 章）。
 *
 * | 持ち物 | すること |
 * | --- | --- |
 * | ドローン | **降りる** |
 * | TNT | 機体の下へ落とす |
 * | エンダーパール | **使わせない** |
 * | 投げ物（雪玉など） | 機体の前から飛ばす |
 * | それ以外 | **ダーツ** |
 */
function handleUse(player: Player, id: string | undefined, cancel: () => void): void {
  const at = droneMuzzle(player);
  if (at === undefined) return;

  // ---- **自分の入口を持っているものは、そのまま通す**（2026-08-25 修正）
  //
  // 打ち消すと `afterEvents` が飛ばないので、**何も出なくなっていた。**
  // どちらも独自アイテムなので、通してもバニラの動きは起きない
  if (id !== undefined && SELF_HANDLED.has(id)) return;

  // **体では何も触らせない**（箱を開ける・ブロックを置く、を止める）
  cancel();
  if (id === undefined) return;

  if (id === REMOTE) {
    // **押しっぱなしでは戻さない。** 入った直後に出てしまう
    if (!pressOnce(player, TOGGLE_GUARD)) return;
    // **ここでは戻さない。** 見張りが拾う（`wantExit` の説明）
    wantExit.add(player.id);
    return;
  }
  if (id === TNT_ITEM) {
    if (pressOnce(player, HOLD_GUARD)) system.run(() => dropTnt(player, at));
    return;
  }
  if (BANNED.has(id)) {
    bar(player, "§cドローンからは使えません", BAR.notice, 20);
    return;
  }
  const entity = THROWN[id];
  if (entity !== undefined) {
    if (pressOnce(player, HOLD_GUARD)) system.run(() => throwFrom(player, at, id, entity));
    return;
  }
  // ---- **ダーツは剣を持っているときだけ**（2026-08-26 決定）
  if (!DART_ITEMS.has(id)) {
    bar(player, "§7剣を持つとダーツを撃てる", BAR.ambient, 20);
    return;
  }
  if (pressOnce(player, HOLD_GUARD)) system.run(() => shootDart(player, at));
}

/** 1 tick 進める */
function step(player: Player, f: Flight): void {
  let rot = { x: 0, y: 0 };
  let move = { x: 0, y: 0 };
  let up = false;
  let down = false;
  try {
    rot = player.getRotation();
    move = player.inputInfo.getMovementVector();
    up = player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    down = player.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
  } catch {
    recall(player, true);
    return;
  }

  // ---- **スニーク + ジャンプを 1 秒で降りる**（docs/spec/23-drone.md 5-B）
  //
  // どちらも飛ぶのに使うので、**片方だけだと動かしている最中に降りてしまう。**
  if (up && down) {
    const held = (holding.get(player.id) ?? 0) + 1;
    holding.set(player.id, held);
    if (held >= EXIT_HOLD) {
      recall(player);
      return;
    }
    bar(player, `§7降りる… §f${Math.ceil((EXIT_HOLD - held) / 20)}`, BAR.notice, 5);
  } else {
    holding.delete(player.id);
  }

  // 視点の向き。**カメラの向きに使う**
  const fwd = facing(rot.x, rot.y);
  // ---- **進むのは水平だけ。** 上下はボタンで決める（歩くのと同じ）
  const flat = facing(0, rot.y);
  const right = norm({ x: -flat.z, y: 0, z: flat.x });
  // **横の入力は左が正**（`getMovementVector`）
  const side = -move.x;

  const vx = (flat.x * move.y + right.x * side) * SPEED;
  const vy = (up ? LIFT : 0) - (down ? LIFT : 0);
  const vz = (flat.z * move.y + right.z * side) * SPEED;

  try {
    // **狙った速度になるように、差分だけ足す。**
    // そのまま足すと積み上がって止まらなくなる
    const cur = f.drone.getVelocity();
    f.drone.applyImpulse({ x: vx - cur.x, y: vy - cur.y, z: vz - cur.z });
    // **向きだけ変える。** テレポートすると位置まで飛ぶ
    f.drone.setRotation({ x: 0, y: rot.y });
  } catch {
    // **機体が消えた＝落とされた**
    recall(player, true);
    return;
  }

  try {
    const at = f.drone.location;
    // **機体の前に出す。** 中に置くと、自分の機体が視界でちらつく
    const eye = { x: at.x + fwd.x * FRONT, y: at.y + EYE + fwd.y * FRONT, z: at.z + fwd.z * FRONT };
    player.camera.setCamera(CAMERA, {
      location: eye,
      facingLocation: { x: eye.x + fwd.x, y: eye.y + fwd.y, z: eye.z + fwd.z },
    });
    // **名札と照準**（docs/spec/23-drone.md 3 章）
    refreshDroneMark(player, { x: at.x, y: at.y + EYE, z: at.z }, eye, fwd);
  } catch {
    /* カメラが効かない。**進みはするので、そのまま続ける** */
  }

  // ---- **動かしてもマナは減らない**（2026-08-28 変更）
  //
  // 仕様は `docs/spec/24-role.md` 4-3。
  //
  // 動かしている間だけ 0.1/tick 取っていたが、**やめる。**
  //
  // > **上げている間ずっと減る**と、**動かすこと自体をためらう。**
  // > 上げるかどうかを決めさせたいのであって、
  // > **飛ばし方を渋らせたいわけではない。**
  //
  // 値段は**出すとき**に付ける——召喚 50、TNT 50、
  // ファイヤーチャージ 15、支柱弾 10、雪玉 3、ダーツ 5。
  // **飛んでいる間は、常に回復している。**

  // ---- **画面の表示を戻す**（2026-08-26 追加）
  //
  // カメラを移すと、**体力もマナ（経験値）も見えなくなる。**
  // 飛ばしている間、本人は棒立ちで**削られていることに気づけない。**
  //
  // > **見えないと、何が起きているのか分からない。**
  //
  // 毎 tick 出し直す。**カメラを動かすたびに隠れる**ため
  showHud(player);

  bar(player, "§b操縦中 §7(スニーク+ジャンプ / ドローンを右クリック)", BAR.ambient, 3);
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startDrone(): void {
  // ---- **取り残された人を助け起こす**
  //
  // `/reload` は**飛んでいた記録を消す**が、
  // **カメラと体の止めは消えない。**
  // そのままだと**視点が空に貼り付いたまま動けない**人が出る
  system.run(() => {
    for (const player of world.getAllPlayers()) release(player);
  });

  // ---- **主のいない機体を片付ける**（2026-08-26 追加）
  //
  // `/reload` は**誰の機体かという記録を消す**が、**機体そのものは残る。**
  // 誰も操れない的が盤面に増えていくだけなので、見つけ次第消す。
  //
  // > **`/reload` するのが悪い**ので、この程度の後始末でよい。
  //
  // **覚えている機体には手を出さない**（飛んでいる分・置いてきた分）
  system.runInterval(() => {
    let all: Entity[];
    try {
      all = world.getDimension("overworld").getEntities({ type: DRONE });
    } catch {
      return;
    }
    if (all.length === 0) return;

    const known = new Set<string>();
    for (const f of flying.values()) {
      try {
        known.add(f.drone.id);
      } catch {
        /* 消えている */
      }
    }
    for (const d of parked.values()) {
      try {
        known.add(d.id);
      } catch {
        /* 消えている */
      }
    }

    for (const drone of all) {
      try {
        if (known.has(drone.id)) continue;
        drone.remove();
      } catch {
        /* 既に消えている */
      }
    }
  }, ORPHAN_SWEEP);

  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    if (flying.has(ev.player.id)) return;
    release(ev.player);
  });

  system.runInterval(() => {
    const players = world.getAllPlayers();

    // ---- **返してほしいと言われた人を返す**（`wantRelease` の説明）
    //
    // **飛んでいるかどうかに関わらず返す。**
    // 記録が消えていても効かなければ、逃げ道にならない
    for (const id of [...wantRelease]) {
      wantRelease.delete(id);
      const stuck = players.find((p) => p.id === id);
      if (stuck === undefined) continue;
      const f = flying.get(id);
      if (f !== undefined) recall(stuck);
      else release(stuck);
      bar(stuck, "§a視点を戻した", BAR.important, 40);
    }

    // ---- **飛んでいない人は必ず解除する**（`frozen` の説明）
    //
    // 戻す経路が増えるたびに取りこぼしていたので、**突き合わせで保つ。**
    // どの経路が抜けていても、**次の tick で直る**
    for (const id of [...frozen]) {
      if (flying.has(id)) continue;
      const stuck = players.find((p) => p.id === id);
      if (stuck === undefined) {
        frozen.delete(id);
        continue;
      }
      release(stuck);
    }

    // ---- **落ちた知らせを処理する**（`wantDown` の説明）
    //
    // **視点を触るのはここだけ。** 見張りの外からでは戻らない
    for (const id of [...wantDown]) {
      wantDown.delete(id);
      downed(id);
    }

    for (const player of players) {
      const f = flying.get(player.id);
      if (f === undefined) continue;

      // ---- **降りる指示が来ている**（`wantExit` の説明）
      if (wantExit.delete(player.id)) {
        recall(player);
        continue;
      }

      // ---- **倒れたら戻す**
      //
      // 倒れた人は観戦者になる（`features/death`）。
      // そのまま飛ばし続けると、**視点が機体に貼り付いたまま復活する**
      let dead = false;
      try {
        dead = player.getGameMode() === GameMode.Spectator;
      } catch {
        dead = true;
      }
      if (dead) {
        // **置いてくる扱い。** 倒れただけで機体まで失わせない
        recall(player);
        continue;
      }

      step(player, f);
    }

    // ---- **置いてきた機体にも名札を出す**
    //
    // 操縦中しか出していなかったので、**降りた瞬間に消えていた**
    for (const [id, drone] of [...parked.entries()]) {
      const owner = players.find((p) => p.id === id);
      if (owner === undefined) continue;
      let at: Vector3 | undefined;
      try {
        // **死んだ実体は読めてしまう。** 生きているかを別に見る
        if (drone.isValid) at = drone.location;
      } catch {
        at = undefined;
      }
      if (at === undefined) {
        // 消えている。**印も消す**
        parked.delete(id);
        hideDroneMark(id);
        continue;
      }
      refreshDroneMark(owner, { x: at.x, y: at.y + EYE, z: at.z });
    }

    // ---- **居なくなった人の機体を残さない**
    for (const [id, f] of [...flying.entries()]) {
      if (players.some((p) => p.id === id)) continue;
      flying.delete(id);
      hideDroneMark(id);
      try {
        owners.delete(f.drone.id);
        f.drone.remove();
      } catch {
        /* 既に消えている */
      }
    }
  }, 1);
}

/**
 * 受け取りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerDroneGuards(): void {
  // ---- **飛んでいる間も拾える**（2026-08-26 変更）
  //
  // 以前は**拾えなくしていた。**
  // 本人は空を見ているので、**足元で何が起きているか分からない**——
  // 勝手に拾うのは筋が通らない、と考えていた。
  //
  // だが**味方が物を渡せない**ことのほうが困る。
  //
  // > 上げている間、その人は**棒立ちで無防備**（2 章）。
  // > **面倒を見るのは味方の仕事**で、
  // > **弾を足してやることもその一部。**
  //
  // 敵の落とし物まで拾ってしまうが、**そこに立っているのは本人の判断。**

  // ---- **飛んでいる間の右クリックは、全部こちらで受ける**
  //
  // 空を向いているときと、ブロックを向いているときで**来る道が違う**
  //（`docs/research/12-item-hold.md` 2 章）。**両方から同じ処理へ入れる。**
  world.beforeEvents.itemUse.subscribe((ev) => {
    handleUse(ev.source, ev.itemStack.typeId, () => (ev.cancel = true));
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    handleUse(ev.player, ev.itemStack?.typeId, () => (ev.cancel = true));
  });

  // ---- **飛んでいる間は、箱も店も開かない**（2026-08-26 追加）
  //
  // カメラは空にあるのに、**足元のチェストやショップが開く。**
  // 開いた画面はカメラの外の話なので、**何が起きたのか分からない。**
  //
  // 触れるものは全部止める（`handleUse` は右クリックの中身を捌くだけで、
  // **バニラの「開く」は別に走る**）
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (flying.has(ev.player.id)) {
      ev.cancel = true;
      return;
    }

    // ---- **上げるときも、そのブロックには触らせない**（2026-08-26 追加）
    //
    // 店やチェストを向いたまま遠隔装置を押すと、
    // **上がると同時にその画面が開く。**
    // カメラは空へ行っているので、**何が開いたのか分からない。**
    //
    // 打ち消すと `afterEvents` は飛ばない。**ここから上げる。**
    if (ev.itemStack?.typeId !== REMOTE) return;
    ev.cancel = true;
    const player = ev.player;
    if (!pressOnce(player, TOGGLE_GUARD)) return;
    system.run(() => {
      const why = launch(player);
      if (why !== undefined) player.sendMessage(why);
    });
  });

  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (flying.has(ev.player.id)) {
      ev.cancel = true;
      return;
    }
    // **上げるときも同じ**（村人など、相手が実体のものもある）。
    // 上げるのは `itemUse` 側が拾う——ここは**触らせないだけ**
    if (ev.itemStack?.typeId === REMOTE) ev.cancel = true;
  });

  // ---- **ダーツが当たった**（`docs/spec/23-drone.md` 4 章）
  //
  // 実体は雪玉なので、**当たっても素では何も起きない。**
  // ここで**ダメージ 1 と名札**を入れる
  world.afterEvents.projectileHitEntity.subscribe((ev) => {
    try {
      if (!ev.projectile.hasTag(DART_TAG)) return;
    } catch {
      return;
    }
    const shooter = ev.source;
    if (!(shooter instanceof Player)) return;
    const victim = ev.getEntityHit().entity;
    if (victim === undefined) return;
    if (victim instanceof Player) {
      system.run(() => onDartHit(shooter, victim));
      return;
    }
    // **敵の機体に刺さったら落とす**（体力 1。2026-08-26 追加）
    try {
      if (victim.typeId !== DRONE) return;
    } catch {
      return;
    }
    system.run(() => onDartDrone(shooter, victim));
  });

  // ---- **機体が死んだら受け取る**
  //
  // 例外任せにしていたが、**死んだ実体はすぐには無効にならない。**
  // 読めてしまうので、**気づけないまま視点が空に残っていた**（2026-08-25 修正）
  world.afterEvents.entityDie.subscribe((ev) => {
    const dead = ev.deadEntity;
    let id: string;
    try {
      if (dead.typeId !== DRONE) return;
      id = dead.id;
    } catch {
      return;
    }
    const pilotId = owners.get(id);
    if (pilotId === undefined) return;
    owners.delete(id);
    // **ここでは戻さない。** 見張りが拾う（`wantDown` の説明）
    wantDown.add(pilotId);
  });

  // ---- **殴られたら戻る**（docs/spec/23-drone.md 5-B）
  //
  // 飛ばしている間、本人は棒立ち。
  // 気づかないまま削られては、**何が起きたのか分からないまま倒れる**
  world.afterEvents.entityHurt.subscribe((ev) => {
    const victim = ev.hurtEntity;
    if (!(victim instanceof Player)) return;
    if (!flying.has(victim.id)) return;
    wantExit.add(victim.id);
    bar(victim, "§c殴られて戻された", BAR.important, 40);
  });

  // ---- **地上でアイテムを使ったら出す**
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== REMOTE) return;
    const player = ev.source;
    if (flying.has(player.id)) return;
    // **押しっぱなしで上げ直さない**（戻った直後にまた上がる）
    if (!pressOnce(player, TOGGLE_GUARD)) return;
    system.run(() => {
      const why = launch(player);
      if (why !== undefined) player.sendMessage(why);
    });
  });
}

/**
 * 出す／戻すコマンド。
 *
 * **試作の入口。** 買わずに試せるように残してある。
 */
export function registerDroneCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:drone",
      description: "ドローンを出す／戻す（運営のみ・試作）",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e as Player;
      if (!isOp(player)) {
        return { status: CustomCommandStatus.Failure, message: "運営だけが使えます" };
      }
      if (flying.has(player.id)) {
        // **見張りに任せる**（`wantExit` の説明）
        wantExit.add(player.id);
        return { status: CustomCommandStatus.Success };
      }
      system.run(() => {
        const why = launch(player);
        if (why !== undefined) player.sendMessage(why);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * 視点を戻すコマンド。
 *
 * 仕様は `docs/spec/23-drone.md` 5-C。
 *
 * **誰でも使える。** 取り残されるのは運営とは限らない。
 *
 * **飛んでいる記録が無くても効く。**
 * `/reload` などで記録が消えたときこそ、この逃げ道が要る。
 */
export function registerUnstuckCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:unstuck",
      description: "視点が戻らなくなったときに、自分の視点を戻す",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      // **ここでは戻さない。** 見張りが拾う（`wantRelease` の説明）
      wantRelease.add(e.id);
      return { status: CustomCommandStatus.Success };
    }
  );
}
