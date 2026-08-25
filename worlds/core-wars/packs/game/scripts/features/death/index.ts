/**
 * 死亡と復活。
 *
 * 仕様は `docs/spec/14-death.md`。
 *
 * ## 死なせない
 *
 * **致命傷を打ち消して、こちらで「倒れた」ことにする。**
 *
 * ゲーム側の死亡が起きると、
 * **チャットを開いたまま死んだときに「リスポーン中…」から戻れなくなる。**
 * 死亡画面を出さない設定（`doImmediateRespawn`）でも起きた（2026-08-25）。
 *
 * 死なせなければ、その画面自体が出ない。
 *
 * ## 致命傷かどうかは見積もる
 *
 * `entityHurt` の before で渡される `damage` は**軽減する前の値。**
 * 防具でどれだけ減るかは、**入った後にしか分からない。**
 *
 * だから**前の一撃から軽減率を測って**見積もる。
 * 装備は一撃ごとには変わらないので、直前の率で足りる。
 *
 * ## 外したときの受け皿を残す
 *
 * 見積もりを外して本当に死んでしまっても、
 * **`entityDie` が拾って同じ流れに乗せる。**
 *
 * 見積もりは「画面のちらつきを避けるための最適化」であって、
 * **正しさはこちらの受け皿が保証する。**
 */

import {
  EntityDamageCause,
  EquipmentSlot,
  GameMode,
  GameRule,
  system,
  world,
  type Entity,
  type EntityDamageSource,
  type ItemStack,
  type Player,
} from "@minecraft/server";

import { ARENAS, type Team } from "../../lib/arena.js";
import { isRunning, shouldBeInBattle, teamOf } from "../../lib/match-state.js";
import { grantSpawnProtection } from "../combat/index.js";
import { giveLoadout } from "../loadout/index.js";
import { GRAPPLE_ITEM, GRAPPLE_ITEMS, KILL_GAS, isGrappleItem } from "../grapple/index.js";
import { GRAPPLE2_ITEM } from "../grapple2/index.js";
import { addGas, refillGas } from "../grapple/gas.js";
import { fxDown, fxKill, fxRevive, fxTick, title } from "../../lib/fx.js";
import { lobbyPoint } from "../../lib/lobby.js";
import { addDeath, addKill, addStreak } from "../../lib/stats.js";
import { clearAbsorb } from "../../lib/absorb.js";
import { clearDart } from "../spotting/index.js";
import { tntFrom, tntOwnerId } from "../special/tnt.js";

/** 倒れてから戻るまで（tick）。**5 秒**（`docs/01-rules.md` 4-2） */
const DOWN_TICKS = 100;

/** 復活する時刻を覚えておく名前。**プレイヤーに紐づく** */
const KEY_REVIVE = "cw:revive_at";

/** 倒れる前に居たチーム。**戻す場所を決めるのに要る** */
const KEY_TEAM = "cw:down_team";

/** 倒れた場所。**そこで観戦させる** */
const KEY_SPOT = "cw:down_spot";

/**
 * 奈落と見なす高さ。
 *
 * **落ちきる前に倒れたことにする。** 結果はもう見えている。
 */
const VOID_Y = -70;

/**
 * 最後に殴られてから、その相手の手柄とみなす長さ（tick）。**10 秒。**
 *
 * 落ちて倒れたとき、**落とした側にダメージの記録は残らない**ので、
 * 直前の殴り合いから推測する。
 */
const ASSIST_TICKS = 200;

/** 倒れた理由。**文面と、誰の手柄かの決め方が変わる** */
export type DownCause = "hit" | "void" | "fall";

// ---------------------------------------------------------------- 落下ダメージ
//
// **バニラより緩くする**（`docs/spec/14-death.md` 6章）。
// 立体機動で高い所を行き来するので、
// バニラのまま（4 マスから 1 マスごとに 1）だと**落ちた時点で終わる。**

/** ここまでは痛くない（マス）。**8 マスから痛い**（2026-08-25 変更） */
const FALL_FREE = 8;

/** これだけ落ちるごとに 1 ダメージ（マス） */
const FALL_STEP = 2;

