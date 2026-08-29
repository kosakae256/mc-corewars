/**
 * **撃ち方**を変える能力。
 *
 * 仕様は `docs/spec/19-weapons.md` 3 章。
 *
 * | 型 | 何本・どう飛ぶか |
 * | --- | --- |
 * | `spread3` / `spread5` / `twin_spiral` / `ward` / `quiver` | **本数が増える** |
 * | `pierce_all` / `pierce_line` / `railgun` | **後ろの敵まで抜ける** |
 * | `rapid` / `long_draw` / `heavy_draw` / `cannon` | **ための効き方が変わる** |
 * | `combo` / `dice` | **攻撃力の倍率が動く** |
 * | `echo` / `shadow_shot` / `recoil` | **撃った後にもう一度・自分が動く** |
 */

import { system, type Player, type Vector3 } from "@minecraft/server";

import { FULL_CHARGE_TICKS } from "../../../lib/charge.js";
import { defineAbility, type Ray, type ShotContext } from "./index.js";
import { playAbility, safe } from "./util.js";
import { fireRay } from "../shoot.js";

/** 何本かに散らす。**扇の角度は本数で決まる** */
function fan(dir: Vector3, count: number, spread: number, rate: number): Ray[] {
  const out: Ray[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
    const a = t * spread;
    // 横へ回す（上下は変えない。**狙いがぶれると当てられない**）
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    out.push({
      dir: { x: dir.x * cos - dir.z * sin, y: dir.y, z: dir.x * sin + dir.z * cos },
      rate,
    });
  }
  return out;
}

// ---------------------------------------------------------------- ② 癒しの弓
//
// **人に当たったら削らずに回復させる**（`shoot.ts` が `friendly` を見る）。
// モブに当たれば、ふつうに削る
defineAbility("heal_ally", { friendly: true });

// ---------------------------------------------------------------- ③ 速射弓
//
// **ためが無い。** 引いている間、**0.05 秒ごとに 1 発**（1 発は 1/10）
defineAbility("rapid", {
  owns: ["charge"],
  autoEvery: 1,
  power: () => 1.0,
  // **線は粗く引く。** 毎 tick 撃つので、細かく引くと**粒が溢れる**
  trailStep: 2.4,
});

// ---------------------------------------------------------------- ⑩ 破魔矢
//
// **蓄積だけが 2 倍**（削る量は変わらない）
defineAbility("element_boost", { elementScale: 2.0 });

// ---------------------------------------------------------------- 本数が増える
defineAbility("spread3", { rays: (c) => fan(c.dir, 3, 0.14, 0.7) });
defineAbility("spread5", { rays: (c) => fan(c.dir, 5, 0.2, 0.4) });
// 双龍：**2 本が絡む。** 角度は狭く、割合は高い
defineAbility("twin_spiral", { rays: (c) => fan(c.dir, 2, 0.05, 0.6) });
// 結界：**3 本**（陣の上で、という条件は場ができてから）
defineAbility("ward", { rays: (c) => fan(c.dir, 3, 0.08, 0.55) });
// ㊺ 無限矢筒：**当てるたび 1 本増える**（最大 3 本・各 −40%）
const quiver = new Map<string, number>();

export function addQuiver(player: Player): void {
  quiver.set(player.id, Math.min(3, (quiver.get(player.id) ?? 1) + 1));
}

export function resetQuiver(player: Player): void {
  quiver.set(player.id, 1);
}

defineAbility("quiver", {
  rays: (c) => fan(c.dir, quiver.get(c.player.id) ?? 1, 0.06, 0.6),
  onMiss: (c) => resetQuiver(c.player),
});

