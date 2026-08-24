/**
 * 死亡と復活。
 *
 * 仕様は `docs/spec/14-death.md`。
 *
 * ## ゲーム側の「死亡」を起こさない
 *
 * **体力が 0 になる前に止める。**
 * 致命傷を取り消し、代わりに自分で「倒れた」ことにする。
 *
 * 死亡画面が出ると、**待ち時間の管理を奪われる。**
 * リスポーンの位置も持ち物も、こちらで決めたい。
 *
 * ## 体力は飾り
 *
 * 表示は残す。減る様子は見えたほうが分かりやすい。
 * だが**0 になることは無い。** 倒れる判定はこちらが持つ。
 *
 * ## `/reload` で置き去りにしない
 *
 * 復活する時刻を**プレイヤーの動的プロパティ**に持つ。
 * メモリだけに持つと、読み込み直したときに
 * **観戦者のまま戻れなくなる**（`docs/spec/11-match.md` R-1）。
 */

import { EntityDamageCause, GameMode, system, world, type Entity, type Player } from "@minecraft/server";

import { ARENAS, type Team } from "../../lib/arena.js";
import { isRunning, teamOf } from "../../lib/match-state.js";
import { grantSpawnProtection } from "../combat/index.js";
import { giveLoadout } from "../loadout/index.js";
import { KILL_GAS } from "../grapple/index.js";
import { addGas, refillGas } from "../grapple/gas.js";

/** 倒れてから戻るまで（tick）。**5 秒**（`docs/01-rules.md` 4-2） */
const DOWN_TICKS = 100;

/**
 * 復活する時刻を覚えておく名前。
 *
 * **プレイヤーに紐づく。** 読み込み直しても残る。
 */
const KEY_REVIVE = "cw:revive_at";

/** 倒れる前に居たチーム。**戻す場所を決めるのに要る** */
const KEY_TEAM = "cw:down_team";

/**
 * 奈落と見なす高さ。
 *
 * **落ちきる前に倒れたことにする。**
 * 奈落の damage は取り消しが効かないことがあるので、
 * 体力を待たずに高さで判断する。
 */
const VOID_Y = -70;

/**
 * 最後に殴られてから、その相手の手柄とみなす長さ（tick）。**10 秒。**
 *
 * **奈落へ落ちたとき、誰のせいかを決めるのに使う。**
 * 落とした側にダメージの記録は残らないので、直前の殴り合いから推測する。
 *
 * 長すぎると無関係な相手の手柄になり、
 * 短すぎると**突き落として離れた相手**を取り逃がす。
 */
const ASSIST_TICKS = 200;

/**
 * 倒れた理由。
 *
 * **文面が変わるだけでなく、誰の手柄かの決め方も変わる。**
 *
 * | | 誰の手柄か |
 * | --- | --- |
 * | `hit` | ダメージを与えた相手 |
 * | `void` / `fall` | **直前に殴ってきた相手**（落とした側に記録が残らない） |
 */
export type DownCause = "hit" | "void" | "fall";

// ---------------------------------------------------------------- 落下ダメージ
//
// **バニラより緩くする**（`docs/spec/14-death.md` 6章）。
// 立体機動で高い所を行き来するゲームなので、
// バニラのまま（4 マスから 1 マスごとに 1）だと**落ちた時点で終わる。**

/** ここまでは痛くない（マス） */
const FALL_FREE = 15;

/** これだけ落ちるごとに 1 ダメージ（マス） */
const FALL_STEP = 3;

/**
 * バニラが痛くない高さ（マス）。
 *
 * **落ちた距離を、バニラのダメージから逆算する**のに使う。
 * バニラは「落ちた距離 − 3」がダメージなので、3 を足せば距離が出る。
 *
 * 距離を自分で数えるより確実。**空中に居た時間を追う必要が無い。**
 */
const VANILLA_FALL_FREE = 3;

/**
 * いま自分でダメージを与えている最中の人。
 *
 * **与えたダメージがまた自分に返ってくる**ので、
 * その 1 回だけは素通りさせる。無いと無限に縮み続ける。
 */
const applying = new Set<string>();

/** 落ちた距離から、こちらのダメージを出す */
function fallDamage(distance: number): number {
  if (distance < FALL_FREE) return 0;
  return Math.floor((distance - FALL_FREE) / FALL_STEP) + 1;
}

/** 誰に、いつ殴られたか。**メモリだけ。** 読み込み直しで消えてよい */
const lastHit = new Map<string, { by: string; at: number }>();

/** 落とさないもの。**拾われても意味が無く、場に増え続ける** */
const KEEP: ReadonlySet<string> = new Set(["game:starter_sword", "game:grapple"]);