/**
 * バニラが痛くない高さ（マス）。
 *
 * **落ちた距離を、バニラのダメージから逆算する**のに使う。
 * バニラは「落ちた距離 − 3」がダメージなので、3 を足せば距離が出る。
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

// ---------------------------------------------------------------- 軽減率
//
// **before では軽減する前の値しか分からない。**
// after と突き合わせて初めて「どれだけ減ったか」が出る。

/** 実測した軽減率。**既定は 1（軽減なし）** */
const mitigation = new Map<string, number>();

/** 軽減する前の値。**after で突き合わせるまで覚えておく** */
const rawDamage = new Map<string, number>();

/** 見積もりの下限。**防具の軽減は 80% が上限** */
const MIN_RATIO = 0.2;

/** 誰に、いつ殴られたか。**メモリだけ。** 読み込み直しで消えてよい */
const lastHit = new Map<string, { by: string; at: number }>();

/**
 * 一撃を受ける**前**の体力。
 *
 * ## なぜ覚えておくのか
 *
 * `entityHurt` の before で体力を読むと、
 * **その一撃のぶんが既に引かれた値**が返ってくる（2026-08-25 に実測）。
 *
 * ```
 * 体力 20 → ジャンプ切り 13.39
 *   読めた体力: 6.61   ← もう引かれている
 *   そこから更に 13.39 を引いて −6.78 → 致命傷と誤判定
 * ```
 *
 * **二重に引いていた。** これが「2 発で死ぬ」「ワンパン」の正体。
 *
 * ## 毎 tick 控えておく
 *
 * ダメージは体力を減らすだけなので、
 * **控えた値と今の値の大きいほう**が「受ける前」になる。
 * どちらが先に走るかを気にしなくて済む。
 */
const hpSnapshot = new Map<string, number>();

/** 一撃を受ける前の体力。**控えと今の、大きいほう** */
function healthBeforeHit(player: Player): number | undefined {
  const live = healthOf(player);
  const kept = hpSnapshot.get(player.id);
  if (live === undefined) return kept;
  if (kept === undefined) return live;
  return Math.max(live, kept);
}

/**
 * ダメージの中身を見せるか。**`/game:dmglog` で切り替える。**
 *
 * 推測で追うと、**直すたびに別の理由が出てくる。**
 * 生の値・軽減率・体力を並べれば、1 回殴られれば分かる。
 */
let dmgLog = false;

/** 切り替える。**運営のコマンドから呼ぶ** */
export function toggleDamageLog(): boolean {
  dmgLog = !dmgLog;
  return dmgLog;
}

/** 見せる相手。**倒れた本人と、切り替えた運営** */
function tell(player: Player, line: string): void {
  if (!dmgLog) return;
  try {
    player.sendMessage(line);
  } catch {
    /* 消えている */
  }
}

/**
 * 体力を読む。**読めなければ `undefined`。**
 *
 * **0 で埋めない。**
 * 「読めない」と「尽きている」はまったく別で、
 * 0 として扱うと**どんな一撃でも倒れる**（2026-08-24 の事故）。
 */
function healthOf(player: Player): number | undefined {
  try {
    return player.getComponent("minecraft:health")?.currentValue;
  } catch {
    return undefined;
  }
}

/** いま倒れているか */
function isDown(player: Player): boolean {
  return typeof player.getDynamicProperty(KEY_REVIVE) === "number";
}

/** 落とさないもの。**拾われても意味が無く、場に増え続ける** */
const KEEP: ReadonlySet<string> = new Set([
  // **ワイヤーを撃てるものは全部残す**（剣もワイヤー射出装置。13-grapple.md 9 章）
  ...GRAPPLE_ITEMS,
  GRAPPLE2_ITEM,
  "game:join_yes",
  "game:join_no",
]);

/**
 * 持ち物を落とす。
 *
 * `docs/01-rules.md` 4-4。**倒した側が拾える。**
 *
 * ゲーム側の死亡を使わないので**自分で落とす。**
 * 落とし忘れると「死んでも何も失わない」ゲームになり、攻める理由が消える。
 */
