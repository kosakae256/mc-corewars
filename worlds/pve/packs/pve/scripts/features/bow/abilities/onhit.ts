/**
 * **当たった相手に**起きる能力。
 *
 * 仕様は `docs/spec/19-weapons.md` 3 章。
 *
 * | 型 | 何が起きるか |
 * | --- | --- |
 * | `knock_far` / `slam_down` / `pull` | **押す・落とす・引き寄せる** |
 * | `lifesteal` / `heal_on_kill` / `heal_ally` | **回復する** |
 * | `time_stop` / `root` | **止める** |
 * | `brand` / `chain_mark` | **印を付ける** |
 * | `kill_echo` / `boomerang` | **もう 1 発** |
 * | `element_boost` / `dual_element` | **属性の効きが変わる** |
 */

import { system } from "@minecraft/server";

import { heal, max } from "../../../state/hp.js";
import { hit } from "../../damage/index.js";
import { defineAbility, type HitContext } from "./index.js";
import { mobsAround, playAbility, safe, shove } from "./util.js";
import { addCombo, addQuiver } from "./shots.js";
import { fireRay } from "../shoot.js";

/** **その弓の音**を、当たった所から鳴らす */
function sound(ctx: HitContext, volume = 0.5): void {
  playAbility(ctx, ctx.at, volume);
}

// ---------------------------------------------------------------- 押す
defineAbility("knock_far", {
  onHit: (c) => {
    shove(c.target, c.from, 1.6, 0.35);
    sound(c);
  },
});

defineAbility("slam_down", {
  onHit: (c) => {
    // **地面へ叩きつける。** 浮いている相手に強い
    try {
      c.target.applyImpulse({ x: 0, y: -1.4, z: 0 });
    } catch {
      /* 押せない相手 */
    }
    sound(c);
  },
});

defineAbility("pull", {
  onHit: (c) => {
    // **引き寄せる**（押すのと逆向き）
    shove(c.target, c.from, -1.1, 0.2);
  },
});

// ---------------------------------------------------------------- 回復
/** 自分を回復する。**上限は超えない** */
function healSelf(c: HitContext, amount: number): void {
  if (amount <= 0) return;
  heal(c.player, amount);
}

defineAbility("lifesteal", {
  // **与えたダメージの 5%**
  onHit: (c) => healSelf(c, c.attack * 0.05),
});

defineAbility("heal_on_kill", {
  onHit: (c) => {
    if (!c.killed) return; // **倒したときだけ**
    healSelf(c, (max(c.player) ?? 200) * 0.08);
    sound(c, 0.4);
  },
});

defineAbility("heal_ally", {
  onHit: (c) => {
    // **味方はまだ居ない**（PvE で当たるのはモブだけ）。
    // 味方が来たら、ここで `heal()` を呼ぶ（`docs/spec/19-weapons.md` 3 章）
    sound(c, 0.35);
  },
});

// ---------------------------------------------------------------- 止める
defineAbility("time_stop", {
  onHit: (c) => {
    try {
      c.target.addEffect("slowness", 40, { amplifier: 250, showParticles: false });
    } catch {
      /* 効かない相手 */
    }
    sound(c, 0.45);
  },
});

defineAbility("root", {
  onHit: (c) => {
    try {
      c.target.addEffect("slowness", 80, { amplifier: 250, showParticles: false });
    } catch {
      /* 効かない相手 */
    }
  },
});

// ---------------------------------------------------------------- 印
//
// **㉖ 烙印弓：印の相手を倒すと爆散する。**
//
// 印を覚える入れ物は要らない——**この弓で当てた相手が、この 1 発で倒れたか**
// だけ見ればよい（`killed`）。
defineAbility("brand", {
  onHit: (c) => {
    if (!c.killed) return;
    for (const e of mobsAround(c.player.dimension, c.at, 3.0)) {
      hit({ by: c.player, target: e, attack: c.attack * 0.4, via: c.bow.item, kind: "extra", elements: c.elements });
    }
    sound(c, 0.6);
  },
});

// ---------------------------------------------------------------- もう 1 発
defineAbility("kill_echo", {
  onHit: (c) => {
    if (!c.killed) return;
    // **倒した位置から、もう 1 発**
    system.runTimeout(() => {
      // **深さを上げて撃つ**（倒すたびに増え続けないように）
      fireRay(
        { ...c, depth: (c.depth ?? 0) + 1 },
        { dir: c.dir, rate: 0.6 },
        { x: c.at.x, y: c.at.y + 1.0, z: c.at.z }
      );
    }, 4);
  },
});

defineAbility("boomerang", {
  onHit: (c) => {
    // **戻ってくる。** 少し遅れてもう一度削る
    system.runTimeout(() => {
      hit({
        by: c.player,
        target: c.target,
        attack: c.attack * 0.6,
        via: c.bow.item,
        kind: "extra",
        elements: c.elements,
      });
    }, 8);
  },
});

// ---------------------------------------------------------------- そのほか
// ㊸ 連撃の証：当てるたびに 1 つ増える（倍率は `shots.ts`）
defineAbility("combo", {
  onHit: (c) => addCombo(c.player),
});

// ㊺ 無限矢筒：当てるたびに矢が 1 本増える（本数は `shots.ts`）
defineAbility("quiver", {
  onHit: (c) => addQuiver(c.player),
});

// **まだ中身の無い型**（`docs/spec/19-weapons.md` 3 章）。
//
// | 型 | 何が要るか |
// | --- | --- |
// | `dual_element` | **拾ったときに属性を付ける仕組み**（`docs/spec/17-element.md` 6 章） |
// | `enchant_luck` | **エンチャント本体** |
// | `more_drops` | **落とし物の仕組み** |
//
// **仕組みができたら、ここに足す。**
