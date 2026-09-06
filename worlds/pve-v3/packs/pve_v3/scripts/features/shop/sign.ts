/**
 * 台に浮かぶ札。**近づくと、何の強化かと値段が見える。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 3-4。
 *
 * > ### **見えるのは、その人だけ**
 * >
 * > **レベルも手持ちも人ごとに違う。**
 * > `DebugText` の `visibleTo` に本人だけを入れる——
 * > **全員に見せると、他人の数字が出てしまう。**
 *
 * > ### 近づいたときだけ
 * >
 * > **半径 5 マス**（2026-09-06 に 3 → 5）。
 * > 出しっぱなしにすると、戦場が札だらけになる。
 *
 * > ### **近くにある台は、全部出す**（2026-09-06）
 * >
 * > **いちばん近い 1 つだけ**にしていたが、台が並んでいると
 * > **片方しか読めない。** 範囲に入っているものは全部出す。
 *
 * > ### **中身が変わっても作り直さない**（2026-09-06）
 * >
 * > 消してから出し直していたので、**殴って数字が動くたびに一瞬消えていた。**
 * > **`setText` で字だけ差し替える**——台は動かないので、位置は作った時のまま。
 */

import { world, type Entity, type Player } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import { postText, type StatKey } from "../../core/growth.js";
import { emeraldOf, levelOf } from "../../state/growth.js";
import { kindOf, vendors } from "../../services/vendor.js";

/** 何マス以内で出すか */
const REACH = 5;

/** 札を浮かべる高さ（台の足元から）。**箱が 0.625 マスなので、その上** */
const UP = 1.4;

/** どこまで見えるか（マス） */
const RENDER_DISTANCE = 24;

/** いま出している札。**人ごと × 台ごと** */
interface Shown {
  readonly shape: DebugText;
  /** いま出している字。**変わったときだけ差し替える** */
  signature: string;
}

/** 人 → （台 → 出している札） */
const shown = new Map<string, Map<string, Shown>>();

function drop(one: Shown): void {
  try {
    debugDrawer.removeShape(one.shape);
  } catch {
    /* 既に消えている */
  }
}

/** その人の札を全部片付ける */
function clearFor(id: string): void {
  const mine = shown.get(id);
  if (mine === undefined) return;
  for (const one of mine.values()) drop(one);
  shown.delete(id);
}

/** その人の近くの台。**範囲に入っているもの全部** */
function nearby(player: Player, all: readonly Entity[]): Entity[] {
  const out: Entity[] = [];
  let at: { x: number; y: number; z: number };
  try {
    at = player.location;
  } catch {
    return out;
  }
  for (const e of all) {
    try {
      const b = e.location;
      if (Math.hypot(at.x - b.x, at.y - b.y, at.z - b.z) <= REACH) out.push(e);
    } catch {
      /* もう居ない */
    }
  }
  return out;
}

/** 1 枚出す。**台は動かない**ので、位置は作った時のまま */
function draw(player: Player, post: Entity, body: string): DebugText | undefined {
  try {
    const at = post.location;
    const shape = new DebugText({ x: at.x, y: at.y + UP, z: at.z }, body);
    // **本人だけに見せる**
    shape.visibleTo = [player];
    shape.depthTest = false;
    shape.color = { red: 1, green: 1, blue: 1, alpha: 1 };
    shape.maximumRenderDistance = RENDER_DISTANCE;
    debugDrawer.addShape(shape, world.getDimension("overworld"));
    return shape;
  } catch {
    return undefined;
  }
}

/** 1 人ぶん書き直す */
function updateOne(player: Player, all: readonly Entity[]): void {
  const mine = shown.get(player.id) ?? new Map<string, Shown>();
  const keep = new Set<string>();
  const emerald = emeraldOf(player);

  for (const post of nearby(player, all)) {
    const kind = kindOf(post);
    // **ショップと職業は札を出さない**（殴って買うのは 1 本売りだけ）
    if (kind === undefined || kind === "shop" || kind === "role") continue;
    const key = kind as StatKey;
    const body = postText(key, levelOf(player, key), emerald);
    keep.add(post.id);

    const cur = mine.get(post.id);
    if (cur !== undefined) {
      // **字だけ差し替える。** 作り直すと、その一瞬だけ消えて見える
      if (cur.signature !== body) {
        try {
          cur.shape.setText(body);
          cur.signature = body;
        } catch {
          // **消えていた**（`/reload` など）。作り直す
          drop(cur);
          mine.delete(post.id);
        }
      }
      if (mine.has(post.id)) continue;
    }
    const shape = draw(player, post, body);
    if (shape === undefined) continue;
    mine.set(post.id, { shape, signature: body });
  }

  // **離れた台の札は片付ける**
  for (const [id, one] of [...mine.entries()]) {
    if (keep.has(id)) continue;
    drop(one);
    mine.delete(id);
  }
  if (mine.size === 0) shown.delete(player.id);
  else shown.set(player.id, mine);
}

/** 毎周期。**近づいている人にだけ札を出す** */
export function updateSigns(): void {
  const all = vendors();
  const here = new Set<string>();
  for (const p of world.getAllPlayers()) {
    here.add(p.id);
    updateOne(p, all);
  }
  // **抜けた人の札を片付ける**
  for (const id of [...shown.keys()]) if (!here.has(id)) clearFor(id);
}