function dropAll(player: Player): void {
  const dim = player.dimension;
  const at = player.location;

  const put = (item: ItemStack): void => {
    try {
      dim.spawnItem(item, at);
    } catch {
      // 読み込まれていない。**落とせなかったぶんは消える**
    }
  };

  const container = player.getComponent("minecraft:inventory")?.container;
  if (container !== undefined) {
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (item === undefined) continue;
      // **支給品は落とさない。** 拾われても意味が無い
      if (KEEP.has(item.typeId)) continue;
      container.setItem(i, undefined);
      put(item);
    }
  }

  // ---- **着ている防具も落とす**（2026-08-25 追加）
  //
  // 持ち物の枠しか見ていなかったので、**防具だけ残っていた。**
  // バニラの死亡（打ち消しが間に合わなかったとき）は防具も落とすので、
  // **同じ死に方でも落ちたり落ちなかったりしていた。**
  //
  // 防具は買い物の主役（`docs/spec/12-shop.md`）。
  // 落ちないなら、倒しても相手の装備は減らない
  //
  // **頭は触らない。** チームの帽子が入っている
  //（`docs/spec/15-presentation.md` 7-2）
  const eq = player.getComponent("minecraft:equippable");
  if (eq === undefined) return;
  for (const slot of [EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
    try {
      const worn = eq.getEquipment(slot);
      if (worn === undefined || KEEP.has(worn.typeId)) continue;
      eq.setEquipment(slot, undefined);
      put(worn);
    } catch {
      /* 外せなかった。次の枠へ */
    }
  }
}

/**
 * 倒れる。
 *
 * @param dropped 持ち物が**もう落ちているか**。
 *   ゲーム側の死亡が起きた場合はバニラが落としているので、二重に落とさない。
 */
export function goDown(
  player: Player,
  killer?: Entity,
  cause: DownCause = "hit",
  dropped = false,
  kind?: HitKind
): void {
  if (isDown(player)) return;

  const team = teamOf(player);
  const at = player.location;

  if (!dropped) dropAll(player);

  try {
    player.setGameMode(GameMode.Spectator);
  } catch {
    /* 消えている */
  }

  // ---- **効果を全部落とす**（2026-08-25 追加）
  //
  // 倒れたのに**金のリンゴの吸収や強化が残っていた。**
  // 復活したときに前の効果を持ったまま戻るのでは、
  // **倒された不利が消える。**
  //
  // **倒れ方で分けない。** 奈落も自滅も倒されたときも同じ
  clearEffects(player);
  // **増えている分も 0 に戻す**（lib/absorb.ts）
  clearAbsorb(player.id);
  // **ダーツも抜ける**（docs/spec/23-drone.md 4 章）。
  // 刺さったまま復活すると、**死んでも位置が漏れ続ける**
  clearDart(player.id);

  player.setDynamicProperty(KEY_REVIVE, system.currentTick + DOWN_TICKS);
  if (team !== undefined) player.setDynamicProperty(KEY_TEAM, team);
  player.setDynamicProperty(KEY_SPOT, JSON.stringify({ x: at.x, y: at.y, z: at.z }));

  // ---- 戦績を数える（docs/spec/15-presentation.md 4-4）
  addDeath(player);
  const byPlayer = killer !== undefined && killer.typeId === "minecraft:player" && killer.id !== player.id;
  if (byPlayer) {
    addKill(killer as Player);
    // **倒した側にガスを返す**（docs/spec/13-grapple.md 2章）
    addGas(killer as Player, KILL_GAS);
    // **連続で倒しているなら知らせる**（docs/spec/15-presentation.md 4-1-A）
    announceStreak(killer as Player);
  }

  try {
    world.sendMessage(byWhom(player, killer, cause, kind));
  } catch {
    /* 名前が読めない */
  }

  fxDown(player);
  if (byPlayer) fxKill(killer as Player, killLine(player, cause));

  lastHit.delete(player.id);
}

/**
 * 落として倒した相手を探す。
 *
 * **落ちた側にしか記録が無い。**
 * 直前に殴ってきた相手を、そのまま「落とした側」とみなす。
 */
