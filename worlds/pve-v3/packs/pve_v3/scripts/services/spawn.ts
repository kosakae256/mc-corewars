/**
 * 敵を湧かせる。
 *
 * 仕様は `worlds/pve-v3/docs/spec/16-enemy.md`。
 *
 * ```
 * 出す数と中身 ＝ 敵グループ（★）× 人数
 * 1 体の値     ＝ 固有値 × 人数倍率 × ウェーブ倍率 × 呪い倍率 × 丸め係数
 * ```
 *
 * > ### 一度に全部出さない（`16-enemy.md` 3-4-1）
 * >
 * > **2 秒に 10 体。** 100 体なら 20 秒かけて出る。
 *
 * > ### **湧く場所は、マップごとに登録した点だけ**（`21-spawn-mark.md`）
 * >
 * > 地形から judgement しない。**壁や天井に埋まって出てくる**のを無くすため。
 * > **プレイヤーの半径 3 マス以内には出さない。**
 */

import { CommandPermissionLevel, world, type Entity, type Vector3 } from "@minecraft/server";

import { emeraldOf, ENEMIES, hasteTier, LEGIONS, planOf, statsOf, type EnemyDef } from "../core/enemy.js";
import { multsOf } from "../core/curse.js";
import { curseCount } from "../state/curse.js";
import { wave } from "../state/match.js";
import { FIELD, PLACES } from "../core/places.js";
import { setup, setMax } from "../state/hp.js";
import { setLabel } from "../state/label.js";
import { KEYS } from "../state/keys.js";
import { fieldMap } from "../state/match.js";
import { marks } from "./spawnmark.js";

/** 出す間隔（tick）と、1 回に出す数。**2 秒に 10 体** */
const EVERY = 40;
const PER_BURST = 10;

/** この距離より近くには出さない（マス） */
const KEEP_AWAY = 3;

/** これから出すもの */
interface Pending {
  readonly def: EnemyDef;
  readonly hp: number;
  readonly attack: number;
  /** バニラの移動速度（`minecraft:movement` に入れる） */
  readonly move: number;
  /** 殴る間隔（tick） */
  readonly swing: number;
  /** エメラルド倍率 */
  readonly emerald: number;
  /** 攻撃速度の段（**100 倍**） */
  readonly haste: number;
}

let queue: Pending[] = [];

/** まだ出し切っていないか */
export function spawning(): boolean {
  return queue.length > 0;
}

/** 出しかけを捨てる */
export function stopSpawning(): void {
  queue = [];
}

/**
 * そのウェーブの敵を積む。**出すのは `stepSpawn` が少しずつやる。**
 *
 * @returns 出す予定の数
 */
export function queueLegion(legionId: string, players: number, wave: number): number {
  const legion = LEGIONS[legionId];
  if (legion === undefined) return 0;
  const plan = planOf(legion, Math.max(1, players), wave);
  // **呪いは種類ごとに別の倍率**（`16-enemy.md` 4 章）
  const curse = multsOf(curseCount());
  const next: Pending[] = [];
  for (const pick of plan.picks) {
    for (let i = 0; i < pick.count; i++) {
      const def = pick.enemy;
      const v = statsOf(def, { wave, players: Math.max(1, players), pack: plan.pack, curse });
      next.push({
        def,
        hp: v.hp,
        attack: v.attack,
        move: v.move,
        swing: v.swing,
        // > ### **丸め係数はエメラルドにも掛ける**（2026-09-07）
        // >
        // > **上限で数を削ったぶん、1 体あたりの取り分を増やす。**
        // > **削らなければ 1.0**——**もらえる総量を、数で変えない。**
        emerald: emeraldOf(def) * plan.pack,
        haste: hasteTier(def.interval / v.swing),
      });
    }
  }
  queue = next;
  return next.length;
}

/** 出せなかったことを、運営に 1 度だけ言う */
let warned = false;

/**
 * **いま出してよい点。**
 *
 * **登録された点から、プレイヤーの近くを除いたもの**（`16-enemy.md` 3-4-1）。
 * **同じ点を何度使ってもよい。**
 */
function openSpots(): Vector3[] {
  const map = fieldMap();
  if (map === undefined) return [];
  const people: Vector3[] = [];
  for (const p of world.getAllPlayers()) {
    try {
      people.push(p.location);
    } catch {
      /* 抜けた */
    }
  }
  const out: Vector3[] = [];
  for (const m of marks(map)) {
    const at = { x: m.x + 0.5, y: m.y + 1, z: m.z + 0.5 };
    if (people.some((q) => Math.hypot(q.x - at.x, q.y - at.y, q.z - at.z) <= KEEP_AWAY)) continue;
    out.push(at);
  }
  return out;
}

