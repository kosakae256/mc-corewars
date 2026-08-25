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
  GameMode,
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

import { BAR, bar } from "../../lib/fx.js";
import { isOp } from "../../lib/op.js";
import { teamOf } from "../../lib/match-state.js";
import { stickDart } from "../spotting/index.js";
import { markTntOwner } from "../special/tnt.js";
import { hideDroneMark, refreshDroneMark } from "./marker.js";

/** ドローンの実体 */
const DRONE = "game:drone";

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
 * 機体から使うものの、次に使えるまで（tick）。
 *
 * 仕様は `docs/spec/23-drone.md` 5-D。
 *
 * | | | なぜ |
 * | --- | --- | --- |
 * | **TNT** | **10 秒** | 上から落とし続けられると、拠点が居られない場所になる |
 * | **ファイヤーチャージ** | **3 秒** | 面を焼く道具。連射すると通路が丸ごと消える |
 * | 投げ物・ダーツ | 0.5 秒 | **連打を止めるだけ。** 強さの調整ではない |
 *
 * **空からは狙われない。** 撃ち返される心配が無いぶん、撃つ間隔で釣り合いを取る。
 */
const COOLDOWN: Readonly<Record<DroneUse, number>> = {
  tnt: 200,
  fire: 60,
  throw: USE_COOLDOWN,
};

/** 機体から使うものの種類 */
export type DroneUse = "tnt" | "fire" | "throw";

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

/** ダーツの届く距離（マス）。**10 m** */
const DART_RANGE = 10;

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

/** 同じ tick に 2 回撃たせない */
const dartAt = new Map<string, number>();

/** その人は飛ばしているか */
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

/**
 * 間隔を空けているか。**空いていれば true を返して、時刻を記録する。**
 *
 * 空いていないときは**残りを画面に出す。**
 * 押しても何も起きないのでは、壊れているのか待ちなのか分からない。
 */
export function droneReady(player: Player, use: DroneUse): boolean {
  const now = system.currentTick;
  const wait = COOLDOWN[use];
  const key = `${player.id}:${use}`;
  const last = usedAt.get(key);
  if (last !== undefined && now - last < wait) {
    // **0.5 秒の連打止めでは出さない。** 毎回出ては邪魔になるだけ
    if (wait > USE_COOLDOWN) {
      const left = ((wait - (now - last)) / 20).toFixed(1);
      bar(player, `§7${LABEL[use]} あと §f${left}§7 秒`, BAR.notice, 20);
    }
    return false;
  }
  usedAt.set(key, now);
  return true;
}

/** 待たせるときの呼び名 */
const LABEL: Readonly<Record<DroneUse, string>> = {
  tnt: "§cTNT",
  fire: "§6ファイヤーチャージ",
  throw: "投げ物",
};

/**
 * いま持っているものの待ち時間を、1 行ぶんの文字にする。
 *
 * 仕様は `docs/spec/23-drone.md` 5-D。
 *
 * **持っているときだけ出す。**
 * TNT を持っていない人に TNT の待ち時間を出しても意味が無い。
 *
 * ガスと同じ見た目にする（`features/grapple` の `showGas`）。
 * **同じ場所に出るものは、同じ読み方でありたい。**
 */
function cooldownLine(player: Player): string {
  let use: DroneUse | undefined;
  try {
    const id = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex)?.typeId;
    if (id === TNT_ITEM) use = "tnt";
    else if (id === FIRE_ITEM) use = "fire";
  } catch {
    return "";
  }
  if (use === undefined) return "";

  const wait = COOLDOWN[use];
  const last = usedAt.get(`${player.id}:${use}`);
  const passed = last === undefined ? wait : system.currentTick - last;
  if (passed >= wait) return ` ${LABEL[use]} §a準備OK`;

  const filled = Math.floor((passed / wait) * CD_SEGMENTS);
  const left = ((wait - passed) / 20).toFixed(1);
  return ` ${LABEL[use]} §c${"|".repeat(filled)}§8${"|".repeat(CD_SEGMENTS - filled)} §f${left}`;
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
  takeRemote(player);
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
    takeRemote(player);
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

/** 機体から投げる。**1 個減らしてから飛ばす** */
function throwFrom(player: Player, at: Vector3, item: string, entity: string): void {
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
 * **視点の先に居る敵に刺す。** 届くのは 10 マスまで。
 */
function shootDart(player: Player, from: Vector3): void {
  const mine = teamOf(player);
  if (mine === undefined) return;

  let dir: Vector3;
  try {
    dir = player.getViewDirection();
  } catch {
    return;
  }

  let hit: Player | undefined;
  try {
    for (const r of player.dimension.getEntitiesFromRay(from, dir, { maxDistance: DART_RANGE })) {
      const e = r.entity;
      if (!(e instanceof Player)) continue;
      // **敵だけ。** 味方に刺しても意味が無い
      if (teamOf(e) === mine) continue;
      hit = e;
      break;
    }
  } catch {
    return;
  }

  if (hit === undefined) {
    bar(player, "§7ダーツ  外した", BAR.notice, 20);
    return;
  }

  stickDart(hit.id, DART_TICKS);
  bar(player, `§b${hit.name}§r§b に刺した §7(1 分)`, BAR.notice, 30);
}

function dartOnce(player: Player, from: Vector3): void {
  if (dartAt.get(player.id) === system.currentTick) return;
  dartAt.set(player.id, system.currentTick);
  system.run(() => shootDart(player, from));
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
    // **ここでは戻さない。** 見張りが拾う（`wantExit` の説明）
    wantExit.add(player.id);
    return;
  }
  if (id === TNT_ITEM) {
    if (droneReady(player, "tnt")) system.run(() => dropTnt(player, at));
    return;
  }
  if (BANNED.has(id)) {
    bar(player, "§cドローンからは使えません", BAR.notice, 20);
    return;
  }
  const entity = THROWN[id];
  if (entity !== undefined) {
    if (droneReady(player, "throw")) system.run(() => throwFrom(player, at, id, entity));
    return;
  }
  dartOnce(player, at);
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

  // ---- **待ち時間はガスと同じ場所に出す**（2026-08-26 追加）
  //
  // 押しても出ない理由が、**画面のどこにも出ていなかった。**
  //
  // 出す場所を増やさない。**足元の 1 行**に、持っているものの分だけ足す
  const cd = cooldownLine(player);
  const hint = cd === "" ? " §7(スニーク+ジャンプ / ドローンを右クリック)" : " §7(降りる: スニーク+ジャンプ)";
  bar(player, `§b操縦中${cd}${hint}`, BAR.ambient, 3);
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
  world.beforeEvents.entityItemPickup.subscribe((ev) => {
    if (!flying.has(ev.entity.id)) return;
    ev.cancel = true;
  });

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
    system.run(() => {
      const why = launch(player);
      if (why !== undefined) player.sendMessage(why);
    });
  });

  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.itemStack?.typeId !== REMOTE) return;
    const player = ev.player;
    if (flying.has(player.id)) return;
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