function pusher(player: Player): Player | undefined {
  const rec = lastHit.get(player.id);
  if (rec === undefined || system.currentTick - rec.at > ASSIST_TICKS) return undefined;
  return world.getAllPlayers().find((p) => p.id === rec.by);
}

/** 火の点いた TNT の実体 */
const TNT_ENTITY = "minecraft:tnt";

/**
 * その一撃は誰のせいか。
 *
 * **仕掛けた道具ではなく、仕掛けた人を返す**（`docs/spec/14-death.md` 3 章）。
 *
 * | 何が当たったか | 誰のせいになるか |
 * | --- | --- |
 * | 人が殴った | **その人** |
 * | 矢・雪玉 | **撃った人**（バニラが撃った人を入れてくれる） |
 * | **TNT の爆風** | **火を点けた人**（こちらで印を付けてある） |
 * | それ以外 | 誰のせいでもない |
 *
 * TNT だけは `damagingEntity` が**実体そのもの**になる。
 * そのままだと**誰も倒したことにならない**ので、印から持ち主を引く。
 */
function blameOf(source: EntityDamageSource): Entity | undefined {
  const by = source.damagingEntity;
  if (by === undefined) return undefined;
  let typeId: string;
  try {
    typeId = by.typeId;
  } catch {
    return undefined;
  }
  if (typeId !== TNT_ENTITY) return by;

  const ownerId = tntOwnerId(by);
  if (ownerId === undefined) return undefined;
  return world.getAllPlayers().find((p) => p.id === ownerId);
}

/** チームの色。**どちら側が倒したか一目で分かるように** */
const TEAM_COLOR: Readonly<Record<Team, string>> = { red: "§c", blue: "§9" };

/** 名前を、所属の色付きで返す */
function colored(player: Player): string {
  const t = teamOf(player);
  return `${t === undefined ? "§f" : TEAM_COLOR[t]}${player.name}§r`;
}

/**
 * 効果を全部落とす。
 *
 * **持っているものを数えてから消す。**
 * 種類を並べて消すやり方だと、**新しい効果が増えたときに漏れる。**
 */
function clearEffects(player: Player): void {
  try {
    for (const effect of player.getEffects()) {
      try {
        player.removeEffect(effect.typeId);
      } catch {
        /* 消せなかった。次の効果へ */
      }
    }
  } catch {
    /* 消えている */
  }
}

/** 何人ごとに知らせるか。**5 人ごと** */
const STREAK_STEP = 5;

/**
 * 連続で倒していることを全体に知らせる。
 *
 * **止められていないことを、止められる側に伝える。**
 * 誰が荒らしているのか分からないままだと、**誰も止めに行かない。**
 *
 * **区切りでだけ出す。** 毎回出すとキルログと二重になる。
 */
function announceStreak(killer: Player): void {
  const n = addStreak(killer);
  if (n < STREAK_STEP || n % STREAK_STEP !== 0) return;
  try {
    // **名前と数だけ。** 流れるチャットの中では、文にすると長い（2026-08-25 変更）
    world.sendMessage(`§6⚔ ${colored(killer)}§6 §l${n}§r§6キルストリーク！`);
  } catch {
    /* 名前が読めない */
  }
}

/**
 * 倒した側の画面に出す文面。
 *
 * **誰をどう倒したのかを出す**（2026-08-25 変更）。
 * 「倒した」だけでは、**乱戦で誰を倒したのか分からない。**
 *
 * 名前は相手の所属の色にする。チャットのキルログと**同じ見た目**にして、
 * 見比べなくても同じ出来事だと分かるようにする。
 */
function killLine(dead: Player, cause: DownCause): string {
  const how = cause === "void" ? "§7を奈落に落とした" : cause === "fall" ? "§7を落とした" : "§7を倒した";
  return `§a☠ ${colored(dead)}${how}`;
}

/**
 * 何で倒れたか。**engine の列挙をそのまま持ち回らない。**
 *
 * TNT は**ドローンから落とした分を書き分ける**ので、
 * 原因だけでは足りない（`docs/spec/14-death.md` 3 章）。
 * **こちらの語彙に一度translateする。**
 */
export type HitKind =
  "melee" | "projectile" | "tnt" | "drone_tnt" | "lava" | "drowning" | "suffocation" | "contact" | "magic";

