/**
 * ドローンの見え方。**名前と照準。**
 *
 * 仕様は `docs/spec/23-drone.md` 3 章。
 *
 * ## 味方と敵で、書いてあることが違う
 *
 * | 相手 | 何が見えるか | いつ |
 * | --- | --- | --- |
 * | **味方** | **`ばーど のドローン`** | **常に** |
 * | **敵** | **`敵のドローン`**（**その機体のチームの色**） | **見つけている間だけ** |
 * | 操縦中の本人 | 出さない | — |
 *
 * **敵に持ち主の名前を渡さない。**
 * 誰の機体かは**味方の中でだけ意味がある**情報で、
 * 敵にとっては「敵の機体がそこに居る」以上のことは要らない。
 *
 * 書いてあることが違う以上、**表示は 2 つ持つ。**
 * `DebugText` は 1 つにつき 1 つの文しか持てない。
 *
 * ## 見せ先が空のときは、出さない
 *
 * `visibleTo` を**空にすると「全員に見える」**という意味になる（型定義の但し書き）。
 * 誰にも見せたくないときは、**表示ごと外す。**
 *
 * ## 照準
 *
 * **カメラを移すと、真ん中の印が出ない。**
 * どこを狙っているのか分からないので、**見ている先に印を置く。**
 * **本人にだけ見せる。**
 */

import { world, type Player, type RGBA, type Vector3 } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import { teamOf, type Team } from "../../lib/match-state.js";

/** 名札を出す高さ（機体からのマス） */
const NAME_HEIGHT = 0.8;

/** 照準を置く距離（マス）。**遠すぎると小さく、近すぎると邪魔** */
const AIM_DIST = 6;

/** 照準の字 */
const AIM = "§f✛";

/** 敵から見たときの文。**持ち主の名前は出さない** */
const FOE_TEXT = "敵のドローン";

/** どこまで見えるか（マス） */
const RENDER_DISTANCE = 96;

/** 見つけたとみなす角度（度）。**プレイヤーと同じ** */
const HALF_ANGLE = 60;

/** 見つけられる距離（マス）。**プレイヤーと同じ** */
const MAX_DIST = 30;

/** 相手の手前で視線を止める量（マス） */
const BACKSTOP = 0.05;

/** チームの色 */
const COLOR: Readonly<Record<Team, RGBA>> = {
  red: { red: 1, green: 0.25, blue: 0.25, alpha: 1 },
  blue: { red: 0.35, green: 0.55, blue: 1, alpha: 1 },
};

/** 所属が無いときの色。**試合をしていない間** */
const PLAIN: RGBA = { red: 1, green: 1, blue: 1, alpha: 1 };

/**
 * 所属が分からない機体を、敵から見たときの色。
 *
 * **試合をしていない間だけ使う。**
 * 所属があるなら、**その機体のチームの色**で出す（下記）。
 */
const FOE_COLOR: RGBA = { red: 1, green: 0.35, blue: 0.35, alpha: 1 };

/** チームの色記号 */
const TAG: Readonly<Record<Team, string>> = { red: "§c", blue: "§9" };

interface Slot {
  shape: DebugText;
  /** 見せている相手。**変わったら貼り直す** */
  audience: string;
}

interface Shown {
  /** 味方向け。**持ち主の名前** */
  own?: Slot;
  /** 敵向け。**「敵のドローン」** */
  foe?: Slot;
  /** 照準。**操縦している間だけ** */
  aim?: DebugText;
}

const shown = new Map<string, Shown>();

/** その人から機体が見えているか。**角度・距離・遮蔽**（プレイヤーと同じ） */
function sees(watcher: Player, at: Vector3): boolean {
  try {
    const from = watcher.getHeadLocation();
    const to = { x: at.x - from.x, y: at.y - from.y, z: at.z - from.z };
    const dist = Math.hypot(to.x, to.y, to.z);
    if (dist < 0.5 || dist > MAX_DIST) return false;

    const v = watcher.getViewDirection();
    const dot = (to.x * v.x + to.y * v.y + to.z * v.z) / dist;
    if (dot < Math.cos((HALF_ANGLE * Math.PI) / 180)) return false;

    const hit = watcher.dimension.getBlockFromRay(
      from,
      { x: to.x / dist, y: to.y / dist, z: to.z / dist },
      { includePassableBlocks: false, includeLiquidBlocks: false, maxDistance: Math.max(0, dist - BACKSTOP) }
    );
    return hit === undefined;
  } catch {
    return false;
  }
}

/** 見せ先を id の並びにする。**変わったかを見るため** */
function keyOf(players: readonly Player[]): string {
  return players
    .map((p) => p.id)
    .sort()
    .join(",");
}

