/**
 * `/level:*` コマンドの登録。
 *
 * ここは「コマンドの形」と「結果の返し方」だけを担い、
 * 実処理は scan.ts / work.ts に委譲する。
 */
import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type Player,
  type StartupEvent,
} from "@minecraft/server";

import { MAX_RADIUS, SCAN_CENTER } from "./config.js";
import { botCount } from "./registry.js";
import { cachedColumns, knownJobs } from "./terrain.js";
import { getBot, clearBot, bringBotTo, isTestAlive, getAuto, addBots, count } from "./bot.js";
import { scanJob } from "./scan.js";
import { sortByDistance } from "./logic.js";
import { LevelWorker } from "./work.js";
import {
  clearClones,
  dumpAllSkins,
  findPlayer,
  poolSize,
  preparePool,
  spawnClone,
} from "./skinprobe.js";
import { MSG } from "../../lib/format.js";

/** 現在の作業。1つだけ走らせる */
let worker: LevelWorker | undefined;

function replyTo(origin: CustomCommandOrigin, text: string): void {
  // 実行者に返せないケース（コンソール等）でも消えないよう、
  // 全体にも流す。原因切り分けのため当面はこの方針にする
  try {
    const player = origin.sourceEntity as Player | undefined;
    if (player?.sendMessage) player.sendMessage(text);
    else world.sendMessage(text);
  } catch {
    world.sendMessage(text);
  }
}

/**
 * 走査して、必要なら作業を開始する。
 *
 * **コマンドのコールバックは restricted execution。**
 * world を変更する処理は system.run に逃がす。
 */
function runScan(origin: CustomCommandOrigin, radius: number, thenWork: boolean): void {
  system.run(() => {
    try {
      runScanInner(origin, radius, thenWork);
    } catch (e) {
      // 例外を握りつぶすと「何も起きない」ように見えてしまう
      world.sendMessage(`§c[leveler] エラー: ${String(e)}§r`);
      console.error("[leveler]", e);
    }
  });
}

function runScanInner(origin: CustomCommandOrigin, radius: number, thenWork: boolean): void {
  world.sendMessage(`§7[leveler] 走査を開始します（半径 ${radius}）§r`);

    const bot = getBot();
    if (!bot) return replyTo(origin, MSG.botMissing);
    world.sendMessage(`§7[leveler] ボット: ${bot.name}§r`);

    if (thenWork && worker?.isRunning) return replyTo(origin, MSG.busy);

    const pos = bot.location;
    // 中心が設定されていればそこを、無ければボットの現在地を使う
    const cx = SCAN_CENTER ? SCAN_CENTER.x : Math.floor(pos.x);
    const cz = SCAN_CENTER ? SCAN_CENTER.z : Math.floor(pos.z);
    world.sendMessage(`§7[leveler] 中心 (${cx}, ${cz}) 半径 ${radius}§r`);

    replyTo(origin, MSG.scanning(radius));

    system.runJob(
      scanJob(bot.dimension, cx, cz, radius, (result) => {
        replyTo(origin, MSG.scanResult(result.columns, result.targets.length));
        if (!thenWork) return;

        if (result.targets.length === 0) return replyTo(origin, MSG.scanEmpty);

        void sortByDistance;
    })
  );
}

/**
 * 移動が動くかを切り分ける。
 *
 * 3つの方式を順に試し、それぞれで位置が変わったかを報告する。
 *   1. move()               … 入力を直接与える（経路探索なし）
 *   2. moveToLocation()     … 直線移動
 *   3. navigateToLocation() … 経路探索つき
 */