/** 何で倒れたかを読み取る。**断定できないなら undefined** */
function kindOf(source: EntityDamageSource): HitKind | undefined {
  switch (source.cause) {
    case EntityDamageCause.entityAttack:
      return "melee";
    case EntityDamageCause.projectile:
      return "projectile";
    case EntityDamageCause.magic:
    case EntityDamageCause.wither:
      return "magic";
    case EntityDamageCause.lava:
      return "lava";
    case EntityDamageCause.drowning:
      return "drowning";
    case EntityDamageCause.suffocation:
      return "suffocation";
    case EntityDamageCause.contact:
      return "contact";
    case EntityDamageCause.entityExplosion:
    case EntityDamageCause.blockExplosion:
      break;
    default:
      return undefined;
  }

  // ---- 爆発。**TNT かどうかと、どこから出たかを見る**
  const by = source.damagingEntity;
  if (by === undefined) return "tnt";
  try {
    if (by.typeId !== TNT_ENTITY) return undefined;
  } catch {
    return "tnt";
  }
  return tntFrom(by) === "drone" ? "drone_tnt" : "tnt";
}

/**
 * 倒した人が手に持っていたもの。**分からなければ undefined。**
 *
 * **何で倒したかを言うのに使う。** 殴りは「殴り」としか分からないので、
 * **持ち物だけが手掛かり。**
 */
function weaponOf(killer: Player): string | undefined {
  try {
    return killer.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
  } catch {
    return undefined;
  }
}

/**
 * 倒された言い回し。**「誰に」の後ろに付ける。**
 *
 * 仕様は `docs/spec/14-death.md` 3 章。
 *
 * > **断定できるものは、そう書く。**
 * > 矢印だけでは「何が起きて倒れたのか」が分からない。
 *
 * 断定できないものだけ「に倒された」で受ける。
 */
function killedHow(killer: Player, kind: HitKind | undefined): string {
  switch (kind) {
    case "drone_tnt":
      return "§7 の§bドローン§7の TNT で吹き飛ばされた";
    case "tnt":
      return "§7 の TNT で吹き飛ばされた";
    case "projectile":
      return "§7 に撃たれた";
    case "magic":
      return "§7 に削り切られた";
    case "melee":
      break;
    default:
      // **分からないものは断定しない**
      return "§7 に倒された";
  }

  // ---- 殴り。**何で殴ったかは、持ち物からしか分からない**
  const item = weaponOf(killer);
  // **ワイヤーで倒された、とは書かない**（2026-08-26 変更）。
  // 引っ掛けた線で倒したように読めるが、実際は**振り回して殴っている**
  // **剣もワイヤー射出装置。** 段階で変わるのは火力だけ（13-grapple.md 9 章）
  if (isGrappleItem(item) || item === GRAPPLE2_ITEM) return "§7 に硬い竹で斬られた";
  if (item !== undefined && item.endsWith("_sword")) return "§7 に斬られた";
  if (item !== undefined && item.endsWith("_axe")) return "§7 に叩き斬られた";
  if (item !== undefined && item.endsWith("_pickaxe")) return "§7 にツルハシで殴られた";
  return "§7 に殴り倒された";
}

/**
 * 自分で倒れたときの言い回し。**倒した人が居ないとき。**
 *
 * こちらも**断定できるものだけ**書く。
 */
function diedHow(kind: HitKind | undefined): string | undefined {
  switch (kind) {
    case "drone_tnt":
      return "は自分のドローンの TNT で吹き飛んだ";
    case "tnt":
      return "は自分の TNT で吹き飛んだ";
    case "lava":
      return "は溶岩に落ちた";
    case "drowning":
      return "は溺れた";
    case "suffocation":
      return "は埋まって窒息した";
    case "contact":
      return "は刺さって倒れた";
    default:
      return undefined;
  }
}