/** 1 つの表示を、いまの見せ先に合わせる。**空なら外す** */
function apply(slot: Slot | undefined, audience: Player[], make: () => DebugText, at: Vector3): Slot | undefined {
  // **誰にも見せないなら出さない。** 空の一覧は「全員に見える」を意味する
  if (audience.length === 0) {
    if (slot !== undefined) drop(slot.shape);
    return undefined;
  }

  const key = keyOf(audience);
  if (slot !== undefined) {
    try {
      slot.shape.setLocation(at);
      if (slot.audience !== key) {
        slot.shape.visibleTo = audience;
        slot.audience = key;
      }
      return slot;
    } catch {
      drop(slot.shape);
    }
  }

  try {
    const shape = make();
    shape.visibleTo = audience;
    return { shape, audience: key };
  } catch {
    return undefined;
  }
}

function drop(shape: DebugText): void {
  try {
    debugDrawer.removeShape(shape);
  } catch {
    /* 既に消えている */
  }
}

/** 消す */
export function hideDroneMark(pilotId: string): void {
  const s = shown.get(pilotId);
  if (s === undefined) return;
  shown.delete(pilotId);
  if (s.own !== undefined) drop(s.own.shape);
  if (s.foe !== undefined) drop(s.foe.shape);
  if (s.aim !== undefined) drop(s.aim);
}

/**
 * 出し直す。**見張りの周期から呼ぶ。**
 *
 * @param at 機体の位置
 * @param eye カメラの位置（**操縦中だけ**）
 * @param dir 見ている向き（**操縦中だけ**）
 */
export function refreshDroneMark(pilot: Player, at: Vector3, eye?: Vector3, dir?: Vector3): void {
  const piloting = eye !== undefined && dir !== undefined;
  const team = teamOf(pilot);
  const nameAt = { x: at.x, y: at.y + NAME_HEIGHT, z: at.z };

  // ---- 見せ先を分ける
  const mates: Player[] = [];
  const foes: Player[] = [];
  for (const p of world.getAllPlayers()) {
    // **操縦中の本人には出さない。** 自分の機体だと分かっている。
    // **置いてきた機体には出す**——どこに置いたか分からなくなるため
    if (piloting && p.id === pilot.id) continue;
    if (team === undefined || teamOf(p) === team) {
      mates.push(p);
      continue;
    }
    // **見つけている間だけ**（プレイヤーと同じ条件）
    if (sees(p, nameAt)) foes.push(p);
  }

  const now = shown.get(pilot.id) ?? {};

  now.own = apply(
    now.own,
    mates,
    () => {
      const tag = team === undefined ? "§f" : TAG[team];
      const shape = new DebugText(nameAt, `${tag}${pilot.name} のドローン`);
      shape.depthTest = false;
      shape.color = team === undefined ? PLAIN : COLOR[team];
      shape.maximumRenderDistance = RENDER_DISTANCE;
      debugDrawer.addShape(shape, pilot.dimension);
      return shape;
    },
    nameAt
  );

  now.foe = apply(
    now.foe,
    foes,
    () => {
      // ---- **色は「機体の所属」で決める**（2026-08-25 修正）
      //
      // 赤で固定していたので、
      // **赤チームから見た青の機体まで赤く出ていた。**
      // 自分の側の色が敵に付くのは、混戦では致命的に紛らわしい。
      //
      // プレイヤーの頭上表示（`features/spotting`）は
      // **その人自身のチームの色**で出している。**同じ規則にそろえる**
      const shape = new DebugText(nameAt, (team === undefined ? "§c" : TAG[team]) + FOE_TEXT);
      shape.depthTest = false;
      shape.color = team === undefined ? FOE_COLOR : COLOR[team];
      shape.maximumRenderDistance = RENDER_DISTANCE;
      debugDrawer.addShape(shape, pilot.dimension);
      return shape;
    },
    nameAt
  );

  // ---- 照準。**操縦している間だけ、本人にだけ**
  if (piloting && eye !== undefined && dir !== undefined) {
    const aimAt = { x: eye.x + dir.x * AIM_DIST, y: eye.y + dir.y * AIM_DIST, z: eye.z + dir.z * AIM_DIST };
    if (now.aim !== undefined) {
      try {
        now.aim.setLocation(aimAt);
      } catch {
        drop(now.aim);
        now.aim = undefined;
      }
    }
    if (now.aim === undefined) {
      try {
        const aim = new DebugText(aimAt, AIM);
        aim.depthTest = false;
        aim.maximumRenderDistance = RENDER_DISTANCE;
        aim.visibleTo = [pilot];
        debugDrawer.addShape(aim, pilot.dimension);
        now.aim = aim;
      } catch {
        /* 読み込まれていない。次の機会に */
      }
    }
  } else if (now.aim !== undefined) {
    drop(now.aim);
    now.aim = undefined;
  }

  shown.set(pilot.id, now);
}