function runMoveTest(): void {
  const bot = getBot();
  if (!bot) {
    world.sendMessage(MSG.botMissing);
    return;
  }

  const p0 = bot.location;
  // 接地しているかが最重要。公式ドキュメント:
  //   "The player must be touching the ground in order to start navigation."
  let ground = "?";
  try {
    const below = bot.dimension.getBlock({ x: p0.x, y: p0.y - 1, z: p0.z });
    ground = below ? `${below.typeId}${below.isAir ? "(空気)" : ""}` : "取得不可";
  } catch {
    ground = "例外";
  }
  const alive = isTestAlive();
  world.sendMessage(
    `§7[test] GameTest 生存=${alive.alive} (${alive.detail})§r`
  );

  world.sendMessage(
    `§7[test] 位置 (${p0.x.toFixed(1)}, ${p0.y.toFixed(1)}, ${p0.z.toFixed(1)}) ` +
    `mode=${bot.getGameMode?.() ?? "?"} 足元=${ground} ` +
    `onGround=${(bot as unknown as { isOnGround?: boolean }).isOnGround ?? "?"}§r`
  );

  const report = (label: string, before: { x: number; y: number; z: number }) => {
    const p = bot.location;
    const moved = Math.hypot(p.x - before.x, p.z - before.z);
    world.sendMessage(
      `§7[test] ${label}: 移動 ${moved.toFixed(2)} ブロック ` +
      `→ (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})§r`
    );
    return { x: p.x, y: p.y, z: p.z };
  };

  // 1. move() … 前へ入力を与えるだけ
  let mark = { x: p0.x, y: p0.y, z: p0.z };
  bot.move(0, 1, 1);
  system.runTimeout(() => {
    bot.stopMoving();
    mark = report("move()", mark);

    // 2. moveToLocation() … 5ブロック先へ直線移動
    const goal2 = { x: mark.x + 5, y: mark.y, z: mark.z };
    bot.moveToLocation(goal2);
    system.runTimeout(() => {
      bot.stopMoving();
      mark = report("moveToLocation()", mark);

      // 3. navigateToLocation() … 経路探索
      const goal3 = { x: mark.x - 5, y: mark.y, z: mark.z };
      const r = bot.navigateToLocation(goal3);
      world.sendMessage(`§7[test] navigate の isFullPath=${r?.isFullPath}§r`);
      system.runTimeout(() => {
        bot.stopMoving();
        report("navigateToLocation()", mark);
        world.sendMessage("§7[test] 完了§r");
      }, 60);
    }, 60);
  }, 60);
}

