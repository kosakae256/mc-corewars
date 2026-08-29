/**
 * **着弾したとき**に起きる能力。
 *
 * 仕様は `docs/spec/19-weapons.md` 3 章、追加ダメージの決まりは
 * `docs/spec/14-effect.md`。
 *
 * | 型 | 何が起きるか |
 * | --- | --- |
 * | `explode_small` / `firework` / `cannon` / `meteor` / `mine` | **その場で爆ぜる** |
 * | `light_pillar` / `aurora` / `blackhole` / `web` | **場が残る**（数秒） |
 * | `starfall` | 星が降る（`features/bow/stardust.ts`） |
 *
 * **削るのは全部 `hit()` を通す**（`docs/spec/10-damage.md` 4 章）。
 * **追加ダメージなので `kind: "extra"`**——属性は乗り、効果は連鎖しない。
 */

import { system, type Dimension, type Entity, type Vector3 } from "@minecraft/server";

import { hit } from "../../damage/index.js";
import { defineAbility, type ShotContext } from "./index.js";
import { mobsAround, playAbility, put, safe, splash } from "./util.js";
import { stardustBurst } from "../stardust.js";

/** 爆ぜる絵と音 */
function boom(ctx: ShotContext, at: Vector3, big: boolean): void {
  const dim = ctx.player.dimension;
  put(dim, big ? "pve:el_ice_flash" : "pve:star_flash", { x: at.x, y: at.y + 0.6, z: at.z });
  put(dim, "pve:el_thunder_spark", { x: at.x, y: at.y + 0.2, z: at.z });
  playAbility(ctx, at, big ? 0.8 : 0.5);
}

// ---------------------------------------------------------------- 爆ぜる
defineAbility("explode_small", {
  owns: ["explode"],
  onImpact: (c, at) => {
    splash(c, at, 2.2, 0.33);
    boom(c, at, false);
  },
});

defineAbility("firework", {
  owns: ["explode"],
  onImpact: (c, at) => {
    // **破片が少し遅れて飛ぶ**（1 回で終わらせない）
    splash(c, at, 2.0, 0.25);
    boom(c, at, false);
    for (let i = 1; i <= 3; i++) {
      system.runTimeout(() => {
        const a = Math.random() * Math.PI * 2;
        const spot = { x: at.x + Math.cos(a) * 1.8, y: at.y + 0.5, z: at.z + Math.sin(a) * 1.8 };
        splash(c, spot, 1.4, 0.18);
        put(c.player.dimension, "pve:star_land", spot);
      }, i * 4);
    }
  },
});

defineAbility("cannon", {
  owns: ["explode"],
  onImpact: (c, at) => {
    splash(c, at, 3.6, 0.5);
    boom(c, at, true);
  },
});

defineAbility("meteor", {
  owns: ["explode"],
  onImpact: (c, at, hitSomething) => {
    if (c.charge < 0.99) return; // **溜め切ったときだけ落ちる**
    // 空から落ちてくる見せ方（星屑の仕組みを借りる）
    stardustBurst(c.player.dimension, {
      by: c.player,
      at,
      attack: c.attack * 1.2,
      charge: c.charge,
      via: c.bow.item,
      elements: c.elements,
    });
    system.runTimeout(() => {
      splash(c, at, 4.0, 0.6);
      boom(c, at, true);
      // **広く吹き飛ばす**
      for (const e of mobsAround(c.player.dimension, at, 4.5)) {
        try {
          const p = e.location;
          const dx = p.x - at.x;
          const dz = p.z - at.z;
          const len = Math.hypot(dx, dz) || 1;
          e.applyImpulse({ x: (dx / len) * 0.9, y: 0.55, z: (dz / len) * 0.9 });
        } catch {
          /* 押せない相手 */
        }
      }
    }, 8);
    void hitSomething;
  },
});

defineAbility("mine", {
  owns: ["explode"],
  onImpact: (c, at, hitSomething) => {
    if (hitSomething) {
      splash(c, at, 1.8, 0.3);
      boom(c, at, false);
      return;
    }
    // **地面に刺さって待つ。** 近づいた相手で爆ぜる
    let left = 100;
    const id = system.runInterval(() => {
      left -= 5;
      put(c.player.dimension, "pve:el_thunder_spark", { x: at.x, y: at.y + 0.2, z: at.z });
      const near = mobsAround(c.player.dimension, at, 1.6);
      if (near.length === 0 && left > 0) return;
      system.clearRun(id);
      if (near.length === 0) return;
      splash(c, at, 2.6, 0.45);
      boom(c, at, true);
    }, 5);
  },
});

// ---------------------------------------------------------------- 場が残る
/** 場を 1 つ作る。**一定の間、何度も削る** */
function field(
  ctx: ShotContext,
  at: Vector3,
  opts: { ticks: number; every: number; radius: number; rate: number; particle: string }
): void {
  let left = opts.ticks;
  const id = system.runInterval(() => {
    left -= opts.every;
    if (left <= 0) system.clearRun(id);
    safe("field", () => {
      put(ctx.player.dimension, opts.particle, { x: at.x, y: at.y + 0.4, z: at.z });
      splash(ctx, at, opts.radius, opts.rate);
    });
  }, opts.every);
}

defineAbility("light_pillar", {
  onImpact: (c, at) => {
    field(c, at, { ticks: 60, every: 10, radius: 1.8, rate: 0.12, particle: "pve:star_flash" });
    playAbility(c, at, 0.5);
  },
});

defineAbility("aurora", {
  onImpact: (c, at) => {
    field(c, at, { ticks: 100, every: 10, radius: 3.0, rate: 0.1, particle: "pve:el_ice_chill" });
    playAbility(c, at, 0.5);
  },
});

defineAbility("blackhole", {
  onImpact: (c, at) => {
    field(c, at, { ticks: 60, every: 5, radius: 4.0, rate: 0.06, particle: "pve:el_ice_burst" });
    playAbility(c, at, 0.5);
    // **吸い寄せる**
    let left = 60;
    const id = system.runInterval(() => {
      left -= 5;
      for (const e of mobsAround(c.player.dimension, at, 5.0)) {
        try {
          const p = e.location;
          const dx = at.x - p.x;
          const dz = at.z - p.z;
          const len = Math.hypot(dx, dz) || 1;
          e.applyImpulse({ x: (dx / len) * 0.25, y: 0.05, z: (dz / len) * 0.25 });
        } catch {
          /* 押せない相手 */
        }
      }
      if (left <= 0) system.clearRun(id);
    }, 5);
  },
});

defineAbility("web", {
  onImpact: (c, at) => {
    // **糸で巻き込む。** 近くの相手も少し削れて、遅くなる
    for (const e of mobsAround(c.player.dimension, at, 3.0)) {
      hit({ by: c.player, target: e, attack: c.attack * 0.2, via: c.bow.item, kind: "extra", elements: c.elements });
      try {
        e.addEffect("slowness", 60, { amplifier: 2, showParticles: false });
      } catch {
        /* 効かない相手 */
      }
    }
    put(c.player.dimension, "pve:el_ice_ring", at);
  },
});

defineAbility("starfall", {
  onImpact: (c, at, hitSomething) => {
    if (!hitSomething) return;
    stardustBurst(c.player.dimension, {
      by: c.player,
      at,
      attack: c.attack,
      charge: c.charge,
      via: c.bow.item,
      elements: c.elements,
    });
  },
});
