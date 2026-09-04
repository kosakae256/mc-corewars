/**
 * 時間で効くもの。**燃焼・残った炎・鈍化・周りへの効果。**
 *
 * 仕様は `docs/spec/12-element.md` 2-5、`docs/spec/20-enchant.md`。
 *
 * ## 毎秒だけ動かす
 *
 * ```
 * 20 tick ごと
 *   ├ 燃えている敵を焼く（延焼）
 *   ├ 残っている炎に居る敵へ配る（灼熱の渦・焦土の軌跡）
 *   ├ 鈍化のぶんだけ足を止める（見た目はバニラの「移動速度低下」）
 *   ├ 霜纏い …… 周りの敵を鈍らせる
 *   └ 嵐 ……… 5 秒ごとに周りへ落とす
 * ```
 *
 * **毎 tick 全部を回さない**——敵の数だけ重くなる。
 */

import { system, world, type Entity } from "@minecraft/server";

import { trio } from "../../lib/attack.js";
import { burningFx, fx, tier } from "../../lib/fx.js";
import { enemiesNear, single, splash } from "../../lib/special.js";
import type { Feature } from "../../types.js";
import * as el from "../../state/element.js";
import * as ench from "../../state/enchant.js";
import { has, heal, max as hpMax } from "../../state/hp.js";
import * as slow from "../../state/slow.js";
import * as st from "../../state/status.js";
import * as zones from "../../state/zones.js";

/** 霜纏いが届く距離 */
const FROST_RANGE = 4;

/** 霜纏いで 1 体が 1 秒に受け取る上限（最大蓄積値に対する割合） */
const FROST_MAX = 0.02;

/** 嵐の間隔（tick）と半径 */
const STORM_EVERY = 100;
const STORM_RADIUS = 5;

/** 探すのに使う距離（プレイヤーの周り） */
const NEAR = 24;