export function registerLevelerCommands(init: StartupEvent): void {
  const registry = init.customCommandRegistry;

  const radiusParam = { type: CustomCommandParamType.Integer, name: "radius" };

  registry.registerCommand(
    {
      name: "level:scan",
      description: "周囲の地形を走査して、埋める対象の数を報告する",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [radiusParam],
    },
    (origin: CustomCommandOrigin, radius: number): CustomCommandResult => {
      system.run(() => world.sendMessage(`§7[leveler] /level:scan ${radius} を受け付けました§r`));
      if (radius < 1 || radius > MAX_RADIUS) {
        system.run(() => replyTo(origin, MSG.tooLarge(MAX_RADIUS)));
        return { status: CustomCommandStatus.Success };
      }
      runScan(origin, radius, false);
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:go",
      description: "周囲を走査して整地を開始する",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [radiusParam],
    },
    (origin: CustomCommandOrigin, radius: number): CustomCommandResult => {
      system.run(() => world.sendMessage(`§7[leveler] /level:go ${radius} を受け付けました§r`));
      if (radius < 1 || radius > MAX_RADIUS) {
        system.run(() => replyTo(origin, MSG.tooLarge(MAX_RADIUS)));
        return { status: CustomCommandStatus.Success };
      }
      runScan(origin, radius, true);
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:call",
      description: "ボットを自分の場所に呼び寄せる",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      system.run(() => {
        const player = origin.sourceEntity as Player | undefined;
        if (!player) {
          world.sendMessage("§cプレイヤーから実行してください§r");
          return;
        }
        if (!bringBotTo(player)) {
          world.sendMessage(MSG.botMissing);
          return;
        }
        world.sendMessage(MSG.botCame);
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:test",
      description: "移動の仕組みを切り分ける（move / moveToLocation / navigateToLocation）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (): CustomCommandResult => {
      system.run(() => runMoveTest());
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:skin",
      description: "参加者全員のスキン情報を表示する（調査用）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (): CustomCommandResult => {
      system.run(() => dumpAllSkins());
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:clone",
      description: "自分と同じスキンの分身を出す（走る・10秒で消える）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin): CustomCommandResult => {
      const player = origin.sourceEntity as Player | undefined;
      if (!player) return { status: CustomCommandStatus.Failure };
      system.run(() => spawnClone(player, { run: true, lifetime: 200 }));
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:clonehold",
      description: "自分と同じスキンの分身を、その場に立たせたまま出す（見比べ用）",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin): CustomCommandResult => {
      const player = origin.sourceEntity as Player | undefined;
      if (!player) return { status: CustomCommandStatus.Failure };
      system.run(() => spawnClone(player, { run: false, lifetime: 0 }));
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:cloneof",
      description: "指定した参加者のスキンで分身を出す（本命の検証）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "対象の名前", type: CustomCommandParamType.String }],
    },
    (origin, target: string): CustomCommandResult => {
      const player = origin.sourceEntity as Player | undefined;
      if (!player) return { status: CustomCommandStatus.Failure };
      system.run(() => {
        const source = findPlayer(target);
        if (!source) {
          replyTo(origin, `§e${target} が見つかりません§r`);
          return;
        }
        spawnClone(player, { skinFrom: source, run: false, lifetime: 0 });
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:clonepool",
      description: "分身を先に用意して遠くに待機させる（参加通知はここで出る）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "体数", type: CustomCommandParamType.Integer }],
    },
    (origin, count: number): CustomCommandResult => {
      const player = origin.sourceEntity as Player | undefined;
      if (!player) return { status: CustomCommandStatus.Failure };
      if (count < 1 || count > 20) {
        system.run(() => replyTo(origin, "§e1〜20 で指定してください§r"));
        return { status: CustomCommandStatus.Success };
      }
      system.run(() => preparePool(player.dimension, count));
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:cloneclear",
      description: "出した分身を全部消す",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin): CustomCommandResult => {
      system.run(() => {
        const n = clearClones();
        replyTo(origin, `§b分身を ${n} 体消しました（待機中 ${poolSize()} 体）§r`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:status",
      description: "ボットの数と、共有している走査結果の状況を見る",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin): CustomCommandResult => {
      system.run(() => {
        const lines = [
          `§bボット §f${botCount()} 体`,
          `§b共有した列 §f${cachedColumns()} 件`,
          `§bうち未整地 §f${knownJobs()} 件`,
        ];
        replyTo(origin, lines.join("  "));
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:add",
      description: "整地ボットを指定した数だけ追加する",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "count" }],
    },
    (origin: CustomCommandOrigin, n: number): CustomCommandResult => {
      system.run(() => {
        if (n < 1 || n > 200) {
          replyTo(origin, "§c1〜200 の範囲で指定してください§r");
          return;
        }
        const r = addBots(n);
        replyTo(
          origin,
          r.ok ? `§a${n} 体を追加しました§r §7(合計 ${count() + n} 体)§r` : `§c${r.reason}§r`
        );
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:stop",
      description: "整地を中止する",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (): CustomCommandResult => {
      system.run(() => {
        // 自動整地を止める。個別の作業も一緒に止まる
        getAuto()?.stop();
        worker?.stop(true);
        worker = undefined;
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "level:dismiss",
      description: "ボットを退場させる",
      permissionLevel: CommandPermissionLevel.Any,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      system.run(() => {
        worker?.stop(true);
        worker = undefined;
        const bot = getBot();
        if (!bot) return replyTo(origin, MSG.botMissing);
        bot.disconnect();
        clearBot();
        world.sendMessage(MSG.botGone);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
