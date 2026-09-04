/**
 * 削る。**通り道はここ 1 本。**
 *
 * 仕様は `docs/spec/11-damage.md` 4 章・5 章。
 *
 * ```
 * 最終攻撃力 → 防御率で削る → HP を引く → 0 なら倒れる
 *                                    ↓
 *                             当たった後のフック
 * ```
 *
 * **武器も、モブの殴りも、属性も、最後はここを通る。**
 * 通り道が 1 本なら、**数字が合わないときに見る場所も 1 つ。**
 *
 * ## 基礎と追加を分ける
 *
 * | | 何か | 効果のフック | 属性 |
 * | --- | --- | --- | --- |
 * | **基礎ダメージ** | 当てた 1 発 | **呼ぶ** | 乗る |
 * | **追加ダメージ** | 星が降る・爆ぜる | **呼ばない**（星が星を呼ぶ） | **乗る** |
 * | **属性ダメージ** | 属性が削る分 | 呼ばない | **乗らない**（火が火を呼ぶ） |
 */

import { Player, system, type Entity } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { finalDamage } from "../../lib/damage.js";
import { waterDefense } from "../../state/element.js";
import { mitigate } from "../../lib/mitigate.js";
import { vulnOf } from "../../state/status.js";
import { current, damage as cutHp, has, heal, max } from "../../state/hp.js";
import { feedback, stepFeedback } from "./feedback.js";
import { dmgTestCommand, popNumber } from "./number.js";

/**
 * 倒した粒。**自分たちで作ったもの**（`resource_packs/pve/particles/`）。
 *
 * **当たったときの粒は出さない**（2026-08-29 決定）——
 * **何の粒か分からないものが毎回出て、邪魔だった。**
 * 当たったことは**赤く光る・音**で分かる（`docs/spec/13-feedback.md`）。
 */
const KILL = "pve_v2:kill_burst";

/** 1 発当てる */
export interface HitOptions {
  /** 撃った人。**居ないこともある**（モブの殴りなど） */
  readonly by?: Player;
  readonly target: Entity;
  /** **最終攻撃力**（`lib/attack.ts` で組み立て終えた値） */
  readonly attack: number;
  /** 何で当てたか（武器の識別子など） */
  readonly via?: string;
  /** ため具合（0.1〜1.0）。**追加ダメージの数を決める**（`docs/spec/11-damage.md` 5-1） */
  readonly charge?: number;
  /**
   * **何の攻撃か**（`docs/spec/11-damage.md` 5-3）。
   *
   * | | 効果フック | 属性 | 表示 |
   * | --- | --- | --- | --- |
   * | `base` | ○ | ○ | ○ |
   * | `extra` | × | ○ | ○ |
   * | `element` | × | × | ○ |
   *
   * **切っておかないと、星が星を、火が火を呼んで止まらなくなる。**
   */
  readonly kind?: HitKind;
  /** **クリティカルだったか。** 落雷・帯電・雷鳴の炎が見る */
  readonly crit?: boolean;
  /**
   * **クリティカル前の値**（`docs/spec/11-damage.md` 3 章）。
   *
   * **特殊攻撃はここを参照する**——クリを二重に乗せない。
   */
  readonly power?: number;
  /**
   * **業火の一矢が乗った射撃か**（`docs/spec/20-enchant.md`）。
   *
   * **抽選は撃った瞬間**（`features/bow/shoot.ts`）——当たってから引くのではない。
   * **音も軌跡も変わる**ので、飛んでいる間から「来る」と分かる。
   */
  readonly inferno?: boolean;
}

/** 何の攻撃か */
export type HitKind = "base" | "extra" | "element";

/** 当たったときに渡すもの */
export interface HitInfo extends HitOptions {
  /** **削った値**（属性の蓄積はこれで動く。`docs/03-content.md` 3-5） */
  readonly dealt: number;
  /** 倒したか */
  readonly killed: boolean;
  /** いまの tick。**状態異常の期限を測るのに要る** */
  readonly now: number;
}

/**
 * 当たった後に呼ばれるもの。
 *
 * 仕様は `docs/imp.md` 2-2。
 *
 * **属性・エンチャント・武器の固有効果はここに挿す。**
 * 挿す側は**「削った値」と「誰が誰に」だけ**を受け取り、
 * **どこから来た攻撃かを知らなくてよい。**
 */
export type HitHook = (info: HitInfo) => void;

