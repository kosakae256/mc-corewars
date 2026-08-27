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
 * **Swift Sword [Mk-1] だけ**（2026-08-26 変更）。
 * 移動と攻撃を兼ねる（`docs/spec/13-grapple.md` 9 章）。
 *
 * ## 3D Maneuver Gear は退役した
 *
 * **剣が全部ワイヤー射出装置になった**ので、
 * 「移動用の道具」と「武器」を分けて持つ理由が無くなった。
 *
 * **一番下の段（Mk-1）を無料で配る。**
 * 買えるのは Mk-2 から。
 * 買わなくても飛べて、買えば火力が上がる——という並びになる。
 */
const SUPPLIES = [{ item: "game:sword_wood", slot: 0 }] as const;

/** 支給品の識別子。**掛け替えの判定に使う** */
const SUPPLY_IDS: ReadonlySet<string> = new Set(SUPPLIES.map((s) => s.item));

/**
 * もう配らないもの。**見つけたら取り上げる。**
 *
 * 3D Maneuver Gear は Swift Sword に置き換わった（2026-08-26）。
 * **持ったままだと、退役した道具が手元に残り続ける**——
 * 捨てられない印が付いているので、本人には外せない。
 */
const RETIRED: ReadonlySet<string> = new Set(["game:grapple"]);

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

    // ---- **退役した道具は取り上げる**（2026-08-26 追加）
    if (RETIRED.has(it.typeId)) {
      container.setItem(i, undefined);
      continue;
    }
    held.add(it.typeId);

    // ---- **前の鍵を外す**（2026-08-26 変更）
    //
    // 鍵を付けていた頃の支給品が、**持ち物に残ったままになる。**
    // 配り直しは「既に持っている」で素通りするので、
    // **ここで外さないと、但し書きが出続ける。**
    if (SUPPLY_IDS.has(it.typeId) && it.lockMode !== ItemLockMode.none) {
      it.lockMode = ItemLockMode.none;
      it.keepOnDeath = false;
      container.setItem(i, it);
    }
  }

  for (const s of SUPPLIES) {
    if (held.has(s.item)) continue;
    const it = new ItemStack(s.item, 1);
    // ---- **鍵は付けない**（2026-08-26 変更）
    //
    // 仕様は `docs/spec/16-participation.md` 2-4。
    //
    // `ItemLockMode` を付けると、**持ち替えるたびに但し書きが出て、
    // ワイヤーのガス表示と重なる。** 言語ファイルでは消せなかった。
    //
    // **捨てられたら拾い直して返す**（`features/special/nodrop`）。
    // 死んでも落とさないのは `features/death` の側で決めている
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