/** いま倒れているか */
function isDown(player: Player): boolean {
  return typeof player.getDynamicProperty(KEY_REVIVE) === "number";
}

/**
 * 持ち物を落とす。
 *
 * `docs/01-rules.md` 4-4。**倒した側が拾える。**
 *
 * ゲーム側の死亡処理を使わないので**自分で落とす。**
 * 落とし忘れると「死んでも何も失わない」ゲームになり、攻める理由が消える。
 */
function dropAll(player: Player): void {
  const inv = player.getComponent("minecraft:inventory");
  const container = inv?.container;
  if (container === undefined) return;

  const dim = player.dimension;
  const at = player.location;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (item === undefined) continue;
    container.setItem(i, undefined);
    // **支給品は落とさない。** 拾われても意味が無い
    if (KEEP.has(item.typeId)) continue;
    try {
      dim.spawnItem(item, at);
    } catch {
      // 読み込まれていない。**落とせなかったぶんは消える**
    }
  }
}

/**
 * 倒れる。
 *
 * **順番が大事**（`docs/spec/14-death.md` 2章）。
 * 観戦者にしてから落とすと、落ちる場所がずれる。
 */
export function goDown(player: Player, killer?: Entity, cause: DownCause = "hit"): void {
  if (isDown(player)) return;

  const team = teamOf(player);
  dropAll(player);

  try {
    player.setGameMode(GameMode.Spectator);
  } catch {
    /* 消えている */
  }

  player.setDynamicProperty(KEY_REVIVE, system.currentTick + DOWN_TICKS);
  if (team !== undefined) player.setDynamicProperty(KEY_TEAM, team);

  // ---- 倒した側にガスを返す（docs/spec/13-grapple.md 2章）
  //
  // **本当の死亡が起きないので、こちらで配る。**
  // `entityDie` は来ない
  if (killer !== undefined && killer.typeId === "minecraft:player" && killer.id !== player.id) {
    addGas(killer as Player, KILL_GAS);
  }

  // ---- キルログ
  //
  // **本当の死亡が起きないので、ゲーム側のログは出ない。**
  // 出すならこちらで作る。
  //
  // 誰が誰を倒したかは、**攻めたぶんが伝わる唯一の表示。**
  // コアの残り回数しか出ないと、戦っている手応えが画面に出ない
  try {
    world.sendMessage(byWhom(player, killer, cause));
  } catch {
    /* 名前が読めない */
  }
  lastHit.delete(player.id);
}

/**
 * 奈落へ落とした相手を探す。
 *
 * **落ちた側にしか記録が無い。**
 * 直前に殴ってきた相手を、そのまま「落とした側」とみなす。
 */
function pusher(player: Player): Player | undefined {
  const rec = lastHit.get(player.id);
  if (rec === undefined || system.currentTick - rec.at > ASSIST_TICKS) return undefined;
  return world.getAllPlayers().find((p) => p.id === rec.by);
}

/** チームの色。**どちら側が倒したか一目で分かるように** */
const TEAM_COLOR: Readonly<Record<Team, string>> = { red: "§c", blue: "§9" };

/** 名前を、所属の色付きで返す */
function colored(player: Player): string {
  const t = teamOf(player);
  return `${t === undefined ? "§f" : TEAM_COLOR[t]}${player.name}§r`;
}

/** キルログの文面 */
function byWhom(dead: Player, killer: Entity | undefined, cause: DownCause): string {
  // ---- 落ちて倒れた
  //
  // **落としたのが誰かは、直前の殴り合いから決める**（`pusher`）。
  // 相手が居なければ自滅
  if (cause !== "hit") {
    const where = cause === "void" ? "奈落" : "落下";
    const by = killer !== undefined && killer.typeId === "minecraft:player" ? (killer as Player) : undefined;
    if (by !== undefined && by.id !== dead.id) {
      return `§7☠ ${colored(dead)}§7 は ${colored(by)}§7 によって${where}させられた`;
    }
    return `§7☠ ${colored(dead)}§7 は${where}で自滅した`;
  }

  if (killer === undefined) return `§7☠ ${colored(dead)}§7 は倒れた`;
  if (killer.typeId === "minecraft:player") {
    const k = killer as Player;
    // **自滅は分けて出す。** 相手の手柄と混ざると戦況を読み違える
    if (k.id === dead.id) return `§7☠ ${colored(dead)}§7 は自滅した`;
    return `§7☠ ${colored(dead)}§7 ← ${colored(k)}`;
  }
  return `§7☠ ${colored(dead)}§7 は倒れた`;
}