// ---------------------------------------------------------------- 抜ける
defineAbility("pierce_all", {
  owns: ["pierce"],
  pierce: 99,
  falloff: 0.15,
});
defineAbility("pierce_line", {
  owns: ["pierce"],
  pierce: 5,
  falloff: 0.2,
});
// レールガン：**溜め切ったときだけ極太**（貫通の数で表す）
// ㉑ レールガン：**溜め切ると極太のビーム**（貫通）
defineAbility("railgun", {
  owns: ["pierce", "charge"],
  pierce: 99,
  falloff: 0.05,
  power: (c) => (c.heldTicks >= FULL_CHARGE_TICKS + 4 ? 1.0 : 0.55),
  after: (c) => {
    if (c.heldTicks < FULL_CHARGE_TICKS + 4) return;
    playAbility(c, c.from, 0.7);
  },
});

// ---------------------------------------------------------------- ための効き方
//
// **基礎攻撃力は「1 秒ためた 1 発」**（`docs/03-content.md` 1-1）。
// **1 秒より長く引ける弓**は、そこから先を `heldTicks` で伸ばす。

/** 1 秒を超えたぶんの割合（0〜1）。`extra` はどれだけ延ばせるか（tick） */
function overdraw(heldTicks: number, extra: number): number {
  return Math.max(0, Math.min(1, (heldTicks - FULL_CHARGE_TICKS) / extra));
}

// ④ 長弓：**2 秒で 1.6 倍**
defineAbility("long_draw", {
  owns: ["charge"],
  power: (c) => 1 + 0.6 * overdraw(c.heldTicks, 20),
});
// ⑦ 重弓：**1.5 秒で 1.5 倍**
defineAbility("heavy_draw", {
  owns: ["charge"],
  power: (c) => 1 + 0.5 * overdraw(c.heldTicks, 10),
});
// ㉙ 大砲弓：**溜め切ってしか撃てない**（1.5 秒・1.5 倍）
defineAbility("cannon", {
  owns: ["charge"],
  power: (c) => (c.heldTicks >= FULL_CHARGE_TICKS + 10 ? 1.5 : 0),
  onMiss: (c) => {
    if (c.heldTicks >= FULL_CHARGE_TICKS + 10) return;
    // **撃てなかったことを、音で知らせる**（黙って何も起きないと壊れて見える）
    try {
      c.player.playSound("note.bass", { pitch: 0.7, volume: 0.4 });
    } catch {
      /* 消えている */
    }
  },
});

// ---------------------------------------------------------------- 倍率が動く
/** 連撃の数。**当てるほど増え、外すと戻る** */
const combo = new Map<string, number>();

export function comboOf(player: Player): number {
  return combo.get(player.id) ?? 0;
}

export function addCombo(player: Player): void {
  combo.set(player.id, Math.min(10, comboOf(player) + 1));
}

export function resetCombo(player: Player): void {
  combo.set(player.id, 0);
}

// ㊸ 連撃の証：**当てるほど +10%**（最大 +100%・**外すとリセット**）
defineAbility("combo", {
  power: (c) => 1 + comboOf(c.player) * 0.1,
  onMiss: (c) => resetCombo(c.player),
});

defineAbility("dice", {
  // **1〜6 倍。** 平均は 3.5 なので、基礎を 1/3.5 に均してから掛ける
  power: () => (1 + Math.floor(Math.random() * 6)) / 3.5,
});

// ---------------------------------------------------------------- 撃った後
defineAbility("recoil", {
  after: (c) => {
    try {
      c.player.applyKnockback({ x: -c.dir.x * 1.2, z: -c.dir.z * 1.2 }, 0.35);
    } catch {
      /* 消えている */
    }
  },
});

defineAbility("echo", {
  // **0.3 秒後、同じ向きへもう 1 発**
  after: (c) => {
    system.runTimeout(() => {
      safe("echo", () => fireRay({ ...c, depth: (c.depth ?? 0) + 1 }, { dir: c.dir, rate: 1.0 }));
    }, 6);
  },
});

defineAbility("shadow_shot", {
  // **分身が 0.2 秒後に同じ矢を撃つ**（少し横から）
  after: (c) => {
    system.runTimeout(() => {
      fireRay(c, { dir: c.dir, rate: 1.0 }, { x: c.from.x - c.dir.z * 1.2, y: c.from.y, z: c.from.z + c.dir.x * 1.2 });
    }, 4);
  },
});
