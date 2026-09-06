/**
 * 大ジャンプ。**足場が離れているマップで、20 マス跳べるようにする。**
 *
 * 仕様は `worlds/pve-v3/docs/02-map.md` 5-0-4。
 *
 * > ### **跳躍力上昇の効果で上げる**（2026-09-06 に戻した）
 * >
 * > | 試したやり方 | どうだったか |
 * > | --- | --- |
 * > | **`minecraft:jump.static`** | **モブ AI の部品。** プレイヤーの跳躍は client 側の物理なので効かない |
 * > | **`minecraft:jump.dynamic`** | `minecraft:movement.skip` が要る（ウサギ・スライム用） |
 * > | **属性** | **プレイヤーに跳躍の属性は無い**（馬の `jump_strength` は馬だけ） |
 * > | **跳び際に `applyKnockback`** | 動くが、**跳ぶ感じが気持ち悪い**（弧の途中で蹴られる） |
 * > | **跳躍力上昇の効果** | **これにした。** 跳ぶ感じが自然 |
 * >
 * > **右に出る効果の UI は、リソパで消してある**（`resource_packs/pve_v3/ui/hud_screen.json`）——
 * > **掛け直すたびに点滅して目障り**だったため。
 *
 * > ### 強さは、その場で変えられる
 * >
 * > **何段でどれだけ跳ぶかが読めない**ので、**`/pve:jump <強さ>` で当てる。**
 * > 決まった値はワールドに残る。
 *
 * > ### 落ちても痛くしない
 * >
 * > 20 マス跳べば 20 マス落ちる。**大ジャンプの間だけ落下ダメージを止める**
 * > （`entities/player.json` の `minecraft:damage_sensor`）。**それ以外は普通に痛い。**
 */

import { world, type Player } from "@minecraft/server";

import { bigJumpOf } from "./mapstore.js";
import { fieldMap } from "../state/match.js";
import { jumpAmp } from "../state/match.js";

/** 落下を痛くしない組を切り替える合図（`entities/player.json`） */
const ON = "pve_v3:jump_big";
const OFF = "pve_v3:jump_off";

/** 掛け直す間隔より長く持たせる（tick） */
const HOLD = 120;

/** 掛け直す間隔（tick） */
const REFRESH = 40;

/** いま大ジャンプにしている人。**同じ合図を毎周期送らない** */
const big = new Set<string>();

/** そのマップは大ジャンプか */
export function bigJumpHere(): boolean {
  return bigJumpOf(fieldMap());
}

/** 1 人ぶん、落下の扱いを切り替える。**変わったときだけ合図を送る** */
function setFall(player: Player, on: boolean): void {
  const was = big.has(player.id);
  if (was === on) return;
  try {
    player.triggerEvent(on ? ON : OFF);
  } catch {
    // **定義が読み込まれていない**（古いパック）。次の機会に
    return;
  }
  if (on) big.add(player.id);
  else big.delete(player.id);
}

/** 効果を掛ける／外す */
function setBoost(player: Player, on: boolean, now: number): void {
  try {
    if (!on) {
      if (big.has(player.id)) player.removeEffect("jump_boost");
      return;
    }
    // **掛け直しは間隔を空ける**（毎 tick 掛けると要らぬ負荷になる）
    if (now % REFRESH !== 0) return;
    player.addEffect("jump_boost", HOLD, { amplifier: jumpAmp(), showParticles: false });
  } catch {
    /* 抜けた */
  }
}

/**
 * 毎周期、あるべき姿へ寄せる（`docs/imp.md` 10-7）。
 *
 * @param onField その人が戦場に居るか
 */
export function stepJump(now: number, onField: (player: Player) => boolean): void {
  const here = bigJumpHere();
  const seen = new Set<string>();
  for (const p of world.getAllPlayers()) {
    seen.add(p.id);
    const on = here && onField(p);
    setBoost(p, on, now);
    setFall(p, on);
  }
  // **抜けた人は覚えておかない**（入り直したら既定に戻る）
  for (const id of [...big]) if (!seen.has(id)) big.delete(id);
}