/** 効果のフック。**基礎ダメージだけ** */
const hooks: HitHook[] = [];

/** 属性のフック。**基礎と追加**（属性ダメージからは呼ばない） */
const elemental: HitHook[] = [];

/** 効果を足す。**トップレベルから 1 度だけ** */
export function onHit(hook: HitHook): void {
  hooks.push(hook);
}

/**
 * 属性を足す。**トップレベルから 1 度だけ。**
 *
 * **基礎と追加の両方で呼ばれる**（`docs/spec/10-bow.md` 4 章）。
 * **属性ダメージからは呼ばれない**——火が火を呼ばないように。
 */
export function onElementHit(hook: HitHook): void {
  elemental.push(hook);
}

/**
 * いまの防御率（%）。
 *
 * 仕様は `docs/spec/11-damage.md` 3-2。
 *
 * **0 から始めて、持っているものを足す。**
 *
 * | 何が動かすか | いま |
 * | --- | --- |
 * | **属性の水** | **溜まっているほど負になる**（最大 −20%） |
 * | バフ・デバフ・ステータス | **まだ無い** |
 */
function defenseOf(target: Entity, _via: string | undefined): number {
  // **プレイヤーだけが防御を持つ**（`docs/spec/12-element.md` 2-4）。
  // モブ側の軽減は無い——硬さは HP だけで表す。
  //
  // **足す場所はここ 1 か所**にしておく（バフ・アイテムはこれから）。
  if (target instanceof Player) return waterDefense(target);
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

  // ---- 敵の被ダメージ増（焼灼・熔解）。**乗算の別枠**
  const attack = target instanceof Player ? o.attack : o.attack * vulnOf(target.id, now);

  let dealt = finalDamage(attack, defenseOf(target, o.via));

  // ---- 人が受けるときだけ、札が働く（`lib/mitigate.ts`）
  if (target instanceof Player) {
    dealt = mitigate({ target, amount: dealt, raw: attack, from: o.by, now });
  }
  if (dealt <= 0) return;

  const left = cutHp(target, dealt);
  const killed = left <= 0;
  const info: HitInfo = { ...o, dealt, killed, now };
  const kind = o.kind ?? "base";

  // ---- 手応え（赤く光る・音・ノックバック。`docs/spec/13-feedback.md`）
  //
  // **音は通常攻撃だけ**——特殊攻撃（延焼・爆発）でも鳴らすと、
  // **毎秒・毎発ぶんの音が本人の耳元で重なる。**
  feedback(target, o.by, now, kind === "base");

  // ---- ダメージの数字（**敵だけ**。`docs/spec/13-feedback.md` 2 章）
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

  // ---- 属性（**基礎と追加**。`docs/spec/10-bow.md` 4 章）
  if (kind !== "element") call(elemental, info);

  // ---- 効果（**基礎だけ**。`docs/spec/11-damage.md` 5-3）
  if (kind === "base") call(hooks, info);

  if (!killed) return;
  down(target, o.by);
}

/**
 * 倒れた。
 *
 * **音は本人にだけ**（2026-08-31 決定。`docs/spec/13-feedback.md`）——
 * **世界に向けて鳴らすと、遠くの誰かが倒したモブの音まで聞こえる。**
 */
function down(target: Entity, by: Player | undefined): void {
  if (target instanceof Player) {
    // **プレイヤーの倒れ方は、ウェーブの仕組みと一緒に決める**
    //（`docs/01-rules.md` 1-1）。
    //
    // **いまは満タンに戻す**（`docs/spec/11-damage.md` 6 章）——
    // 0 のまま置くと、**殴られるたびに倒れた合図が鳴り続ける。**
    const cap = max(target) ?? 0;
    if (cap > 0) heal(target, cap);
    try {
      target.sendMessage("§c倒れた §8— 立て直した（仮）");
      // **その人にだけ**（v1 の `pve.common.bless` は v2 に無い音だった）
      target.playSound("random.totem", { volume: 0.4, pitch: 0.8 });
    } catch {
      /* 消えている */
    }
    return;
  }
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

/**
 * 機能としての「削る」。
 *
 * **`hit()` はどこからでも呼ばれる**が、
 * **赤くしたものを戻すのは毎 tick の仕事**なので、機能として登録する。
 */
export const damageSystem: Feature = {
  name: "damage",
  tick: { every: 1, run: stepFeedback },
  commands: [dmgTestCommand],
};