/** キルログの文面 */
function byWhom(dead: Player, killer: Entity | undefined, cause: DownCause, kind?: HitKind): string {
  if (cause !== "hit") {
    const where = cause === "void" ? "奈落死" : "落下死";
    const k = killer !== undefined && killer.typeId === "minecraft:player" ? (killer as Player) : undefined;
    if (k !== undefined && k.id !== dead.id) {
      return `§7☠ ${colored(dead)}§7 は ${colored(k)}§7 によって${where}させられた`;
    }
    return `§7☠ ${colored(dead)}§7 は${where}した`;
  }

  if (killer !== undefined && killer.typeId === "minecraft:player") {
    const k = killer as Player;
    // **自滅も死因を書く**（自分の TNT で飛んだのか、ただ削れたのか）
    if (k.id === dead.id) return `§7☠ ${colored(dead)}§7 ${diedHow(kind) ?? "は自滅した"}`;
    // ---- **矢印はやめた**（2026-08-26 変更）
    //
    // `A ← B` は**誰に倒されたかしか言っていない。**
    // 何が起きて倒れたのかが分からないと、
    // **次に同じ倒れ方を避けようが無い**
    return `§7☠ ${colored(dead)}§7 は ${colored(k)}${killedHow(k, kind)}`;
  }

  return `§7☠ ${colored(dead)}§7 ${diedHow(kind) ?? "は倒れた"}`;
}

/** 倒れた場所。**そこで観戦させる** */
function downSpot(player: Player): { x: number; y: number; z: number } | undefined {
  const raw = player.getDynamicProperty(KEY_SPOT);
  if (typeof raw !== "string") return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === "object" && v !== null) return v as { x: number; y: number; z: number };
  } catch {
    /* 壊れていた */
  }
  return undefined;
}

/** 戻す場所 */
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
  player.setDynamicProperty(KEY_SPOT, undefined);

  try {
    player.setGameMode(GameMode.Survival);
  } catch {
    /* 消えている */
  }

  // ---- **戻すときにもう一度落とす**（2026-08-25 追加）
  //
  // 倒れた時点で落としているが、**観戦の 5 秒の間に付くことがある。**
  // 戻ってから消すのは遅い——**戻った瞬間には無い状態**にしておく
  clearEffects(player);

  const at = revivePoint(player);
  if (at !== undefined) {
    try {
      player.teleport(at, { dimension: player.dimension });
    } catch {
      /* 読み込まれていない。次の機会に */
    }
  }

  try {
    player.getComponent("minecraft:health")?.resetToMaxValue();
  } catch {
    /* 消えている */
  }

  refillGas(player);
  giveLoadout(player);
  grantSpawnProtection(player);
  fxRevive(player);
  title(player, "§a復活", "§75 秒間は攻撃を受けない", 30);
}

/**
 * 倒れている状態を強制的に解く。
 *
 * **観戦者のまま試合に加わらせない。**
 */
/**
 * 観戦中か。**倒れて復活を待っている間。**
 *
 * **判定はここに 1 つだけ置く。**
 * 観戦者にするのはこの機能なので、聞く先もここにする
 *（`docs/spec/14-death.md`）。
 *
 * **読めないときは観戦中に倒す。**
 * 分からないまま「生きている」ことにすると、
 * 居ないはずの人が戦っていることになる。
 */
export function isSpectating(player: Player): boolean {
  try {
    return player.getGameMode() === GameMode.Spectator;
  } catch {
    return true;
  }
}

