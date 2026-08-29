/**
 * 弓（Archer）。
 *
 * 仕様は `docs/04-roles.md` 2 章、`docs/spec/11-structure.md`。
 *
 * **ここは宣言と配線だけ。** 撃つ処理は `shoot.ts`、武器の一覧は `weapons.ts`。
 *
 * ## 固有能力は「型」で持つ
 *
 * **48 本ぶんの分岐をここに書かない**（`docs/spec/19-weapons.md` 3 章）。
 * 撃つ処理（`shoot.ts`）が、弓の持つ型を見て差し込む。
 *
 * ## 操作は変えない
 *
 * **右クリック長押しで溜めて、離して撃つ**（`docs/drafts/archer-weapons.md` 0-1）。
 *
 * | イベント | 意味 |
 * | --- | --- |
 * | `itemStartUse` | **引き始めた** |
 * | `itemReleaseUse` | **離した**（撃つ） |
 * | `itemStopUse` | 中断した（持ち替えなど） |
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  ItemStack,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Player,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { elementsOf } from "../../state/item-element.js";
import { enchantsOf } from "../../state/item-enchant.js";
import { refreshItem } from "../item/view.js";
import { FULL_CHARGE_TICKS } from "../../lib/charge.js";
// **能力の登録**（読み込むだけで `defineAbility` が走る。`docs/spec/19-weapons.md` 3 章）
import "./abilities/shots.js";
import "./abilities/impact.js";
import "./abilities/onhit.js";
import "./abilities/special.js";
import { abilityOf } from "./abilities/index.js";
import { enchantCommand } from "./enchants/command.js";
import { shoot, playerById } from "./shoot.js";
import { BOWS, bowOf, type Bow } from "./weapons.js";

/** 引き始めた時刻（tick）。**メモリだけ。** `/reload` で消えてよい */
const drawing = new Map<string, number>();

/**
 * ためきった合図の音（`docs/spec/13-bow-view.md` 3-2）。
 *
 * **狩りの弓のように、ためきった瞬間に「キン」と鳴る。**
 * **いつ撃てばいいかが、画面を見なくても分かる。**
 */
const CHARGED_SOUND = "pve.bow.charged";

/** ためきりを知らせる。**その弓のため時間で鳴る**（延びる弓は延びた時間で） */
function noticeCharged(player: Player, bow: Bow, startedAt: number): void {
  // **ためが無い弓では鳴らさない**（速射弓。鳴らすと撃ち始めに 1 度だけ鳴って紛らわしい）
  if (abilityOf(bow.ability).autoEvery !== undefined) return;
  const full = bow.fullTicks ?? FULL_CHARGE_TICKS;
  system.runTimeout(() => {
    // **まだ同じ引きが続いているときだけ。** 離した後に鳴らさない
    if (drawing.get(player.id) !== startedAt) return;
    try {
      player.playSound(CHARGED_SOUND, { volume: 0.7, pitch: 1.0 });
    } catch {
      /* 消えている */
    }
  }, full);
}

function subscribe(): void {
  // ---- **武器ごとの演出はフックで足す**（`docs/spec/11-structure.md` 2-2）
  //
  // ダメージの通り道には触らない。**当たったことだけを受け取る**
  // ---- 引き始めた
  world.afterEvents.itemStartUse.subscribe((ev) => {
    const bow = bowOf(ev.itemStack?.typeId);
    if (bow === undefined) return;
    const at = system.currentTick;
    drawing.set(ev.source.id, at);
    noticeCharged(ev.source, bow, at);
  });

  // ---- 離した。**ここで撃つ**
  world.afterEvents.itemReleaseUse.subscribe((ev) => {
    const bow = bowOf(ev.itemStack?.typeId);
    if (bow === undefined) return;
    const from = drawing.get(ev.source.id);
    drawing.delete(ev.source.id);
    const held = from === undefined ? 0 : Math.max(0, system.currentTick - from);
    // **属性は「その 1 本」に付いている**（種類ではない）
    shoot(ev.source, bow, held, elementsOf(ev.itemStack), enchantsOf(ev.itemStack));
  });

  // ---- 引ききって使い切った。**普通は来ない**（ためは 3600 秒まで持つ）が、
  //      来たときに撃たずに終わると、**引いたのに何も起きない**ことになる
  world.afterEvents.itemCompleteUse.subscribe((ev) => {
    const bow = bowOf(ev.itemStack?.typeId);
    if (bow === undefined) return;
    const from = drawing.get(ev.source.id);
    if (from === undefined) return;
    drawing.delete(ev.source.id);
    shoot(ev.source, bow, Math.max(0, system.currentTick - from), elementsOf(ev.itemStack), enchantsOf(ev.itemStack));
  });

  // ---- 中断した
  world.afterEvents.itemStopUse.subscribe((ev) => {
    if (bowOf(ev.itemStack?.typeId) === undefined) return;
    drawing.delete(ev.source.id);
  });
}

/**
 * 弓を配る。**試すためのもの**（`docs/spec/19-weapons.md`）。
 *
 * ```
 * /pve:bow            いま持てるぶんだけ配る（36 本まで）
 * /pve:bow stardust   その 1 本だけ
 * /pve:bow legendary  その段だけ
 * ```
 *
 * **48 本を一度に配ると持ち物からあふれる**ので、絞れるようにしてある。
 */
function giveCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:bow",
      description: "弓を配る（試用）",
      permissionLevel: CommandPermissionLevel.Any,
      optionalParameters: [{ name: "どれ", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, which?: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e as Player;
      const word = (which ?? "").toLowerCase();
      system.run(() => {
        const c = player.getComponent("minecraft:inventory")?.container;
        if (c === undefined) return;

        const want = BOWS.filter((b) => {
          if (word.length === 0) return true;
          if (b.rarity === word) return true;
          return b.item === `pve:bow_${word}`;
        });
        if (want.length === 0) {
          player.sendMessage(`§c見つからない: §f${word}`);
          return;
        }

        let n = 0;
        for (const b of want) {
          if (n >= 36) break; // **持ち物からあふれさせない**
          try {
            const stack = new ItemStack(b.item, 1);
            // **配るときに名前と説明欄を焼き付ける**（`docs/spec/18-item-view.md` 4 章）
            refreshItem(stack);
            c.addItem(stack);
            n++;
          } catch {
            /* 入らなかった */
          }
        }
        player.sendMessage(`§7弓を ${n} 本配った§8（全 ${BOWS.length} 本）`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

/**
 * ③ 速射弓：**引いている間、勝手に撃つ。**
 *
 * ためが無い代わりに、**0.05 秒ごとに 1 発**（1 発は 1/10）。
 * **離すまで続く**——離したときの 1 発は、ふつうに撃たれる。
 */
function autoFire(now: number): void {
  if (drawing.size === 0) return;
  for (const [id, from] of drawing) {
    const player = playerById(id);
    if (player === undefined) {
      drawing.delete(id);
      continue;
    }
    let stack: ItemStack | undefined;
    try {
      stack = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
    } catch {
      continue;
    }
    const b = bowOf(stack?.typeId);
    if (b === undefined) continue;
    const every = abilityOf(b.ability).autoEvery;
    if (every === undefined) continue;
    if ((now - from) % Math.max(1, every) !== 0) continue;
    // **ためは乗らない**（押していた長さを 0 として撃つ）
    shoot(player, b, 0, elementsOf(stack), enchantsOf(stack));
  }
}

export const bow: Feature = {
  name: "bow",
  subscribe,
  commands: [giveCommand, enchantCommand],
  tick: { every: 1, run: autoFire },
};
