/**
 * 狙っているブロックに枠を重ねる。
 *
 * 仕様は `docs/spec/13-grapple.md` 2-C。
 *
 * ## なぜ要るのか
 *
 * 線と先端の粒だけでは、**どのブロックに掛かるのかが分かりにくい。**
 * 面のどちら側なのか、隣のマスなのか、粒では読み取れない。
 *
 * **そのブロックを白く縁取る。** 見た目が変わるので、迷いようが無い。
 *
 * ## ブロックそのものは変えない
 *
 * 置き換えれば色は変わるが、**マップを書き換えることになる。**
 * 元に戻し損ねれば、その傷が残る。
 *
 * **重ねるだけ**なら、消えれば元通り。
 *
 * ## 本人にしか見せない
 *
 * `visibleTo` にその人だけを入れる。
 * **狙っている場所は本人の情報**で、盤面に出す情報ではない。
 *
 * > **空の一覧は「全員に見える」**という意味になる（型定義の但し書き）。
 * > 見せる相手が居ないなら、**表示ごと外す。**
 */

import { world, type Player, type Vector3 } from "@minecraft/server";
import { DebugBox, debugDrawer } from "@minecraft/debug-utilities";

/**
 * 枠の色。**薄い白。**
 *
 * 濃さ（`alpha`）が効かないことがあるので、
 * **色そのものを暗くして薄く見せる**（2026-08-26 調整）。
 */
const COLOR = { red: 0.62, green: 0.62, blue: 0.62, alpha: 0.15 };

/** ブロックより少しだけ大きく。**面と重なってちらつくのを避ける** */
const BOUND = 1.02;

/** どこまで見えるか（マス） */
const RENDER_DISTANCE = 64;

interface Shown {
  box: DebugBox;
  /** いま出しているブロック。**変わったら動かす** */
  at: string;
}

const shown = new Map<string, Shown>();

function key(at: Vector3): string {
  return `${at.x},${at.y},${at.z}`;
}

/** 消す */
export function hideAimBox(playerId: string): void {
  const s = shown.get(playerId);
  if (s === undefined) return;
  shown.delete(playerId);
  try {
    debugDrawer.removeShape(s.box);
  } catch {
    /* 既に消えている */
  }
}

/**
 * 狙っているブロックに枠を出す。
 *
 * **見張りの周期から呼ぶ。** 狙っていないときは `hideAimBox`。
 *
 * @param block ブロックの座標（角）
 */
export function showAimBox(player: Player, block: Vector3): void {
  // **ブロックの真ん中に置く。** 枠の位置は中心
  const center = { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 };
  const k = key(block);
  const now = shown.get(player.id);

  if (now !== undefined) {
    if (now.at === k) return;
    // **同じ枠を動かす。** 出し直すとちらつく
    try {
      now.box.setLocation(center);
      now.at = k;
      return;
    } catch {
      hideAimBox(player.id);
    }
  }

  try {
    const box = new DebugBox(center);
    box.bound = { x: BOUND, y: BOUND, z: BOUND };
    box.color = COLOR;
    box.maximumRenderDistance = RENDER_DISTANCE;
    box.visibleTo = [player];
    debugDrawer.addShape(box, player.dimension);
    shown.set(player.id, { box, at: k });
  } catch {
    /* 読み込まれていない。次の tick に */
  }
}

/** 居なくなった人の枠を片付ける。**見張りの周期から呼ぶ** */
export function sweepAimBoxes(): void {
  if (shown.size === 0) return;
  const here = new Set(world.getAllPlayers().map((p) => p.id));
  for (const id of [...shown.keys()]) if (!here.has(id)) hideAimBox(id);
}