export function forceAlive(player: Player): void {
  player.setDynamicProperty(KEY_REVIVE, undefined);
  player.setDynamicProperty(KEY_TEAM, undefined);
  player.setDynamicProperty(KEY_SPOT, undefined);
  try {
    // ---- **遊べないモードのまま試合に入れない**（2026-08-25 変更）
    //
    // スペクテイター（倒れたまま抜けた人）だけを見ていたが、
    // **アドベンチャーのまま入ってくる人が居た。**
    // ブロックを壊せず置けないので、**立っているだけで何もできない。**
    // 本人には理由が出ないので、こちらで直す（`docs/spec/11-match.md` 7-1）。
    //
    // **クリエイティブだけは触らない。**
    // 運営が意図して入っていることがある
    const mode = player.getGameMode();
    if (mode !== GameMode.Survival && mode !== GameMode.Creative) {
      player.setGameMode(GameMode.Survival);
    }
    player.getComponent("minecraft:health")?.resetToMaxValue();
  } catch {
    /* 消えている */
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function startDeath(): void {
  // ---- **体力を毎 tick 控える**（`hpSnapshot` の説明）
  //
  // before で読める体力は**もう引かれた後**なので、
  // 引かれる前の値をこちらで持っておく
  system.runInterval(() => {
    for (const p of world.getAllPlayers()) {
      const hp = healthOf(p);
      if (hp !== undefined) hpSnapshot.set(p.id, hp);
    }
  }, 1);

  system.runInterval(() => {
    const running = isRunning();
    for (const player of world.getAllPlayers()) {
      const at = player.getDynamicProperty(KEY_REVIVE);

      // ---- 倒れている人を戻す
      if (typeof at === "number") {
        if (!running || system.currentTick >= at) {
          revive(player);
          continue;
        }
        // **待たされている時間を、待っていると分かる形にする**
        const left = Math.ceil((at - system.currentTick) / 20);
        title(player, `§c${left}`, "§7復活まで", 12);
        if ((at - system.currentTick) % 20 < 5) fxTick(player, left);

        // **観戦者から外れていたら戻す。** 倒れているのに動けては困る
        try {
          if (player.getGameMode() !== GameMode.Spectator) player.setGameMode(GameMode.Spectator);
        } catch {
          /* 消えている */
        }

        // **倒れた場所に留める。** 観戦者は動けるので、離れないように
        const spot = downSpot(player);
        if (spot !== undefined) {
          const d = Math.hypot(player.location.x - spot.x, player.location.y - spot.y, player.location.z - spot.z);
          if (d > 12) {
            try {
              player.teleport(spot, { dimension: player.dimension });
            } catch {
              /* 読み込まれていない */
            }
          }
        }
        continue;
      }

      // ---- 奈落（docs/spec/14-death.md 3章）
      if (player.location.y < VOID_Y) {
        if (running) goDown(player, pusher(player), "void");
        else {
          try {
            player.teleport(lobbyPoint(), { dimension: player.dimension });
            player.getComponent("minecraft:health")?.resetToMaxValue();
          } catch {
            /* 読み込まれていない */
          }
        }
      }
    }
  }, 5);
}

/**
 * ダメージを受け取る。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerDeathGuard(): void {
  system.run(() => {
    try {
      // **受け皿として残す。** 見積もりを外して本当に死んでも、画面を出さない
      world.gameRules[GameRule.DoImmediateRespawn] = true;
      // **持ち物は落ちる**（docs/01-rules.md 4-4）
      world.gameRules[GameRule.KeepInventory] = false;
      world.gameRules[GameRule.Pvp] = true;
      world.gameRules[GameRule.FallDamage] = true;
    } catch {
      /* 設定できなかった */
    }
  });

  // ---- 見積もりを外して本当に死んだときの受け皿
  //
  // **正しさはこちらが保証する。**
  // 打ち消しは「画面のちらつきを避けるための最適化」でしかない
  world.afterEvents.entityDie.subscribe(
    (ev) => {
      const player = ev.deadEntity as Player;
      const killer = blameOf(ev.damageSource);
      const fall = ev.damageSource.cause === EntityDamageCause.fall;
      const kind = kindOf(ev.damageSource);
      system.run(() => {
        tell(player, "§8[dmg] → 本当に死んだ（打ち消しが間に合わなかった）");
        if (!isRunning()) return;
        // **持ち物はバニラが落としている。** 二重に落とさない
        goDown(player, killer ?? (fall ? pusher(player) : undefined), fall ? "fall" : "hit", true, kind);
      });
    },
    { entityTypes: ["minecraft:player"] }
  );

  // ---- 実際に入った値から軽減率を測る
  world.afterEvents.entityHurt.subscribe(
    (ev) => {
      const id = ev.hurtEntity.id;
      const raw = rawDamage.get(id);
      rawDamage.delete(id);
      if (raw === undefined || raw <= 0) return;
      const r = ev.damage / raw;
      const hp = healthOf(ev.hurtEntity as Player);
      tell(
        ev.hurtEntity as Player,
        `§8[dmg]   実際に入った ${ev.damage.toFixed(2)} / 生は ${raw.toFixed(2)}` +
          ` / 率 ${r.toFixed(2)}${r > 1 ? " §c← 生より大きい" : ""}` +
          ` / 残り ${hp === undefined ? "読めない" : hp.toFixed(2)}`
      );
      // **外れ値は捨てる。** 1 を超えるのは計算違い
      if (!Number.isFinite(r) || r <= 0 || r > 1) return;
      mitigation.set(id, Math.max(MIN_RATIO, r));
    },
    { entityTypes: ["minecraft:player"] }
  );

  world.beforeEvents.entityHurt.subscribe(
    (ev) => {
      // **他の購読が既に打ち消しているなら触らない**（味方への攻撃・無敵）
      if (ev.cancel) return;
      if (ev.hurtEntity.typeId !== "minecraft:player") return;
      const player = ev.hurtEntity as Player;
      if (isDown(player)) return;

      const killer = blameOf(ev.damageSource);

      // **殴られた記録を残す。** 落ちて倒れたときに誰のせいか決めるのに使う
      //
      // **TNT で吹き飛ばされて奈落へ落ちた場合も、点けた人の手柄**——
      // `blameOf` が持ち主を返すので、ここは何も変わらない
      if (killer !== undefined && killer.typeId === "minecraft:player" && killer.id !== player.id) {
        lastHit.set(player.id, { by: killer.id, at: system.currentTick });
      }

      // ---- 落下ダメージを差し替える（docs/spec/14-death.md 6章）
      if (ev.damageSource.cause === EntityDamageCause.fall && !applying.has(player.id)) {
        ev.cancel = true;

        // ---- **試合に出ていないなら落下ダメージは無い**（2026-08-25 追加）
        //
        // ロビーはワイヤーの**練習をする場所**
        //（`docs/spec/13-grapple.md` 6章）。
        // 落ちるたびに減っては、試すこと自体ができない。
        //
        // 打ち消しはそのまま。**バニラのぶんも入れない**
        if (!shouldBeInBattle(player)) return;

        const hurt = fallDamage(ev.damage + VANILLA_FALL_FREE);
        if (hurt <= 0) return;
        system.run(() => {
          applying.add(player.id);
          try {
            player.applyDamage(hurt, { cause: EntityDamageCause.fall });
          } catch {
            /* 消えている */
          }
          applying.delete(player.id);
        });
        return;
      }

      // ---- 致命傷なら打ち消して、こちらの流れへ
      //
      // **読めないなら何もしない。** 0 として扱うと、どんな一撃でも倒れる
      // **受ける前の体力を使う。** 読めた値はもう引かれている
      const now = healthBeforeHit(player);
      if (now === undefined) {
        tell(player, "§8[dmg] 体力が読めないので何もしない");
        return;
      }

      const ratio = mitigation.get(player.id) ?? 1;
      rawDamage.set(player.id, ev.damage);

      // **計算そのものを見せる。** 途中の値を並べても、
      // どれとどれを比べたのかが分からないと切り分けられない
      const est = ev.damage * ratio;
      const rest = now - est;
      tell(
        player,
        `§8[dmg] 受ける前 ${now.toFixed(2)} − 見積 ${est.toFixed(2)}` +
          ` (生 ${ev.damage.toFixed(2)} × 率 ${ratio.toFixed(2)})` +
          ` = ${rest.toFixed(2)}  →  ${rest > 0 ? "§a耐える" : "§c倒れる"}` +
          `§8 [${ev.damageSource.cause}]`
      );

      if (rest > 0) return;
      ev.cancel = true;
      const fall = ev.damageSource.cause === EntityDamageCause.fall;
      const blame = killer ?? (fall ? pusher(player) : undefined);
      system.run(() => {
        if (!isRunning()) {
          try {
            player.getComponent("minecraft:health")?.resetToMaxValue();
          } catch {
            /* 消えている */
          }
          return;
        }
        goDown(player, blame, fall ? "fall" : "hit", false, kindOf(ev.damageSource));
      });
    },
    { entityFilter: { type: "minecraft:player" } }
  );
}
