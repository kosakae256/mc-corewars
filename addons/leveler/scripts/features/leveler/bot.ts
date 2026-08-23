/**
 * SimulatedPlayer の生成と保持。
 *
 * ## なぜ GameTest が要るのか
 *
 * `spawnSimulatedPlayer` は `Test` クラスのメソッドで、
 * `Test` は `gametest.register()` のコールバック引数としてしか得られない。
 * そのため**ボットを出すには GameTest を走らせる必要がある**。
 *
 * ## 構造物を目の前に出さない工夫
 *
 * `structureLocation` で遠く（TEST_SITE）に展開し、
 * 生成したボットだけを呼び出したプレイヤーの位置へ teleport する。
 *
 * ## 座標系に注意
 *
 * **SimulatedPlayer のメソッドは GameTest の相対座標を取る**（実測）。
 * ワールド座標をそのまま渡すと TEST_SITE を基準に解釈され、
 * 見当違いの方向へ歩いていく。必ず `toRelative()` を通すこと。
 */
import * as gametest from "@minecraft/server-gametest";
import { GameMode, system, world, type Player, type Vector3 } from "@minecraft/server";

import { AutoLeveler } from "./auto.js";
import { BOT_NAME, CALL_TO_PLAYER, MAX_TICKS, TEST_CLASS, TEST_NAME, TEST_SITE } from "./config.js";
import { allBots, botCount, registerBot, unregisterBot } from "./registry.js";
import { startVitals, stopVitals } from "./vitals.js";

/** GameTest の Test 参照。座標変換と生存確認に使う */
let testRef: gametest.Test | undefined;

/** 名前 → 自動整地の制御 */
const autos = new Map<string, AutoLeveler>();

/** 生成した通し番号。名前を一意にするため */
let seq = 0;

export function isTestAlive(): { alive: boolean; detail: string } {
  if (!testRef) return { alive: false, detail: "Test の参照がない" };
  try {
    const p = testRef.worldLocation({ x: 0, y: 0, z: 0 });
    return { alive: true, detail: `原点 (${p.x}, ${p.y}, ${p.z})` };
  } catch (e) {
    return { alive: false, detail: String(e).slice(0, 120) };
  }
}

/**
 * ワールド座標を GameTest の相対座標へ変換する。
 * SimulatedPlayer のメソッドに渡す座標は必ずここを通す。
 */
export function toRelative(worldPos: Vector3): Vector3 {
  if (!testRef) return worldPos;
  try {
    return testRef.relativeLocation(worldPos);
  } catch {
    return worldPos;
  }
}

/** 最初の1体。単体向けのコマンド用 */
export function getBot(): gametest.SimulatedPlayer | undefined {
  return allBots()[0]?.bot;
}

export function getAuto(): AutoLeveler | undefined {
  return [...autos.values()][0];
}

/** 何体いるか */
export function count(): number {
  return botCount();
}

/** 全ての自動整地を止めてボットを退場させる */
export function clearBot(): void {
  stopVitals();
  for (const auto of autos.values()) auto.stop(true);
  autos.clear();
  for (const { name, bot } of allBots()) {
    try {
      bot.disconnect();
    } catch {
      // 既に無効なら無視
    }
    unregisterBot(name);
  }
}

/** 全ボットを呼び寄せる */
export function bringBotTo(player: Player): boolean {
  const list = allBots();
  if (list.length === 0) return false;
  const base = groundedLocation(player);
  for (const { bot } of list) {
    try {
      bot.teleport(base, { dimension: player.dimension });
    } catch {
      // 失敗した個体は放置してよい
    }
  }
  return true;
}

/** 呼び先のプレイヤーを決める。ボット自身は除く */
function findHost(): Player | undefined {
  const humans = world.getAllPlayers().filter((p) => !p.name.startsWith(BOT_NAME));
  return humans.find((p) => p.name === CALL_TO_PLAYER) ?? humans[0];
}

/**
 * そのプレイヤーの足元の「地面の上」を求める。
 *
 * 公式ドキュメント（navigateToBlock）より:
 *   "The player must be touching the ground in order to start navigation."
 * 浮いたままだと移動命令が効かない。
 */
function groundedLocation(player: Player): Vector3 {
  const loc = player.location;
  try {
    const top = player.dimension.getTopmostBlock({ x: loc.x, z: loc.z });
    if (top) return { x: Math.floor(loc.x) + 0.5, y: top.y + 1, z: Math.floor(loc.z) + 0.5 };
  } catch {
    // 取れなければそのまま
  }
  return { x: loc.x, y: loc.y, z: loc.z };
}

/**
 * ボットを1体生成し、自動整地を始めさせる。
 *
 * @param spread 呼び先からどれだけ散らすか。同じ場所に固まると互いの邪魔になる
 */
function spawnOne(test: gametest.Test, host: Player, spread: number): void {
  seq++;
  const name = seq === 1 ? BOT_NAME : `${BOT_NAME}${seq}`;

  // **Survival で出す**（spec 3-7）。
  // 在庫と体力は自前で面倒をみる（設置の直前に持ち直す／体力は戻し続ける）
  const bot = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, name, GameMode.Survival);
  registerBot(name, bot);
  // 死なせないためのタイマーを回し始める（何度呼んでも1本）
  startVitals();

  // spawn 直後は座標が安定しないので少し待つ
  system.runTimeout(() => {
    if (!bot.isValid) return;

    const base = groundedLocation(host);
    // 黄金角で散らすと重なりにくい
    const angle = seq * 2.39996;
    const at: Vector3 =
      spread <= 0
        ? base
        : {
            x: base.x + Math.cos(angle) * spread,
            y: base.y,
            z: base.z + Math.sin(angle) * spread,
          };

    try {
      bot.teleport(at, { dimension: host.dimension });
    } catch {
      bot.teleport(base, { dimension: host.dimension });
    }

    // 着地してから始めないと経路探索が働かない
    system.runTimeout(() => {
      if (!bot.isValid) return;
      const auto = new AutoLeveler(bot, host.dimension, name);
      autos.set(name, auto);
      auto.start();
    }, 20);
  }, 20);
}

/**
 * ボットを追加する。既に走っている GameTest を使う。
 *
 * `/gametest run` を何度も打たなくても増やせるようにするため。
 */
export function addBots(n: number): { ok: true; count: number } | { ok: false; reason: string } {
  if (!testRef) return { ok: false, reason: "先に /gametest run leveler:start を実行してください" };
  const host = findHost();
  if (!host) return { ok: false, reason: "呼び先のプレイヤーが見つかりません" };

  // 台数が増えるほど広く散らす
  const spread = Math.max(2, Math.sqrt(botCount() + n) * 1.5);
  for (let i = 0; i < n; i++) {
    try {
      spawnOne(testRef, host, spread);
    } catch (e) {
      return { ok: false, reason: String(e).slice(0, 80) };
    }
  }
  return { ok: true, count: n };
}

export function registerLevelerTest(): void {
  gametest
    .register(TEST_CLASS, TEST_NAME, (test) => {
      testRef = test;

      const host = findHost();
      if (!host) {
        world.sendMessage("§e呼び先のプレイヤーが見つかりません§r");
        return;
      }
      spawnOne(test, host, 0);

      // succeed() を呼ばない。呼ぶとテストが終わってボットが消える
    })
    .maxTicks(MAX_TICKS)
    .structureName(`${TEST_CLASS}:empty`)
    // 構造をプレイヤーから遠く離れた場所に展開する。
    // これをしないと目の前にコマンドブロックと枠が出る
    .structureLocation(TEST_SITE);
}
