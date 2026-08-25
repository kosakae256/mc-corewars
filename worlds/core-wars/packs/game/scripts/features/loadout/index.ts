/**
 * 支給品を配る。
 *
 * 仕様は `docs/spec/11-match.md` 5-3。
 *
 * ## なぜ独自アイテムなのか
 *
 * バニラの木の剣だと**耐久度が減って壊れる。** 試合中に丸腰になる。
 * 攻撃力も調整できない。
 *
 * `game:starter_sword` は耐久度を持たない。**壊れない。**
 *
 * ## 鍵は「捨てられない」だけ
 *
 * **持ち替えは自由。捨てるのは禁止**（2026-08-25 変更）。
 *
 * 以前は**枠ごと固定していた**（`ItemLockMode.slot`）が、
 * **並べ替えができず、置き場所を選べなかった。**
 *
 * 禁じたいのは**移動手段を失うこと**だけなので、
 * `ItemLockMode.inventory`（**捨てられない・素材にできない**）で足りる。
 */

import { EquipmentSlot, ItemLockMode, ItemStack, type Player } from "@minecraft/server";

import { clearVault } from "../../lib/vault.js";

/**
 * 支給するもの。
 *
 * **3D Maneuver Gear だけ。** 移動と攻撃を兼ねる（`docs/spec/13-grapple.md`）。
 *
 * 支給の剣は廃止した（2026-08-24）。
 * **専用アイテムの火力はバニラの計算と別に足し込まれ、
 * ネザライトの剣で一撃で倒せる状態になった**（`docs/spec/14-death.md` 7章）。
 */
const SUPPLIES = [{ item: "game:grapple", slot: 0 }] as const;

/**
 * 支給品に掛ける鍵。
 *
 * **捨てられない・素材にできない。だが枠は動かせる。**
 *
 * | | `slot` | **`inventory`** |
 * | --- | --- | --- |
 * | 捨てる | 不可 | **不可** |
 * | クラフトに使う | 不可 | **不可** |
 * | 枠を変える | 不可 | **できる** |
 */
const LOCK = ItemLockMode.inventory;

/** 支給品の識別子。**掛け替えの判定に使う** */
const SUPPLY_IDS: ReadonlySet<string> = new Set(SUPPLIES.map((s) => s.item));

/**
 * 支給品を配る。
 *
 * **開始時・途中参加時・リスポーン時**に呼ぶ（`docs/spec/11-match.md` 5-3）。
 *
 * 既に持っているなら何もしない。**呼びすぎても増えない。**
 */
export function giveLoadout(player: Player): void {
  const inv = player.getComponent("minecraft:inventory");
  if (inv === undefined) return;
  const container = inv.container;
  if (container === undefined) return;

  // **既に持っているものを先に数える。**
  // 持ち物のどこにあってもよい。決まった枠へ戻すと、並べ替えた意味が無くなる
  const held = new Set<string>();
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it === undefined) continue;
    held.add(it.typeId);

    // ---- **前の鍵を掛け替える**（2026-08-25 追加）
    //
    // 枠ごと固定していた頃の支給品が、**持ち物に残ったままになる。**
    // 配り直しは「既に持っている」で素通りするので、
    // **ここで直さないと一生動かせない。**
    if (SUPPLY_IDS.has(it.typeId) && it.lockMode !== LOCK) {
      it.lockMode = LOCK;
      container.setItem(i, it);
    }
  }

  for (const s of SUPPLIES) {
    if (held.has(s.item)) continue;
    const it = new ItemStack(s.item, 1);
    // ---- **捨てられない。だが持ち替えは自由**（2026-08-25 変更）
    //
    // 邪魔だからと捨てられると、**移動手段を失って詰む。**
    // 死んでも落とさない。
    //
    // **枠には縛らない。** どの枠に置くかは持つ人が決める
    it.lockMode = LOCK;
    it.keepOnDeath = true;
    // 決まった枠が空いていればそこへ。埋まっていれば空きへ
    if (container.getItem(s.slot) === undefined) container.setItem(s.slot, it);
    else container.addItem(it);
  }
}

/**
 * 持ち物とエンダーチェストを空にして、支給品だけにする。
 *
 * **後片付けで使う**（`docs/spec/11-match.md` 4章）。
 *
 * ## エンダーチェストはプレイヤー側にある
 *
 * 中身は**ブロックではなくプレイヤーに紐づく。**
 * 拠点のエンダーチェストを空にしても消えない。
 *
 * `minecraft:ender_inventory` から触れる。
 * これが無いと、前の試合の資源を持ち越せてしまう。
 */
export function resetInventory(player: Player): void {
  const inv = player.getComponent("minecraft:inventory");
  const container = inv?.container;
  if (container !== undefined) container.clearAll();

  const ender = player.getComponent("minecraft:ender_inventory");
  const box = ender?.container;
  if (box !== undefined) box.clearAll();

  giveLoadout(player);
}

/**
 * 持ち物と効果を全部消す。
 *
 * **試合が終わったときに呼ぶ**（`docs/spec/11-match.md` 4章）。
 *
 * ## なぜ効果まで消すのか
 *
 * ポーションの効果は**試合をまたいで残る。**
 * 攻撃力上昇を掛けたまま次の試合に入れると、
 * **買っていない強さを持ち込める。**
 *
 * ## 支給品も一度消す
 *
 * ロビーに戻れば 5 秒で配り直される（`features/lobby`）。
 * **例外を作るより、全部消して配り直すほうが単純。**
 *
 * ## 金庫も空にする
 *
 * **持ち物と同じ扱い**（`docs/spec/22-vault.md` 1 章）。
 *
 * ここは「別の人として入り直す」ための処理なので、
 * **持ち越せるものを残さない。**
 * 組を変えて往復すれば溜め込める、という抜け道を塞ぐ。
 */
export function clearEverything(player: Player): void {
  // **金庫も空にする**（持ち物と同じ扱い）
  clearVault(player);
  try {
    player.getComponent("minecraft:inventory")?.container?.clearAll();
  } catch {
    /* 消えている */
  }
  try {
    const ender = player.getComponent("minecraft:ender_inventory")?.container;
    if (ender !== undefined) ender.clearAll();
  } catch {
    /* 消えている */
  }
  try {
    // **装備も外す。** 防具を着たまま次の試合に入れない
    const eq = player.getComponent("minecraft:equippable");
    for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet]) {
      eq?.setEquipment(slot, undefined);
    }
  } catch {
    /* 消えている */
  }
  try {
    for (const e of player.getEffects()) player.removeEffect(e.typeId);
  } catch {
    /* 消えている */
  }
  try {
    player.getComponent("minecraft:health")?.resetToMaxValue();
  } catch {
    /* 消えている */
  }
}
