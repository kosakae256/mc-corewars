/**
 * 置く。`docs/spec/14-build.md`。
 *
 * 輪の中で毎 tick N 個（`perTick`）。下の層から、層の中はランダム（順は core/order が決めてある）。
 * 音は 1 tick に 1 回、全員の耳元で。全部置いたら `answering` へ。
 */

import { system } from "@minecraft/server";

import type { Feature } from "../../types.js";
import { BUILD_BOX, gridToWorld, inBox } from "../../core/box.js";
import { phase, setPhase } from "../../state/phase.js";
import { round } from "../../state/round.js";
import { clearBox, placeBlock, playSoundAll } from "../../services/blocks.js";
import { tellOps } from "../../services/tell.js";

const PLACE_SOUND = "random.pop"; // 「ぽぽぽぽ」。全員の耳元で（14-build）
const DONE_SOUND = "random.levelup";

function tick(): void {
  if (phase() !== "building") return;
  const r = round();
  if (!r) return;
  // ---- まず箱を空にする（1 tick で 216,000 マス。fillBlocks は 32k ずつ 7 回）
  if (r.placed < 0) {
    clearBox();
    r.placed = 0;
    return;
  }
  const end = Math.min(r.order.length, r.placed + r.perTick);
  let last: { x: number; y: number; z: number } | undefined;
  for (let i = r.placed; i < end; i++) {
    const c = r.order[i];
    if (!c) break;
    const w = gridToWorld(r.size, r.height, c);
    // **箱の外には置かない**（bridge のバグでワールドを壊さない）
    if (!inBox(BUILD_BOX, w)) continue;
    const id = r.palette[c.block];
    if (!id) continue;
    try {
      placeBlock(w.x, w.y, w.z, id);
      last = w;
    } catch (err) {
      tellOps(`置けない: ${id} @ ${w.x},${w.y},${w.z} — ${String(err)}`);
    }
  }
  r.placed = end;
  if (last && system.currentTick % 2 === 0) playSoundAll(PLACE_SOUND, 0.6, 0.9 + (r.placed % 5) * 0.1); // 2 tick に 1 回。ピッチを少し揺らす
  if (r.placed >= r.order.length) {
    playSoundAll(DONE_SOUND);
    setPhase("answering", system.currentTick);
  }
}

export const build: Feature = { name: "build", tick: { every: 1, run: tick } };
