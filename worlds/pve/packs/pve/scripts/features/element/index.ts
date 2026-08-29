/**
 * 属性。
 *
 * 仕様は `docs/spec/17-element.md`。
 *
 * ## ここがやること
 *
 * | | |
 * | --- | --- |
 * | 当たったとき | **武器に付いている属性を、順に効かせる** |
 * | 毎周期 | **蓄積を落とす**・**燃えている分を削る** |
 * | コマンド | **手持ちに属性を付ける**（試験用） |
 *
 * **ダメージの通り道には触らない**（`docs/spec/10-damage.md` 4-1）。
 * `onElementHit` は**基礎と追加**で呼ばれ、**属性ダメージからは呼ばれない。**
 */

import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Entity,
} from "@minecraft/server";

import type { Feature } from "../../types.js";
import { ELEMENTS, ELEMENT_INFO, isElement, sortElements, type Element } from "../../lib/element.js";
import { decayGauge, eachGauge } from "../../state/gauge.js";
import { elementsOf, setElements } from "../../state/item-element.js";
import { has } from "../../state/hp.js";
import { hit, onElementHit } from "../damage/index.js";
import { refreshItem } from "../item/view.js";
import { burningEntities, dueBurns } from "./burn.js";
import { applyElement, markElement, markState } from "./effects.js";
import { resistOf } from "./resist.js";

/** 何 tick ごとに蓄積を落とすか */
const DECAY_STEP = 4;

/**
 * 何 tick ごとに炎を出すか。
 *
 * **2 tick（0.1 秒）。** 削るのは 1 秒おきだが、**絵は続いていないと燃えて見えない。**
 */
const FIRE_STEP = 2;

/**
 * 何 tick ごとに「溜まっている印」を出すか。
 *
 * **8 tick（0.4 秒）。** 毎回出すと**粒が濃すぎて相手が見えない。**
 */
const STATE_STEP = 8;

/**
 * 1 秒に落ちる割合（**耐性に対して**）。
 *
 * **5%**（`docs/spec/17-element.md` 2-4）。耐性 50 なら**毎秒 2.5**。
 * **満タンから空まで 20 秒**——**そう簡単には冷めない。**
 */
const DECAY_PER_SECOND = 0.05;

/** 見る距離（マス）。**遠くの分まで回さない** */
const RANGE = 80;

function subscribe(): void {
  // ---- 当たった。**武器に付いている属性を順に効かせる**
  onElementHit((info) => {
    const list = info.elements;
    if (list === undefined || list.length === 0) return;
    const now = system.currentTick;
    for (const e of sortElements(list)) {
      try {
        applyElement(info, e, now);
      } catch (err) {
        console.warn(`[element] ${e}: ${String(err)}`);
      }
    }
  });
}

/** 近くの、HP を持っているもの */
function targets(): Entity[] {
  const seen = new Set<string>();
  const out: Entity[] = [];
  for (const p of world.getAllPlayers()) {
    try {
      for (const e of p.dimension.getEntities({ location: p.location, maxDistance: RANGE })) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (!has(e)) continue;
        out.push(e);
      }
    } catch {
      /* 消えている */
    }
  }
  return out;
}

/**
 * 毎周期。
 *
 * | いつ | 何を |
 * | --- | --- |
 * | **毎 tick** | **燃えている蓄積を焼く**（1 秒おきに来る） |
 * | 4 tick ごと | **蓄積を落とす**（3 秒で 0 へ） |
 *
 * **焼くのは覚えている一覧を回すだけ**なので毎 tick でも軽い。
 * **落とすのは近くの実体を見に行く**ので、間引く。
 */
function tick(now: number): void {
  // ---- 炎（`features/element/burn.ts`）
  for (const b of dueBurns(now)) {
    try {
      // **燃えた分も 1 本道を通る**（`docs/spec/10-damage.md` 4 章）
      hit({ target: b.entity, attack: b.bite, via: "pve:element_fire", kind: "element", element: "fire" });
    } catch {
      /* もう居ない */
    }
  }

  // ---- 燃えている間は、絵を続ける（削るのとは別の間隔）
  if (now % FIRE_STEP === 0) {
    for (const e of burningEntities()) markElement(e, "fire");
  }

  if (now % DECAY_STEP !== 0) return;

  // ---- 蓄積を落とす／溜まっている印を出す
  const showState = now % STATE_STEP === 0;
  const shown = new Set<string>();
  for (const e of targets()) {
    try {
      shown.clear();
      // **溜まっている入れ物だけ回る**（武器 × 属性）
      eachGauge(e, (weapon, element, _value) => {
        if (!isElement(element)) return;
        // **落ちる速さは耐性に対する割合**——耐性が高いほど、減る量も大きい
        decayGauge(e, weapon, element, resistOf(e, element) * DECAY_PER_SECOND * (DECAY_STEP / 20));
        // **溜まっている間ずっと見える**（`docs/spec/17-element.md` 5-5）。
        // **同じ属性は 1 回だけ**（武器ぶん重ねない）
        if (showState && !shown.has(element)) {
          shown.add(element);
          markState(e, element);
        }
      });
    } catch {
      /* 消えている */
    }
  }
}

/** 手に持っているもの */
function held(player: Player) {
  const c = player.getComponent("minecraft:inventory")?.container;
  return { container: c, slot: player.selectedSlotIndex, item: c?.getItem(player.selectedSlotIndex) };
}

/**
 * 手持ちに属性を付ける。**試験用**（`docs/spec/17-element.md` 6 章）。
 *
 * ```
 * /pve:element water   付ける（もう付いていれば外す）
 * /pve:element all     5 つ全部
 * /pve:element clear   全部外す
 * ```
 */
function elementCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "pve:element",
      description: "手に持っている武器に属性を付ける（試用）",
      permissionLevel: CommandPermissionLevel.Any,
      mandatoryParameters: [{ name: "属性", type: CustomCommandParamType.String }],
    },
    (origin: CustomCommandOrigin, what: string): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (!(e instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e;
      const word = what.toLowerCase();
      if (word !== "all" && word !== "clear" && !isElement(word)) {
        return {
          status: CustomCommandStatus.Failure,
          message: `water / thunder / fire / wind / ice / all / clear のどれか`,
        };
      }

      system.run(() => {
        const { container, slot, item } = held(player);
        if (container === undefined || item === undefined) {
          player.sendMessage("§c手に何も持っていない");
          return;
        }

        const now = elementsOf(item);
        let next: Element[];
        if (word === "clear") next = [];
        else if (word === "all") next = [...ELEMENTS];
        // **もう付いていれば外す。** 付け外しが 1 つのコマンドで済む
        else if (now.includes(word)) next = now.filter((x) => x !== word);
        else next = sortElements([...now, word]);

        setElements(item, next);
        // **名前と説明欄は 1 か所で作る**（`docs/spec/18-item-view.md` 4 章）
        refreshItem(item);
        container.setItem(slot, item);

        const shown = next.length === 0 ? "なし" : next.map((x) => ELEMENT_INFO[x].label).join("・");
        player.sendMessage(`§7属性: §f${shown}`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

export const element: Feature = {
  name: "element",
  subscribe,
  commands: [elementCommand],
  // **毎 tick。** 中で間引く（炎は 1 秒おき、蓄積落としは 4 tick ごと）
  tick: { every: 1, run: tick },
};