/** 実体を id で引く。**居なければ undefined** */
function find(id: string): Entity | undefined {
  try {
    return world.getEntity(id) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 燃焼。**1 秒ごとに、決めた回数だけ削る。**
 *
 * **「いつまで」ではなく「あと何回」**（`state/status.ts`）——
 * この機能は 10 tick ごとにしか回らないので、
 * **時刻で切ると端数で 1 回ぶん取りこぼす。**
 */
function burnTick(now: number): void {
  // **同じ敵に何人ぶんも燃焼が付いていることがある。** 炎は 1 体につき 1 回だけ出す
  const shown = new Set<string>();
  st.eachBurn((id, burn, key) => {
    const target = find(id);
    if (target === undefined || !has(target)) {
      st.clearBurnKey(key);
      return;
    }
    // ---- **燃えている間はずっと出す**（2026-08-31）。
    //
    // **ダメージが入る瞬間（毎秒）だけ出していたので、燃えているように見えなかった。**
    // この機能は 10 tick ごとに回るので、**0.5 秒おき**に足される。
    if (!shown.has(id)) {
      shown.add(id);
      burningFx(target.dimension, target.location);
    }

    if (now < burn.next) return;

    // **3 枠の合計を払い、輪を進める**（`state/status.ts`）。
    // 当てた回数ぶんが 1 回にまとまって入り、**3 秒より前のぶんは落ちる。**
    const pay = st.burnPay(burn, now);
    if (pay <= 0) {
      st.clearBurnKey(key);
      return;
    }
    // **手柄は付けた人のもの**（吸収も、倒したときの札もその人に返る）
    single(burn.by, target, pay, "pve_v2:ember");
    // **音は削られた瞬間だけ**（毎秒・5 マス以内の人にだけ。`lib/fx.ts`）
    // **量は付けた人の火で決まる**（`docs/spec/13-feedback.md` 4-2）
    fx("ember", target.dimension, target.location, false, tier(el.get(burn.by, "fire")));
  });
}

/** 残っている炎。**中に居る敵へ 1 秒ごと** */
function zoneTick(now: number): void {
  zones.each((z, index) => {
    if (z.until <= now) {
      zones.drop(index);
      return;
    }
    if (now - z.last < 20) return;
    z.last = now;
    splash({ by: z.by, dim: z.dim, at: z.at, radius: z.radius, amount: z.per, via: `pve_v2:${z.tag}` });
    fx(z.tag, z.dim, z.at);
  });
}

/**
 * 鈍化を足に出す。
 *
 * **バニラの「移動速度低下」で近似する**——1 段でおよそ −15％。
 * **D ＝ 1 で半分**にしたいので、**3 段まで**（`docs/spec/12-element.md` 2-5）。
 * **攻撃の間隔は `features/mob/` が直接見る**（効果では刻めない）。
 */
function slowTick(now: number): void {
  for (const player of world.getAllPlayers()) {
    let list: Entity[];
    try {
      list = player.dimension.getEntities({ location: player.location, maxDistance: NEAR });
    } catch {
      continue;
    }
    for (const e of list) {
      if (e.typeId === "minecraft:player" || !has(e)) continue;
      const d = slow.ratio(e, now);
      // **凍え具合を体の色に出す**（2026-08-31）——
      // 溜まっているほど青くなる（`resource_packs/.../pve2_hurt.render_controllers.json`）。
      // **0 のときも書く**——書かないと、抜けた後も青いままになる
      try {
        e.setProperty("pve_v2:chill", d);
      } catch {
        // property を持たない実体。**それでよい**
      }
      if (d <= 0.05) continue;
      const level = st.isFrozen(e.id, now) ? 6 : Math.min(3, Math.ceil(d * 3));
      try {
        e.addEffect("slowness", 40, { amplifier: level - 1, showParticles: false });
      } catch {
        /* 消えている */
      }
    }
  }
}

/**
 * 霜纏い。**毎秒、最大蓄積値の 1％ × 段 × x**（2026-08-31 決定）。
 *
 * > ### 人数で増えすぎないように
 * >
 * > **同じモブに複数人ぶんが乗ると、すぐ満タンになる。**
 * > **1 体が 1 秒で受け取る量は、最大でも 2％** に抑える。
 *
 * **まず全員ぶんを足してから、モブごとに頭打ちさせる**——
 * 先に配ると「早い者勝ち」になり、誰の霜が効いたかで結果が変わる。
 */
function frostTick(now: number): void {
  if (now % 20 !== 0) return;

  const share = new Map<string, { e: Entity; rate: number }>();
  for (const player of world.getAllPlayers()) {
    const frost = ench.lv(player, "frost");
    if (frost <= 0) continue;
    const rate = 0.01 * frost * el.ratio(player, "ice");
    if (rate <= 0) continue;
    for (const e of enemiesNear(player.dimension, player.location, FROST_RANGE)) {
      const cur = share.get(e.id);
      if (cur === undefined) share.set(e.id, { e, rate });
      else cur.rate += rate;
    }
  }

  for (const { e, rate } of share.values()) {
    slow.add(e, slow.effect(e) * Math.min(FROST_MAX, rate), now);
  }
}

/** 霜纏い・嵐。**持っている人の周りだけ見る** */
function auraTick(now: number): void {
  for (const player of world.getAllPlayers()) {
    const storm = ench.lv(player, "storm");
    if (storm > 0 && st.ready(player.id, "storm", STORM_EVERY, now)) {
      const min3 = trio(player, "thunder", "wind", "water");
      if (min3 > 0) {
        // **参照は「素の 1 発」**——嵐は当てなくても落ちるので、
        // 通常攻撃の値を作れない（`docs/spec/11-damage.md` 3 章の「固定値」に近い）
        const amount = 20 * 1.25 * storm * min3;
        splash({
          by: player,
          dim: player.dimension,
          at: player.location,
          radius: STORM_RADIUS,
          amount,
          via: "pve_v2:storm",
        });
        for (const e of enemiesNear(player.dimension, player.location, STORM_RADIUS)) {
          slow.add(e, slow.effect(e) * 0.3, now);
        }
        fx("storm", player.dimension, player.location);
      }
    }
  }
}

/**
 * 霜纏い。**持っている間、体に霜を纏い続ける。**
 *
 * **敵ではなく自分に出す**——**「近づくだけで凍らせる」札**だから。
 *
 * > ### 量は「間隔」で決める（2026-08-31）
 * >
 * > **1 回に出すのは 1 個**。**氷を盛るほど、出す間隔が短くなる。**
 * >
 * > | 氷 | 間隔 | 見え方 |
 * > | --- | --- | --- |
 * > | 0〜4 | — | 出ない |
 * > | 5〜9 | 8 tick | ぽつぽつ |
 * > | 10〜14 | 4 tick | まばら |
 * > | 15〜19 | 2 tick | 途切れない |
 * > | **20** | **1 tick** | **常に纏っている** |
 *
 * **位置は足元〜腰**（`tools/pve2-fx.py`）——目の高さに出ると 1 人称で視界を塞ぐ。
 */
function frostAuraTick(now: number): void {
  for (const player of world.getAllPlayers()) {
    if (ench.lv(player, "frost") <= 0) continue;
    const step = tier(el.get(player, "ice"));
    if (step <= 0) continue;
    // 段 1〜4 → 8 / 4 / 2 / 1 tick おき
    const gap = 1 << (4 - step);
    if (now % gap !== 0) continue;
    fx("frost", player.dimension, player.location);
  }
}

/**
 * 自然回復（水）。**毎秒、最大 HP の割合で戻る。**
 *
 * **武器を問わないパッシブ**（`docs/spec/20-enchant.md` 1-1）——
 * 水を盛るほど、殴られてもじわじわ戻る。
 */
function regenTick(now: number): void {
  if (now % 20 !== 0) return;
  for (const player of world.getAllPlayers()) {
    const lv = ench.lv(player, "regen");
    if (lv <= 0) continue;
    const cap = hpMax(player) ?? 0;
    const back = cap * 0.005 * lv * el.ratio(player, "water");
    if (back > 0) heal(player, back);
  }
}

function tick(): void {
  const now = system.currentTick;
  regenTick(now);
  frostTick(now);
  burnTick(now);
  zoneTick(now);
  slowTick(now);
  auraTick(now);
}

export const status: Feature = {
  name: "status",
  tick: { every: 10, run: tick },
};

/**
 * 纏うもの。**毎 tick 回る。**
 *
 * **`status` は 10 tick ごと**なので、**1 tick おきに出すもの**（霜纏い）はここに置く。
 */
export const aura: Feature = {
  name: "aura",
  tick: { every: 1, run: frostAuraTick },
};
