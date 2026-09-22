/**
 * 敵を呼ぶ（確認用）。
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 7-1。
 *
 * ```
 * 運営メニュー ─ 敵を呼ぶ
 *   種類 ／ 数 ／ いまのウェーブと呪いを乗せるか
 *        ↓
 *   見ている所（無ければ 3 マス先）に出す
 * ```
 *
 * > ### 湧き点も待ち行列も通さない
 * >
 * > **その場に出す。** マップに湧き点が登録されていなくても呼べる——
 * > **1 体だけ見て確かめたい**ときのため。
 */

import type { Entity, Player, Vector3 } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

import { ENEMIES } from "../../core/roster.js";
import { summon } from "../../services/spawn.js";
import { curseMults } from "../../services/curse.js";
import { wave as waveNow } from "../../state/match.js";
import { putDummy } from "../../services/dummy.js";

/** 一度に出せる上限。**押し間違いで戦場が埋まらないように** */
const MAX = 20;

/** カカシは敵の表に載っていない。**確認用なので、ここに混ぜる** */
const DUMMY_PICK = "dummy";

/** 並べる順。**表の順そのまま ＋ 最後にカカシ** */
function picks(): readonly string[] {
  return [...Object.keys(ENEMIES), DUMMY_PICK];
}

function labelOf(id: string): string {
  if (id === DUMMY_PICK) return "カカシ（動かない・倒れない）";
  const def = ENEMIES[id];
  return def === undefined ? id : `${def.name}  §8HP ${def.hp} 力 ${def.attack}`;
}

/**
 * 出す場所。**見ている所の 1 つ上。**
 *
 * **遠くを見ていない**ときは、**足元から 3 マス先**に出す。
 */
function spotOf(player: Player): Vector3 {
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: 48 });
    if (hit !== undefined) {
      const b = hit.block;
      return { x: b.location.x + 0.5, y: b.location.y + 1, z: b.location.z + 0.5 };
    }
  } catch {
    /* 何も見ていない */
  }
  const at = player.location;
  const v = player.getViewDirection();
  return { x: at.x + v.x * 3, y: at.y, z: at.z + v.z * 3 };
}

/** 敵を呼ぶ画面 */
/**
 * **実際に入った速さを読む。**
 *
 * > ### **「乗っていない」と「刻みが小さい」は見分けが付かない**（2026-09-08）
 * >
 * > **飛ぶ敵は `minecraft:flying_speed` で飛ぶ**（`25-enemy-kit.md` 11 章）。
 * > **移動速度の効果でも属性でも伸びない値**——**バニラのミツバチも同じ。**
 * > **倍率はこちらで置き直している**ので、**数を見て確かめる。**
 */
function speedsOf(e: Entity): string {
  try {
    const walk = e.getComponent("minecraft:movement")?.currentValue;
    const fly = e.getComponent("minecraft:flying_speed")?.value;
    const bits: string[] = [];
    if (walk !== undefined) bits.push(`歩き §f${walk.toFixed(3)}`);
    if (fly !== undefined) bits.push(`飛び §f${fly.toFixed(3)}`);
    return bits.length === 0 ? "" : `§8速さ: §7${bits.join("§7 ／ ")}`;
  } catch {
    return "";
  }
}

export async function openSummon(player: Player): Promise<void> {
  const ids = picks();
  const form = new ModalFormData()
    .title("§l敵を呼ぶ")
    .dropdown(
      "種類",
      ids.map((id) => labelOf(id)),
      { defaultValueIndex: 0 }
    )
    .slider("数", 1, MAX, { defaultValue: 1, valueStep: 1 })
    .toggle("いまのウェーブと呪いを乗せる", { defaultValue: true });

  const res = await form.show(player);
  if (res.canceled === true || res.formValues === undefined) return;
  const [pick, count, withWave] = res.formValues;
  const id = ids[typeof pick === "number" ? pick : 0];
  if (id === undefined) return;
  const n = typeof count === "number" ? Math.max(1, Math.min(MAX, Math.round(count))) : 1;
  const at = spotOf(player);

  let made = 0;
  for (let i = 0; i < n; i++) {
    // **同じ点に重ねない。** 少しずつずらす
    const spot = { x: at.x + (Math.random() - 0.5) * 2, y: at.y, z: at.z + (Math.random() - 0.5) * 2 };
    const born = id === DUMMY_PICK ? putDummy(spot) : summon(id, spot, withWave === true);
    const ok = born !== undefined;
    if (ok) made++;
  }
  if (made === 0) {
    player.sendMessage("§c出せなかった");
    return;
  }
  // > ### **どの倍率で出したかを見せる**（2026-09-08）
  // >
  // > **「呪いが乗っていない」と「刻みが小さくて見えない」は、見た目で区別が付かない。**
  // > **数を出せば、その場で分かる。**
  const m = curseMults();
  const wave =
    withWave === true
      ? `§7ウェーブ §f${Math.max(1, waveNow())}§7 ／ 呪い HP §f×${m.hp.toFixed(2)}§7 力 §f×${m.power.toFixed(2)}§7 速 §f×${m.speed.toFixed(2)}§7 攻速 §f×${m.haste.toFixed(2)}`
      : "§8素の値（ウェーブと呪いは乗せていない）";
  player.sendMessage(`§7${labelOf(id).split("  §8")[0]}§7 を §f${made}§7 体 出した §8— ${wave}`);
}
