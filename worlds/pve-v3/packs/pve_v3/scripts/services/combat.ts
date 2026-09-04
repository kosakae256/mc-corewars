/**
 * 削る。**通り道はここ 1 本。**
 *
 * 設計は `docs/spec/12-architecture.md` 2-3（**services 層**）。
 *
 * ```
 * 最終攻撃力 → 防御率で削る → HP を引く → 0 なら倒れる
 *                                    ↓
 *                             当たった後のフック
 * ```
 *
 * **武器も、モブの殴りも、最後はここを通る。**
 * 通り道が 1 本なら、**数字が合わないときに見る場所も 1 つ。**
 *
 * ## 基礎と追加を分ける
 *
 * | | 何か | 効果のフック |
 * | --- | --- | --- |
 * | **基礎ダメージ** | 当てた 1 発 | **呼ぶ** |
 * | **追加ダメージ** | 爆ぜる・降る | **呼ばない**（星が星を呼ぶ） |
 */

import { Player, system, type Entity } from "@minecraft/server";

import { finalDamage } from "../core/damage.js";
import { current, damage as cutHp, has, heal, max } from "../state/hp.js";
import { feedback } from "./feedback.js";
import { markDead } from "./presence.js";
import { awardKill } from "./reward.js";
import { popNumber } from "./number.js";

/** 倒した粒。**自分たちで作ったもの**（`resource_packs/pve_v3/particles/`） */
const KILL = "pve_v3:kill_burst";

/** 1 発当てる */
export interface HitOptions {
  /** 撃った人。**居ないこともある**（モブの殴りなど） */
  readonly by?: Player;
  readonly target: Entity;
  /** **最終攻撃力**（`services/attack.ts` で組み立て終えた値） */
  readonly attack: number;
  /** 何で当てたか（武器の識別子など） */
  readonly via?: string;
  /**
   * **何の攻撃か。**
   *
   * **切っておかないと、追加が追加を呼んで止まらなくなる。**
   */
  readonly kind?: HitKind;
  /** **クリティカルだったか。** 表示が変わる */
  readonly crit?: boolean;
  /**
   * **クリティカル前の値。**
   *
   * **特殊攻撃はここを参照する**——クリを二重に乗せない。
   */
  readonly power?: number;
}

/** 何の攻撃か */
export type HitKind = "base" | "extra";

/** 当たったときに渡すもの */
export interface HitInfo extends HitOptions {
  /** **削った値** */
  readonly dealt: number;
  /** 倒したか */
  readonly killed: boolean;
  /** いまの tick */
  readonly now: number;
}

/**
 * 当たった後に呼ばれるもの。
 *
 * **ロール固有の効果はここに挿す。**
 * 挿す側は**「削った値」と「誰が誰に」だけ**を受け取り、
 * **どこから来た攻撃かを知らなくてよい。**
 */
export type HitHook = (info: HitInfo) => void;

/** 効果のフック。**基礎ダメージだけ** */
const hooks: HitHook[] = [];

/** 効果を足す。**トップレベルから 1 度だけ** */
export function onHit(hook: HitHook): void {
  hooks.push(hook);
}

/**
 * いまの防御率（%）。
 *
 * **0 から始めて、持っているものを足す。**
 * **いまは誰も防御を持たない**——硬さは HP だけで表す。
 */
function defenseOf(_target: Entity, _via: string | undefined): number {
  return 0;
}

function call(list: readonly HitHook[], info: HitInfo): void {
  for (const hook of list) {
    try {
      hook(info);
    } catch (err) {
      console.warn(`[hit] ${String(err)}`);
    }
  }
}

/** 当てる。**基礎も追加も、ここを通る** */
export function hit(o: HitOptions): void {
  const { target } = o;
  if (!has(target)) return;

  const now = system.currentTick;
  const dealt = finalDamage(o.attack, defenseOf(target, o.via));
  if (dealt <= 0) return;

  const left = cutHp(target, dealt);
  const killed = left <= 0;
  const info: HitInfo = { ...o, dealt, killed, now };
  const kind = o.kind ?? "base";

  // ---- 手応え（赤く光る・音・ノックバック）
  //
  // **音は通常攻撃だけ**——特殊攻撃でも鳴らすと、
  // **毎秒・毎発ぶんの音が本人の耳元で重なる。**
  feedback(target, o.by, now, kind === "base");

  // ---- ダメージの数字（**敵だけ**）
  if (!(target instanceof Player)) {
    try {
      popNumber(
        target.dimension,
        target.location,
        dealt,
        kind !== "base" ? "extra" : o.crit === true ? "crit" : "base"
      );
    } catch {
      /* 消えている */
    }
  }

  // ---- 効果（**基礎だけ**）
  if (kind === "base") call(hooks, info);

  if (!killed) return;
  down(target, o.by);
}

/**
 * 倒れた。
 *
 * **音は本人にだけ**——**世界に向けて鳴らすと、
 * 遠くの誰かが倒したモブの音まで聞こえる。**
 */
function down(target: Entity, by: Player | undefined): void {
  if (target instanceof Player) {
    // **戦場で倒れたら「戦場で死亡」へ**（`docs/spec/17-state.md` 3-2）——
    // **次の休憩所まで、スペクテイターで待つ。**
    if (markDead(target)) {
      try {
        target.sendMessage("§c倒れた §8— 次の休憩所で戻る");
        target.playSound("random.totem", { volume: 0.4, pitch: 0.8 });
      } catch {
        /* 消えている */
      }
      return;
    }
    // **試合の外**（ロビーでの確認など）は立て直す——
    // **0 のまま置くと、殴られるたびに倒れた合図が鳴り続ける。**
    const cap = max(target) ?? 0;
    if (cap > 0) heal(target, cap);
    try {
      target.sendMessage("§c倒れた §8— 立て直した（試合の外）");
      target.playSound("random.totem", { volume: 0.4, pitch: 0.8 });
    } catch {
      /* 消えている */
    }
    return;
  }
  // **エメラルドは倒れた時点で配る**（消す前に、誰が削ったかを見る）
  awardKill(target, by);
  try {
    const at = target.location;
    target.dimension.spawnParticle(KILL, { x: at.x, y: at.y + 1, z: at.z });
    // **倒した本人にだけ**。距離に関係なく手元で鳴る
    by?.playSound("random.explode", { volume: 0.22, pitch: 1.4 });
    target.remove();
  } catch {
    /* もう居ない */
  }
}

/** いまの HP。**表示用** */
export function hpOf(entity: Entity): { now: number; max: number } | undefined {
  const now = current(entity);
  const cap = max(entity);
  if (now === undefined || cap === undefined) return undefined;
  return { now, max: cap };
}
