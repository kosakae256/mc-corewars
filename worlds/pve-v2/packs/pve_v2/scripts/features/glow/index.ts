/**
 * 足元のきらめき。**振った属性の色の粒が、足元に散る。**
 *
 * 仕様は `docs/spec/15-glow.md`。
 *
 * > ### 回さない。**多いか少ないか、それだけ。**
 * >
 * > 玉を輪にして回したら、**機械的でダサかった**（2026-09-01 実機）。
 * > **点が高いほど出る数が増える**——見せたいのはそれだけ。
 *
 * ## 追従のさせ方
 *
 * 粒は世界に置かれるので**貼り付けられない。**
 * **毎 tick、いまの足元から出す**（粒は 0.5 秒ほどで消える）。
 * 走れば粒は後ろに残る——**軌跡になって、かえって速さが見える。**
 */

import { type Player, system, world } from "@minecraft/server";

import * as el from "../../state/element.js";
import type { Feature } from "../../types.js";

/**
 * 1 点あたり、1 tick に出る数。**20 点で 4 tick に 1 個**（毎秒 5）。
 *
 * > ### 粒はバニラの寿命（0.4〜2 秒）で残る
 * >
 * > レッドストーンの粒をそのまま使うので、**1 個が長く残る。**
 * > 毎秒 20 個では**多すぎた**（2026-09-01 実機）ので **1/4** に落とした——
 * > **20 点で常時 3 個前後**が足元に漂う見当。
 */
const PER_POINT = 0.0125;

/**
 * 散らばる半径。
 *
 * **粒自身も左右に飛ぶ**（バニラの初速 ±0.4）ので、置く場所は狭くてよい。
 */
const SPREAD = 0.42;

/** 出る高さ（足元から） */
const LOW = 0.05;
const HIGH = 0.22;

const PARTICLE: Record<el.Element, string> = {
  fire: "pve_v2:glow_fire",
  thunder: "pve_v2:glow_thunder",
  wind: "pve_v2:glow_wind",
  water: "pve_v2:glow_water",
  ice: "pve_v2:glow_ice",
};

/**
 * 何個出すか。
 *
 * **1 個未満は確率で出す**——2 点なら 5 tick に 1 個。
 * 切り捨てると、低い点で何も出なくなる。
 */
function howMany(points: number): number {
  const rate = points * PER_POINT;
  const whole = Math.floor(rate);
  return whole + (Math.random() < rate - whole ? 1 : 0);
}

function draw(player: Player): void {
  const values = el.all(player);
  const at = player.location;
  const dim = player.dimension;

  for (const kind of el.ELEMENTS) {
    const points = values[kind];
    if (points <= 0) continue;
    const id = PARTICLE[kind];

    for (let i = howMany(points); i > 0; i--) {
      // **円の中に均等に散らす**（`sqrt` を掛けないと中心へ寄る）
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SPREAD;
      dim.spawnParticle(id, {
        x: at.x + Math.cos(a) * r,
        y: at.y + LOW + Math.random() * (HIGH - LOW),
        z: at.z + Math.sin(a) * r,
      });
    }
  }
}

function tick(): void {
  for (const player of world.getAllPlayers()) {
    try {
      draw(player);
    } catch {
      /* 消えている */
    }
  }
}

export const glow: Feature = {
  name: "glow",
  tick: { every: 1, run: tick },
};
