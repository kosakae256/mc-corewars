/**
 * **1 本ずつ作り込んだ**能力。
 *
 * 仕様は `docs/spec/19-weapons.md` 3 章。
 * ここは「型で片付かないもの」——**その弓のためだけの仕掛け**を置く。
 *
 * | # | 弓 | 何をしているか |
 * | --- | --- | --- |
 * | ⑧ | 鎖弓 | **印を付け、次の 1 発がそこへ吸い付く** |
 * | ⑬ | 守護者の弓 | **背後の射手が、近い敵へ勝手に撃つ** |
 * | ⑰ | ビリヤード | **壁で跳ね返る**（跳ねるほど強い） |
 * | ㉘ | 札の弓 | **3 枚を順に**（爆ぜる → 抜ける → 癒す） |
 * | ㊲ | 結界弓 | **陣を置く。陣の上では 3 本** |
 * | ㊳ | 追尾ミサイル | **近い相手へ曲がる**（−20%） |
 * | ㊻ | 双属の弓 | **属性が必ず 2 つ**（足りなければその 1 発だけ足す） |
 */

import { system, type Entity, type Player, type Vector3 } from "@minecraft/server";

import { hit } from "../../damage/index.js";
import { defineAbility, type Ray } from "./index.js";
import { mobsAround, nearestMob, playAbility, put, safe, toward, turn } from "./util.js";
import { fireRay } from "../shoot.js";

// ---------------------------------------------------------------- ⑧ 鎖弓
//
// **当てた敵に鎖。次の 1 発は必ず当たる。**
// 印は 1 体だけ持つ（**次に当てた相手で置き換わる**）
const chained = new Map<string, Entity>();

defineAbility("chain_mark", {
  rays: (c) => {
    const marked = chained.get(c.player.id);
    if (marked === undefined) return [{ dir: c.dir, rate: 1 }];
    const dir = toward(c.from, marked);
    chained.delete(c.player.id); // **使ったら外れる**
    if (dir === undefined) return [{ dir: c.dir, rate: 1 }];
    return [{ dir, rate: 1 }];
  },
  onHit: (c) => {
    chained.set(c.player.id, c.target);
    // **鎖の見た目は、その弓の軌跡を使う**（共通の粒はもう無い）
    put(c.player.dimension, c.bow.trail, { x: c.at.x, y: c.at.y + 1.0, z: c.at.z });
  },
});

// ---------------------------------------------------------------- ⑬ 守護者の弓
//
// **背後に射手。** 撃つたびに現れ、**3 秒のあいだ、近い敵へ勝手に撃つ**
const GUARD_TICKS = 60;
const GUARD_EVERY = 20;
const GUARD_RATE = 0.5;

defineAbility("guardian", {
  after: (c) => {
    let left = GUARD_TICKS;
    const spot = { x: c.from.x - c.dir.x * 1.2, y: c.from.y + 0.6, z: c.from.z - c.dir.z * 1.2 };
    const id = system.runInterval(() => {
      left -= GUARD_EVERY;
      if (left <= 0) system.clearRun(id);
      safe("guardian", () => {
        put(c.player.dimension, "pve:star_flash", spot);
        const target = nearestMob(c.player.dimension, spot, 24);
        if (target === undefined) return;
        const dir = toward(spot, target);
        if (dir === undefined) return;
        // **射手の弾には固有能力を乗せない**（射手が射手を呼ばないように）
        fireRay({ ...c, attack: c.attack * GUARD_RATE, depth: (c.depth ?? 0) + 1 }, { dir, rate: 1 }, spot);
      });
    }, GUARD_EVERY);
  },
});

// ---------------------------------------------------------------- ⑰ ビリヤード
//
// **壁で 3 回跳ねる。跳ねるほど +50%。**
// 面の向きは取れないので、**進んできた向きを反転して散らす**——
// 見た目は「跳ね返った」で通る
const BOUNCE_TIMES = 3;

defineAbility("bounce", {
  owns: ["bounce"],
  onImpact: (c, at, hitSomething) => {
    if (hitSomething) return; // **敵に当たったら跳ねない**
    let dir = { x: -c.dir.x, y: Math.abs(c.dir.y) * 0.3, z: -c.dir.z };
    for (let i = 0; i < BOUNCE_TIMES; i++) {
      const step = i;
      const shot = { ...dir };
      // **跳ねるほど +50%。** 足し算にする——掛け算だと 3 回目で 3.4 倍になる
      const power = 1 + 0.5 * (i + 1);
      system.runTimeout(
        () => {
          // **深さを 1 つ上げて撃つ**（跳ねた矢は、もう跳ねない）
          safe("bounce", () =>
            fireRay({ ...c, attack: c.attack * power, depth: (c.depth ?? 0) + 1 }, { dir: shot, rate: 1 }, at)
          );
        },
        3 + step * 3
      );
      dir = { x: -dir.x + (Math.random() - 0.5) * 0.6, y: dir.y, z: -dir.z + (Math.random() - 0.5) * 0.6 };
    }
  },
});

// ---------------------------------------------------------------- ㉘ 札の弓
//
// **3 枚を順に撃つ。** 何が出るかは順番で決まる（運ではない）
const CARDS = ["爆", "貫", "癒"] as const;
const cardAt = new Map<string, number>();

function nextCard(player: Player): (typeof CARDS)[number] {
  const i = (cardAt.get(player.id) ?? 0) % CARDS.length;
  cardAt.set(player.id, i + 1);
  return CARDS[i] ?? "爆";
}

