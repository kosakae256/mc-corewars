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

import { GameMode, Player, system, type Entity, type Vector3 } from "@minecraft/server";

import { finalDamage } from "../core/damage.js";
import { current, damage as cutHp, has, heal, max as maxHp } from "../state/hp.js";
import { BIG_CUT, bigHurt, feedback } from "./feedback.js";
import { markDead } from "./presence.js";
import { awardKill } from "./reward.js";
import { anger } from "./traits.js";
import { popNumber } from "./number.js";

/** 倒した粒。**自分たちで作ったもの**（`resource_packs/pve_v3/particles/`） */
const KILL = "pve_v3:kill_burst";

/** 1 発当てる */
export interface HitOptions {
  /** 撃った人。**居ないこともある**（モブの殴りなど） */
  readonly by?: Player;
  /**
   * **殴ってきた実体。**
   *
   * > ### ノックバックの向きを出すためだけのもの（2026-09-06 追加）
   * >
   * > **`by` はプレイヤーしか入らない**（報酬を配る相手）。
   * > **モブがプレイヤーを殴ったとき**は、こちらにそのモブを入れる。
   */
  readonly source?: Entity | Vector3;
  /**
   * **モブも押すか。** **既定は押さない**（2026-09-07 決定）。
   *
   * > ### 敵は押されないのが普通
   * >
   * > **押したい攻撃だけが、そう言う。**
   */
  readonly knock?: boolean;
  /**
   * **押す強さ**（水平）。**省略なら既定**（`core/knockback.ts` の `KNOCK_H`）。
   *
   * > ### 攻撃ごとに変えられる（2026-09-08）
   * >
   * > **軽い突きは弱く、体当たりは強く。** **0 で押さない。**
   * > **受け手の軽減は `services/knockback.ts` が掛ける。**
   */
  readonly knockPower?: number;
  /**
   * **上へ飛ばす強さ。** **省略なら 0**（`22-feedback.md` 6-2）。
   *
   * > ### **浮かせるのは例外**
   * >
   * > **爆発だけ**（`16-enemy.md` 5-1）。**普通の攻撃では使わない。**
   */
  readonly knockUp?: number;
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

/** **敵が倒れた**（消される直前）。**死に際の仕掛けが乗る**（`25-enemy-kit.md` 10 章） */
const fallHooks: ((mob: Entity) => void)[] = [];

/** 死に際を足す */
export function onFallen(hook: (mob: Entity) => void): void {
  fallHooks.push(hook);
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
  // > ### **クリエイティブと観戦には、何も当たらない**（2026-09-10）
  // >
  // > **弾は `services/mobaim.ts` の `hittable` で外していたが、
  // > 範囲攻撃**（爆発・薙ぎ払い・円・毒）**は `has()` しか見ていなかった。**
  // > **`has()` は「HP を持っているか」**——**クリエイティブでも真になる。**
  // >
  // > **ここは全部のダメージが通る 1 か所。** **ここで守れば、後から足した攻撃も守られる。**
  if (target instanceof Player) {
    try {
      const mode = target.getGameMode();
      if (mode === GameMode.Creative || mode === GameMode.Spectator) return;
    } catch {
      return;
    }
  }

  const now = system.currentTick;
  const dealt = finalDamage(o.attack, defenseOf(target, o.via));
  if (dealt <= 0) return;

  const left = cutHp(target, dealt);
  const killed = left <= 0;
  // > ### **中立の敵は、ここで怒る**（`25-enemy-kit.md` 12 章）
  // >
  // > **こちらのダメージには「殴った人」が入っていない**（`services/cmd.ts`）ので、
  // > **バニラの `hurt_by_target` は永久に気づかない。** **script から伝える。**
  if (o.by !== undefined && !(target instanceof Player)) anger(target);
  const info: HitInfo = { ...o, dealt, killed, now };
  const kind = o.kind ?? "base";

  // ---- 手応え（赤く光る・音・ノックバック）
  //
  // **音は通常攻撃だけ**——特殊攻撃でも鳴らすと、
  // **毎秒・毎発ぶんの音が本人の耳元で重なる。**
  feedback(target, o.by ?? o.source, now, kind === "base", o.knock === true, o.knockPower, o.knockUp);

  // ---- **大ダメージの演出**（画面が揺れて、周りが赤くなる）
  //
  // **最大 HP に対する割合で見る**（2026-09-06 変更）——
  // いまの HP で見ると、**瀕死のときに擦り傷でも「大ダメージ」になる。**
  const cap = maxHp(target) ?? 0;
  if (target instanceof Player && cap > 0 && dealt / cap >= BIG_CUT) bigHurt(target, now);

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
    const cap = maxHp(target) ?? 0;
    if (cap > 0) heal(target, cap);
    try {
      // > ### 立て直しに音は鳴らさない（2026-09-06 決定）
      // >
      // > **試合の外でしか起きない**のに、**トーテムの音がうるさく、
      // > 大ダメージの音が聞こえなかった。**
      target.sendMessage("§c倒れた §8— 立て直した（試合の外）");
    } catch {
      /* 消えている */
    }
    return;
  }
  // ---- **死に際**（`25-enemy-kit.md` 10 章）。**消す前に呼ぶ**
  //
  // > **爆弾・帯電・汚染・分裂は、実体が居るうちに場所を読む。**
  for (const f of fallHooks) {
    try {
      f(target);
    } catch {
      /* 1 つ落ちても、残りは通す */
    }
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
  const cap = maxHp(entity);
  if (now === undefined || cap === undefined) return undefined;
  return { now, max: cap };
}
