/**
 * 敵の頭上表示。**人ごとに、見せる相手を選ぶ。**
 *
 * 仕様は `docs/spec/10-implementation.md` 8-1。
 *
 * ```
 * §cゾンビ
 * §a|||||||§0|||||||
 * §7HP §f120§7/200
 * ```
 *
 * ## なぜ名札ではないのか
 *
 * > ### **`nameTag` は「その人にだけ」が作れない**
 * >
 * > **実体が 1 つ持つ文字列で、見る人ごとに変えられない。**
 * > **他の人の近くに居る敵、他の人が削った敵まで、全員に見えてしまう。**
 *
 * **`@minecraft/debug-utilities` の `DebugText` なら `visibleTo` で見せ先を選べる**——
 * core-wars の頭上表示と同じ仕組み
 *（`worlds/core-wars/docs/spec/15-presentation.md` 7-3-A）。
 *
 * | | |
 * | --- | --- |
 * | `attachedTo` | **敵に貼り付く。** 位置を毎 tick 追いかけなくてよい |
 * | **`visibleTo`** | **見せる相手を選べる。ここが肝** |
 * | `depthTest = false` | 壁越しにも描く |
 * | しゃがみ | **無関係。** 名札ではないので隠されない |
 *
 * ## 表示は敵 1 体につき 1 つ
 *
 * **人ごとに作らない。** **1 つ作って、`visibleTo` に見る人を並べる。**
 * **敵 20 体 × 人数ぶんの表示にはならない。**
 */

import { world, type Entity, type Player } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import { bar, hpNumber } from "../../core/bar.js";
import { plateText } from "../../core/plate.js";
import { ENEMY_FAMILY } from "../../services/field.js";
import { hitBy } from "../../services/reward.js";
import { current, has, max } from "../../state/hp.js";
import { labelOf } from "../../state/label.js";

/** 探す距離（マス）。**遠くの分まで組み立てない** */
const RANGE = 64;

/** 描く距離（マス）。**画面が文字だらけにならないように** */
const DRAW_RANGE = 48;

/** 敵の基準位置からの表示高さ（マス）。従来より0.5マス上 */
const HEIGHT = 2.7;

/**
 * **1 人につき、必ず出す近い敵の数**（`10-implementation.md` 8-1）。
 *
 * > ### **敵が増えるほど重くなる**
 * >
 * > **1 体ごとに文字を組み立てて書き込む。** **視界に 40 体居れば 40 回。**
 * > **近い順に絞れば、見えるものは変わらないまま軽くなる。**
 */
const NEAR_MAX = 5;

/** **自分が削った敵の枠。** ここも近い順に切る */
const HURT_MAX = 15;

/** 出している表示。**メモリだけ。** `/reload` で消えてよい */
interface Mark {
  shape: DebugText;
  text: string;
  /** 見せている相手。**変わったときだけ差し替える** */
  audience: string;
}
const marks = new Map<string, Mark>();

/** 中身 */
function plate(entity: Entity): string | undefined {
  const now = current(entity);
  const cap = max(entity);
  if (now === undefined || cap === undefined) return undefined;
  return plateText({
    name: `§f${labelOf(entity) ?? "？"}`,
    bar: bar(now, cap),
    hp: `§7HP ${hpNumber(now, cap)}`,
  });
}

/** それは敵か */
function isFoe(entity: Entity): boolean {
  try {
    return entity.matches({ families: [ENEMY_FAMILY] });
  } catch {
    return false;
  }
}

/** 2 点の距離の二乗。**平方根は要らない**（並べ替えにしか使わない） */
function far2(a: Entity, b: Player): number {
  const p = a.location;
  const q = b.location;
  return (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2;
}

/** 見せ先が変わったか比べる鍵 */
function keyOf(audience: Player[]): string {
  return audience
    .map((p) => p.id)
    .sort()
    .join(",");
}

/** 消す */
function hide(id: string): void {
  const m = marks.get(id);
  marks.delete(id);
  if (m === undefined) return;
  try {
    m.shape.remove();
  } catch {
    /* もう無い */
  }
}

/**
 * **誰が、どの敵を見るか**を組む。
 *
 * ```
 * その人から近い順に並べる
 *   ├ 先頭 5 体            ── 必ず
 *   └ 6 体目以降で自分が削った敵 ── 近い順に 15 体
 * ```
 *
 * **「自分が削った」は本当にその人だけ**（`services/reward.ts` の `hitBy`）。
 *
 * @returns 敵の id → 見せる相手
 */
function audiences(): Map<string, { foe: Entity; viewers: Player[] }> {
  const out = new Map<string, { foe: Entity; viewers: Player[] }>();
  const want = (foe: Entity, viewer: Player): void => {
    const got = out.get(foe.id);
    if (got === undefined) out.set(foe.id, { foe, viewers: [viewer] });
    else if (!got.viewers.includes(viewer)) got.viewers.push(viewer);
  };
  for (const p of world.getAllPlayers()) {
    try {
      const foes: Entity[] = [];
      for (const e of p.dimension.getEntities({ location: p.location, maxDistance: RANGE })) {
        if (e.id === p.id) continue;
        if (!has(e)) continue;
        if (!isFoe(e)) continue;
        foes.push(e);
      }
      // **1 度だけ並べ替えて、2 つの枠を上から取る**
      foes.sort((a, b) => far2(a, p) - far2(b, p));
      for (const e of foes.slice(0, NEAR_MAX)) want(e, p);
      let left = HURT_MAX;
      for (const e of foes.slice(NEAR_MAX)) {
        if (left <= 0) break;
        if (!hitBy(e, p)) continue;
        want(e, p);
        left -= 1;
      }
    } catch {
      /* 消えている */
    }
  }
  return out;
}

/**
 * 出し直す。**変わったものだけ書き換える。**
 *
 * > ### **書き換える。作り直さない**
 * >
 * > **HP は当たるたびに変わる。**
 * > **作り直すと、消えるのと出るのが同じ tick に重なってちらつく。**
 * > **`setText` で同じ実体のまま書き換える。**
 */
export function updateFoePlates(): void {
  const live = audiences();
  for (const [id, { foe, viewers }] of live) {
    const text = plate(foe);
    if (text === undefined || viewers.length === 0) {
      hide(id);
      continue;
    }
    const key = keyOf(viewers);
    const now = marks.get(id);
    if (now !== undefined) {
      try {
        if (now.text !== text) {
          now.shape.setText(text);
          now.text = text;
        }
        if (now.audience !== key) {
          now.shape.visibleTo = viewers;
          now.audience = key;
        }
        continue;
      } catch {
        // **書き換えられなかった。** 下で作り直す
        hide(id);
      }
    }
    try {
      const shape = new DebugText({ x: 0, y: HEIGHT, z: 0 }, text);
      // **敵に貼り付ける。** 位置は毎 tick 追いかけなくてよい
      shape.attachedTo = foe;
      // **壁越しにも描く。** 既定でこちらだが、意図として書いておく
      shape.depthTest = false;
      shape.visibleTo = viewers;
      shape.maximumRenderDistance = DRAW_RANGE;
      debugDrawer.addShape(shape, foe.dimension);
      marks.set(id, { shape, text, audience: key });
    } catch {
      /* 出せなかった。次の機会に */
    }
  }
  // **枠から外れた敵の表示を残さない**
  for (const id of [...marks.keys()]) if (!live.has(id)) hide(id);
}
