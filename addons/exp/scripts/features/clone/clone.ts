/**
 * 分身（VALORANT ヨルの Fakeout 相当）。
 *
 * 仕様: docs/spec/05-exp-clone.md
 * 調査: docs/research/07-player-skin-clone.md
 *
 * ## 使う API
 *
 * どちらも `@minecraft/server-gametest` の**モジュール直下**にある。
 * クラスのメンバーだけ見ていると見つからない。
 *
 *   `spawnSimulatedPlayer(DimensionLocation, name, gameMode)`
 *       GameTest に紐づかない生成。**ワールド座標をそのまま渡せる**
 *   `getPlayerSkin(player)`
 *       スキンを読む
 *
 * ## 見た目が揃わない人がいる
 *
 * `PlayerSkinData` が運べるのは persona（キャラクター作成系）のパーツだけ。
 * 自作 PNG のスキンの人は `personaPieces` が空で返り、既定の見た目になる。
 * これは実装では埋められない（画像を運ぶ欄が API に無い）。
 */
import {
  GameMode,
  system,
  world,
  type DimensionLocation,
  type Player,
} from "@minecraft/server";
import * as gametest from "@minecraft/server-gametest";

import { CLONE_RUN_TICKS, CLONE_SPEED, SKIN_RETRY_TICKS } from "./config.js";
import { quietly } from "./quiet.js";

/** 出ている分身。殴られたときに「分身かどうか」を判定するために持つ */
const alive = new Set<gametest.SimulatedPlayer>();

/** 名前が衝突しないように通し番号を振る */
let seq = 0;

/**
 * 分身を出して走らせる。
 *
 * 出し入れは `quietly` で包む。
 * **包まないと「参加しました」「退出しました」が出て分身にならない。**
 */
export function spawnClone(owner: Player): void {
  seq++;
  const at: DimensionLocation = {
    x: owner.location.x,
    y: owner.location.y,
    z: owner.location.z,
    dimension: owner.dimension,
  };

  let clone: gametest.SimulatedPlayer | undefined;

  quietly(() => {
    try {
      // 本人と同じ名前にする。頭上の名前まで揃えるため。
      // 通し番号を付けないのは、分身と分かってしまうから
      clone = gametest.spawnSimulatedPlayer(at, owner.name, GameMode.Adventure);
    } catch (e) {
      console.warn(`[clone] 生成に失敗: ${String(e)}`);
    }
  });

  if (!clone) return;
  const target = clone;
  alive.add(target);

  // スキンを合わせる。persona でない人は空が返り、既定の見た目になる
  applySkin(target, owner);

  // **湧いた直後は中身が整っていないことがある。**
  // 少し置いてもう一度着せる（1回目が空振りでも拾えるように）
  system.runTimeout(() => {
    if (target.isValid) applySkin(target, owner, true);
  }, SKIN_RETRY_TICKS);

  // 使った人の向きを引き継いで、前へ走らせる
  try {
    target.setRotation(owner.getRotation());
    target.moveRelative(0, 1, CLONE_SPEED);
  } catch {
    // 走れなくても、囮としては成立する
  }

  system.runTimeout(() => removeClone(target), CLONE_RUN_TICKS);
}

/**
 * 分身に相手のスキンを着せる。
 *
 * **何が起きたかを必ずログに残す。**
 * 見た目が揃わないとき、`getPlayerSkin` が空なのか
 * `setSkin` が失敗しているのかを切り分けられないと詰む。
 */
function applySkin(clone: gametest.SimulatedPlayer, owner: Player, verify = false): void {
  let data: gametest.PlayerSkinData;
  try {
    data = gametest.getPlayerSkin(owner);
  } catch (e) {
    world.sendMessage(`§c[clone] getPlayerSkin 失敗: ${String(e)}§r`);
    return;
  }

  const from = (data.personaPieces ?? []).length;

  try {
    clone.setSkin(data);
  } catch (e) {
    world.sendMessage(`§c[clone] setSkin 失敗: ${String(e)}§r`);
    return;
  }

  if (!verify) return;

  // **着せた結果を読み返して確かめる。**
  // 「元が空なのか」「着せたのに反映されていないのか」は
  // 見た目だけでは区別できない
  try {
    const after = (gametest.getPlayerSkin(clone).personaPieces ?? []).length;
    const verdict =
      from === 0
        ? "§e元のスキンにパーツが無い（persona ではない）§r"
        : after === from
          ? "§a一致§r"
          : "§c着せたのに反映されていない§r";
    world.sendMessage(`§7[clone] 元=${from}個 → 分身=${after}個  ${verdict}`);
    console.warn(`[clone] from=${from} after=${after} data=${JSON.stringify(data)}`);
  } catch (e) {
    world.sendMessage(`§c[clone] 読み返しに失敗: ${String(e)}§r`);
  }
}

/** 分身を消す。こちらも通知を止めてから行う */
export function removeClone(clone: gametest.SimulatedPlayer): void {
  if (!alive.delete(clone)) return;

  quietly(() => {
    try {
      if (clone.isValid) clone.disconnect();
    } catch {
      // 既に居なければ何もしない
    }
  });
}

/** その相手が分身か */
export function isClone(entity: unknown): entity is gametest.SimulatedPlayer {
  return alive.has(entity as gametest.SimulatedPlayer);
}

/**
 * 殴られたら消える。
 *
 * ヨルの Fakeout と同じで、触られた時点で囮だとバレて消える。
 */
export function enableClonePopping(): void {
  world.afterEvents.entityHitEntity.subscribe((event) => {
    const hit = event.hitEntity;
    if (isClone(hit)) removeClone(hit);
  });
}

/**
 * 参加者全員のスキン情報を出す（調査用）。
 *
 * 見た目が揃わないときに、
 * 「誰なら複製できるのか」「そもそも何も返っていないのか」を確かめる。
 */
export function dumpSkins(): void {
  const players = world.getAllPlayers();
  world.sendMessage(`§b[skin] ${players.length} 人（§a○§b=複製できる §c×§b=できない）§r`);

  for (const player of players) {
    let data: gametest.PlayerSkinData;
    try {
      data = gametest.getPlayerSkin(player);
    } catch (e) {
      world.sendMessage(`§c[skin] ${player.name}: 例外 ${String(e)}§r`);
      continue;
    }

    const pieces = data.personaPieces ?? [];
    const mark = pieces.length > 0 ? "§a○" : "§c×";
    const raw = JSON.stringify(data);
    world.sendMessage(`${mark} §b${player.name}§r: パーツ=${pieces.length}個 keys=[${Object.keys(data).join(",")}]`);
    world.sendMessage(`§7  raw: ${raw.length > 200 ? `${raw.slice(0, 200)}…` : raw}§r`);
    console.warn(`[skin] ${player.name} = ${raw}`);
  }
}