/** 戻す場所。**所属が分からなければその場** */
function revivePoint(player: Player): { x: number; y: number; z: number } | undefined {
  const raw = player.getDynamicProperty(KEY_TEAM);
  const team = raw === "red" || raw === "blue" ? (raw as Team) : teamOf(player);
  if (team === undefined) return undefined;
  return ARENAS[0].spawns[team];
}

/** 戻す */
function revive(player: Player): void {
  player.setDynamicProperty(KEY_REVIVE, undefined);
  player.setDynamicProperty(KEY_TEAM, undefined);

  try {
    player.setGameMode(GameMode.Survival);
  } catch {
    /* 消えている */
  }

  const at = revivePoint(player);
  if (at !== undefined) {
    try {
      player.teleport(at, { dimension: player.dimension });
    } catch {
      /* 読み込まれていない。次の機会に */
    }
  }

  // **体力を戻す。** 飾りとはいえ、満タンで始まらないと見た目がおかしい
  try {
    const h = player.getComponent("minecraft:health");
    if (h !== undefined) h.resetToMaxValue();
  } catch {
    /* 消えている */
  }

  refillGas(player);
  giveLoadout(player);
  grantSpawnProtection(player);
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function startDeath(): void {
  system.runInterval(() => {
    const running = isRunning();
    for (const player of world.getAllPlayers()) {
      const at = player.getDynamicProperty(KEY_REVIVE);

      // ---- 倒れている人を戻す
      if (typeof at === "number") {
        // **試合が止まったら即座に戻す。** 観戦者のまま置き去りにしない
        if (!running || system.currentTick >= at) revive(player);
        continue;
      }

      // ---- 奈落（docs/spec/14-death.md 3章）
      if (player.location.y < VOID_Y) {
        // **落とした相手が居れば、その人の手柄にする**
        if (running) goDown(player, pusher(player), "void");
        else {
          try {
            player.teleport(ARENAS[0].spawns.blue, { dimension: player.dimension });
          } catch {
            /* 読み込まれていない */
          }
        }
      }
    }
  }, 5);
}

/**
 * 致命傷を取り消す。
 *
 * **体力が 0 になる前に止める。**
 * ここを通さないと死亡画面が出て、待ち時間の管理を奪われる。
 */
export function registerDeathGuard(): void {
  world.beforeEvents.entityHurt.subscribe(
    (ev) => {
      if (ev.hurtEntity.typeId !== "minecraft:player") return;
      const player = ev.hurtEntity as Player;
      let now = 0;
      try {
        now = player.getComponent("minecraft:health")?.currentValue ?? 0;
      } catch {
        return;
      }
      const killer = ev.damageSource.damagingEntity;

      // ---- 落下ダメージを差し替える（docs/spec/14-death.md 6章）
      //
      // **バニラのぶんを取り消し、こちらの計算で与え直す。**
      // 与え直したぶんはここへ戻ってくるので、その 1 回だけ素通りさせる。
      // 与え直す形にするのは、**装備や魔法での軽減を engine に任せる**ため
      if (ev.damageSource.cause === EntityDamageCause.fall && !applying.has(player.id)) {
        ev.cancel = true;
        const distance = ev.damage + VANILLA_FALL_FREE;
        const hurt = fallDamage(distance);
        if (hurt > 0) {
          system.run(() => {
            applying.add(player.id);
            try {
              player.applyDamage(hurt, { cause: EntityDamageCause.fall });
            } catch {
              /* 消えている */
            }
            applying.delete(player.id);
          });
        }
        return;
      }

      // **殴られた記録を残す。** 奈落へ落ちたときに誰のせいか決めるのに使う
      if (killer !== undefined && killer.typeId === "minecraft:player" && killer.id !== player.id) {
        lastHit.set(player.id, { by: killer.id, at: system.currentTick });
      }

      // **致命傷でなければ普通に減らす。** 体力の表示は残したい
      if (now - ev.damage > 0) return;

      ev.cancel = true;
      // **落下は殴った相手が居ない。** 直前に殴ってきた相手を探す
      const fall = ev.damageSource.cause === EntityDamageCause.fall;
      const blame = fall ? pusher(player) : killer;
      system.run(() => {
        // 試合中でなければ、体力を戻すだけ（docs/spec/14-death.md 5章）
        if (!isRunning()) {
          try {
            player.getComponent("minecraft:health")?.resetToMaxValue();
          } catch {
            /* 消えている */
          }
          return;
        }
        goDown(player, blame, fall ? "fall" : "hit");
      });
    },
    // **プレイヤーに来たものだけ受け取る。**
    // 全実体のダメージを毎回見るのは無駄が大きい
    { entityFilter: { type: "minecraft:player" } }
  );
}