/** 1 体出す */
function spawnOne(p: Pending, at: Vector3): Entity | undefined {
  try {
    const dim = world.getDimension("overworld");
    const e = dim.spawnEntity(`pve_v3:${p.def.id}`, at);
    setup(e, p.hp);
    setMax(e, p.hp);
    setLabel(e, `§c${p.def.name}`);
    // **攻撃力はその個体に持たせる**（`services/attack.ts` が読む）
    e.setDynamicProperty(KEYS.atk, p.attack);
    e.setDynamicProperty(KEYS.kind, p.def.id);
    e.setDynamicProperty(KEYS.swing, p.swing);
    e.setDynamicProperty(KEYS.emeraldMult, p.emerald);
    // > ### 速さは**その個体に入れる**
    // >
    // > **`minecraft:movement` はビヘイビアに書いた値が既定**だが、
    // > **呪いと人数で変わる**ので、湧いた瞬間に入れ替える。
    try {
      e.getComponent("minecraft:movement")?.setCurrentValue(p.move);
    } catch {
      /* その部品を持たない実体 */
    }
    // > ### 攻撃速度は**部品の差し替え**（`23-enemy-unit.md` 3-3）
    // >
    // > **`cooldown_time` は実行中に書き換えられない。**
    // > **振る速さと当たる速さを揃える**には、こうするしかない。
    try {
      e.triggerEvent(`pve_v3:set_haste_${p.haste}`);
    } catch {
      /* その段を持たない実体。**既定のまま** */
    }
    return e;
  } catch {
    return undefined;
  }
}

/**
 * 待ち行列を進める。**2 秒に 10 体**（`16-enemy.md` 3-4-1）。
 *
 * **点が 1 つも無いマップでは出せない**——運営に 1 度だけ伝える。
 */
export function stepSpawn(now: number): void {
  if (queue.length === 0) {
    warned = false;
    return;
  }
  if (now % EVERY !== 0) return;

  const spots = openSpots();
  if (spots.length === 0) {
    if (!warned) {
      warned = true;
      const map = fieldMap();
      tellSpawnProblem(
        map === undefined
          ? "§cどのマップか分からないので敵を出せない"
          : `§c${map} に湧き点が無い（または全部プレイヤーの近く）§7— 杖で点を打つ`
      );
    }
    return;
  }

  for (let n = 0; n < PER_BURST && queue.length > 0; n++) {
    const p = queue.shift();
    if (p === undefined) break;
    // **同じ点を何度使ってもよい**（`21-spawn-mark.md` 3 章）
    const at = spots[Math.floor(Math.random() * spots.length)];
    if (at === undefined) break;
    spawnOne(p, at);
  }
}

/** 運営にだけ伝える。**黙って何も起きないのが、いちばん困る** */
function tellSpawnProblem(text: string): void {
  for (const p of world.getAllPlayers()) {
    try {
      if (p.commandPermissionLevel !== CommandPermissionLevel.Any) p.sendMessage(`§8[運営] ${text}`);
    } catch {
      /* 抜けた */
    }
  }
}

/** 湧く所の中心（確かめ用） */
export function spawnCenter(): { x: number; y: number; z: number } {
  return { x: PLACES.field.x, y: FIELD.groundY + 1, z: Math.round(FIELD.portalZ * 0.55) };
}

/**
 * **1 体を、その場に呼ぶ**（運営メニューの確認用・`19-map-store.md` 7-1）。
 *
 * **湧き点も待ち行列も通さない。** **値の付け方だけ、湧かせるときと同じ。**
 *
 * @param withWave **いまのウェーブと呪いを乗せるか。** 外すと固有値そのまま
 */
export function summon(id: string, at: Vector3, withWave: boolean): Entity | undefined {
  const def = ENEMIES[id];
  if (def === undefined) return undefined;
  const players = Math.max(1, world.getAllPlayers().length);
  const v = withWave
    ? statsOf(def, { wave: Math.max(1, wave()), players, pack: 1, curse: multsOf(curseCount()) })
    : statsOf(def, { wave: 1, players: 1, pack: 1, curse: { hp: 1, power: 1, speed: 1, haste: 1 } });
  return spawnOne(
    {
      def,
      hp: v.hp,
      attack: v.attack,
      move: v.move,
      swing: v.swing,
      emerald: emeraldOf(def),
      haste: hasteTier((def.interval || 1) / v.swing),
    },
    at
  );
}