defineAbility("cards", {
  owns: ["pierce", "explode"],
  // **抜ける札のときだけ貫通させたい**が、貫通は撃つ前に決まる。
  // **順番は撃つ前に分かる**ので、ここで先に引いておく
  rays: (c) => {
    const card = nextCard(c.player);
    cardOfShot.set(c.player.id, card);
    try {
      c.player.onScreenDisplay.setActionBar(`§d【${card}】`);
    } catch {
      /* 消えている */
    }
    return [{ dir: c.dir, rate: 1 }];
  },
  // **「貫」の札だけ抜ける**（その 1 発ごとに変わる）
  pierceFor: (c) => (cardOfShot.get(c.player.id) === "貫" ? 4 : 1),
  falloff: 0.2,
  onHit: (c) => {
    const card = cardOfShot.get(c.player.id) ?? "爆";
    if (card === "爆") {
      for (const e of mobsAround(c.player.dimension, c.at, 2.4)) {
        hit({
          by: c.player,
          target: e,
          attack: c.attack * 0.3,
          via: c.bow.item,
          kind: "extra",
          elements: c.elements,
        });
      }
      playAbility(c, c.at, 0.5);
    }
    if (card === "癒") {
      playAbility(c, c.at, 0.45);
    }
  },
});

const cardOfShot = new Map<string, string>();

// ---------------------------------------------------------------- ㊲ 結界弓
//
// **刺さった所に陣。陣の上で撃つと矢が 3 本。**
interface Ward {
  readonly at: Vector3;
  until: number;
}
const wards: Ward[] = [];

/** 陣の上に立っているか */
function onWard(player: Player, now: number): boolean {
  let at: Vector3;
  try {
    at = player.location;
  } catch {
    return false;
  }
  for (let i = wards.length - 1; i >= 0; i--) {
    const w = wards[i];
    if (w === undefined) continue;
    if (now > w.until) {
      wards.splice(i, 1);
      continue;
    }
    if (Math.hypot(at.x - w.at.x, at.z - w.at.z) <= 3.0) return true;
  }
  return false;
}

const WARD_TICKS = 200;

defineAbility("ward", {
  rays: (c) => {
    const many = onWard(c.player, system.currentTick);
    if (!many) return [{ dir: c.dir, rate: 1 }];
    // **陣の上では 3 本**（1 本ずつは弱くする）
    const out: Ray[] = [];
    for (const a of [-0.09, 0, 0.09]) out.push({ dir: turn(c.dir, a), rate: 0.55 });
    return out;
  },
  onImpact: (c, at, hitSomething) => {
    if (hitSomething) return; // **地面に刺さったときだけ陣になる**
    wards.push({ at, until: system.currentTick + WARD_TICKS });
    playAbility(c, at, 0.5);
    let left = WARD_TICKS;
    const id = system.runInterval(() => {
      left -= 10;
      if (left <= 0) system.clearRun(id);
      safe("ward", () => put(c.player.dimension, "pve:el_ice_ring", { x: at.x, y: at.y + 0.1, z: at.z }));
    }, 10);
  },
});

// ---------------------------------------------------------------- ㊳ 追尾ミサイル
//
// **近い相手へ曲がる**（−20%）。**曲がるのは撃つ瞬間だけ**——
// 矢を実体にしていないので、**狙いを寄せることで「追う」を出す**
const HOMING_CONE = 0.55;

defineAbility("homing", {
  owns: ["homing"],
  rays: (c) => {
    let best: Entity | undefined;
    let bestDot = HOMING_CONE;
    for (const e of mobsAround(c.player.dimension, c.from, 32)) {
      const dir = toward(c.from, e);
      if (dir === undefined) continue;
      const dot = dir.x * c.dir.x + dir.y * c.dir.y + dir.z * c.dir.z;
      if (dot > bestDot) {
        bestDot = dot;
        best = e;
      }
    }
    if (best === undefined) return [{ dir: c.dir, rate: 0.8 }];
    const dir = toward(c.from, best) ?? c.dir;
    return [{ dir, rate: 0.8 }];
  },
});

// ---------------------------------------------------------------- ㊻ 双属の弓
//
// **属性が必ず 2 つ付く。**
// 足りないぶんは `shoot.ts` が**その 1 発だけ**足す（アイテムには書かない）
defineAbility("dual_element", { minElements: 2 });

// ---------------------------------------------------------------- ① 支給された弓 / ⑭ 無銘弓
//
// **効果なし。** そのぶん素の火力で払う（`docs/spec/19-weapons.md` 2 章）
defineAbility("none", {});

// ---------------------------------------------------------------- ⑫ 拾い屋の弓
//
// **落とし物が増える**——**その仕組みがまだ無い**
//（`docs/01-rules.md` の「落とし物」）。
//
// **見た目だけ先に入れておく。** 倒したときに金の粒が舞う——
// **仕組みができたら、ここで拾える数を増やす。**
defineAbility("more_drops", {
  onHit: (c) => {
    put(c.player.dimension, "pve:star_dust", { x: c.at.x, y: c.at.y + 1.0, z: c.at.z });
  },
});

// ---------------------------------------------------------------- ㉜ 銘入りの弓
//
// **エンチャントが付きやすい**——**エンチャント本体がまだ無い**
//（`docs/drafts/archer-enchants.md`）。
//
// **柄が光る**ところまでを入れておく。
defineAbility("enchant_luck", {
  after: (c) => {
    try {
      c.player.dimension.spawnParticle("pve:trail_star_spark", {
        x: c.from.x + c.dir.x * 0.6,
        y: c.from.y - 0.2,
        z: c.from.z + c.dir.z * 0.6,
      });
    } catch {
      /* 読み込まれていない */
    }
  },
});
