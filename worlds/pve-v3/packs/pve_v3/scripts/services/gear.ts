/**
 * **持ち物と被り物。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/24-mob-howto.md` 10-3。
 *
 * > ### **部品では持たせられない**
 * >
 * > **`minecraft:equipment`（装備表）は、script で湧かせた個体に効かない。**
 * > **`minecraft:equippable` は書かない**——**1.21.10 以降、全実体に自動で付く**（公式）。
 * >
 * > **描くには `enable_attachables: true` が要る**（`24-mob-howto.md` 6-2-3）。
 * > **持てていても、それが無いと見えない。**
 */

import { EquipmentSlot, ItemStack, type Entity } from "@minecraft/server";

import { tellOps } from "./tell.js";

/**
 * **持たせる・被せる。** **入らなかったら 1 度だけ知らせる。**
 *
 * > ### **黙って失敗するのがいちばん困る**（2026-09-08）
 * >
 * > **弓が見えないとき、「装備できていない」のか「描かれていない」のかが分からなかった。**
 * > **入れた直後に読み返して、空なら記録に残す。**
 */
const warnedGear = new Set<string>();

export function wear(e: Entity, slot: EquipmentSlot, item: string | undefined, kind: string): void {
  if (item === undefined) return;
  try {
    const eq = e.getComponent("minecraft:equippable");
    if (eq === undefined) {
      note(`${kind}: 装備の部品が無い（minecraft:equippable）`);
      return;
    }
    eq.setEquipment(slot, new ItemStack(item));
    if (eq.getEquipment(slot) === undefined) note(`${kind}: ${item} を ${slot} に入れられなかった`);
  } catch (err) {
    note(`${kind}: ${item} を ${slot} に入れる途中で失敗 — ${String(err)}`);
  }
}

/** 同じことを何度も言わない */
function note(text: string): void {
  if (warnedGear.has(text)) return;
  warnedGear.add(text);
  tellOps(`装備: ${text}`);
}
