/**
 * 見た目。**名前を消し、帽子でチームを示す。**
 *
 * 仕様は `docs/spec/15-presentation.md` 7章。
 *
 * ## 名前を消す
 *
 * 名前が見えると、**壁の向こうの相手まで分かってしまう。**
 * 隠れる意味が無くなり、位置取りが成立しない。
 *
 * ## 代わりに帽子
 *
 * 名前が無くても**色で敵味方が分かる。**
 * 防御力は 0、外せない、落ちない。
 */

import { EquipmentSlot, ItemLockMode, ItemStack, system, world, type Player } from "@minecraft/server";

import { isRunning, teamOf, type Team } from "../../lib/match-state.js";
import { isFlyingDrone } from "../drone/index.js";

/**
 * 帽子に使うアイテム。**チームごとの専用装備**（2026-08-25 変更）。
 *
 * ## なぜ革の帽子をやめたか
 *
 * 染めた革の帽子を使っていたが、条件を満たせない
 *（`docs/spec/15-presentation.md` 7-2）。
 *
 * | 困ること | |
 * | --- | --- |
 * | 防御力が 1 ある | 「守りには関係しない」に反する |
 * | **耐久がある** | 殴られ続けると**試合中に壊れて消える** |
 * | 色が濁る | 染料の色は暗く、遠くから見分けにくい |
 *
 * 専用アイテムなら、防御力 0・耐久無限・単色を全部決められる。
 * 見た目は attachable（`resource_packs/game/attachables/hat_*.json`）が描く。
 */
const HAT: Readonly<Record<Team, string>> = {
  red: "game:hat_red",
  blue: "game:hat_blue",
};

/** いま敵に見つかっている人。**メモリだけ。** `/reload` で消えてよい */
const spotted = new Set<string>();

/** チームの帽子か。**色違いも光っている版も含めて見分ける** */
function isTeamHat(typeId: string | undefined): boolean {
  if (typeId === undefined) return false;
  return typeId === HAT.red || typeId === HAT.blue;
}

/**
 * 「見つかっている」印を切り替える。
 *
 * **`features/spotting` から呼ぶ。**
 *
 * 見え方そのものは持たない。**頭上の表示（`spotting/marker.ts`）が
 * 毎周期この状態を読んで、見せる相手を決める。**
 */
export function setSpotted(player: Player, on: boolean): void {
  if (on) spotted.add(player.id);
  else spotted.delete(player.id);
}

/** いま光っているか。**確認用のコマンドが使う** */
export function isSpotted(player: Player): boolean {
  return spotted.has(player.id);
}

/** 全部消す。**試合が終わったとき** */
export function clearSpotted(): void {
  spotted.clear();
}

/** 名前を表示する名札の中身。**空にすると消える** */
const HIDDEN_NAME = "";

/**
 * 名札を消したままにする。**変わったときだけ書く。**
 *
 * **見つけた相手の印は名札には出さない**（2026-08-25 変更）。
 * 名札は**しゃがむと消える**ので、隠れている相手ほど見えなくなる。
 * 印は頭上の表示に移した（`features/spotting/marker.ts`）。
 */
function applyName(player: Player): void {
  try {
    if (player.nameTag !== HIDDEN_NAME) player.nameTag = HIDDEN_NAME;
  } catch {
    /* 消えている */
  }
}

/** 見張る間隔（tick）。**1 秒で足りる** */
const INTERVAL = 20;

/**
 * 帽子をかぶせる。
 *
 * **既にかぶっていれば何もしない。** 呼びすぎても増えない。
 */
export function wearTeamHat(player: Player, team: Team): void {
  try {
    const eq = player.getComponent("minecraft:equippable");
    if (eq === undefined) return;
    const want = HAT[team];
    const now = eq.getEquipment(EquipmentSlot.Head);
    if (now?.typeId === want) return;

    // ---- 元から着けていたものは持ち物へ戻す
    //
    // **黙って消さない。** クリエイティブで試している最中の物が
    // 消えると、何が起きたか分からない
    //
    // **ただし相手チームの帽子は戻さない。** 配ったものなので、
    // 持ち物に溜めても使い道が無い（チームが変わったときに起きる）
    if (now !== undefined && !isTeamHat(now.typeId)) {
      try {
        player.getComponent("minecraft:inventory")?.container?.addItem(now);
      } catch {
        // 入らなかった。**落とすより持たせないほうがまし**
      }
    }

    const hat = new ItemStack(want, 1);
    // ---- **枠から動かせないようにする**（docs/spec/15-presentation.md 7-2）
    //
    // `ItemLockMode.slot` は「その枠から出せない」という印。
    // **外せず、捨てられず、別の頭防具と入れ替えられない。**
    //
    // 支給の剣で使っていた仕組みと同じもの。
    // 毎秒かぶせ直すのは**取りこぼしの受け皿**であって、
    // 止めているのはこの印
    hat.lockMode = ItemLockMode.slot;
    hat.keepOnDeath = true;
    hat.nameTag = team === "red" ? "§c赤チーム" : "§9青チーム";
    eq.setEquipment(EquipmentSlot.Head, hat);
  } catch {
    /* 消えている */
  }
}

/** 帽子を外す。**ロビーへ戻すとき** */
export function removeTeamHat(player: Player): void {
  try {
    const eq = player.getComponent("minecraft:equippable");
    const now = eq?.getEquipment(EquipmentSlot.Head);
    if (!isTeamHat(now?.typeId)) return;
    eq?.setEquipment(EquipmentSlot.Head, undefined);
  } catch {
    /* 消えている */
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 *
 * ## 何を見張るのか
 *
 * | | |
 * | --- | --- |
 * | 名前 | 常に消す |
 * | 帽子 | **試合中は必ずかぶっている**（脱がされても戻す） |
 *
 * 枠の印（`ItemLockMode.slot`）で外せなくしてあるが、
 * **取りこぼしの受け皿として毎秒見る。**
 * 印が効かない経路があっても、1 秒で元に戻る。
 */
export function startCosmetic(): void {
  system.runInterval(() => {
    const running = isRunning();
    for (const player of world.getAllPlayers()) {
      // ---- 名札を合わせる（docs/spec/15-presentation.md 7-1 / 7-3）
      //
      // **ふつうは空。見られている間だけ印が出る。**
      // 切り替えは `setSpotted` が即座に行うので、
      // ここは**取りこぼしの受け皿**
      applyName(player);

      if (!running) continue;
      // ---- **飛んでいる間は帽子をかぶせ直さない**（2026-08-25 追加）
      //
      // ドローンは**姿を消して飛ぶ**（`docs/spec/23-drone.md` 2 章）が、
      // **透明は装備を隠さない。**
      // ここで毎秒かぶせ直すと、**空に帽子だけが浮く**
      if (isFlyingDrone(player.id)) continue;
      const team = teamOf(player);
      if (team !== undefined) wearTeamHat(player, team);
    }
  }, INTERVAL);
}
