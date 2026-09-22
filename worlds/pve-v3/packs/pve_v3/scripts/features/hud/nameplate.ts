/**
 * 敵以外の名札。味方プレイヤーも名前・HPゲージ・HP数値の3行に揃える。
 *
 * 仕様は `docs/spec/39-player-hp-hud.md` と `docs/spec/10-implementation.md` 8章。
 *
 * ```
 * グラント
 * §a|||||||§0|||||||   ← HP バー
 * §7HP §f120§7/200     ← HP の数値
 * ```
 *
 * **属性の蓄積率は出さない**（2026-08-29 決定）——
 * **名前と残りだけで足りる。** 出すと**塊が縦に伸びて、隣のモブと混ざる。**
 *
 * ## なぜ全部ここに積むのか
 *
 * **モブが重なると、誰の数字か分からない**（`docs/spec/12-hud.md` 1-1）。
 * **離して浮かべると、もっと分からない。**
 * **同じ名札に積めば、取り違えようがない。**
 *
 * ## 敵はここではない（2026-09-08 変更）

> ### **`nameTag` は「その人にだけ」が作れない**
>
> **実体が 1 つ持つ文字列で、見る人ごとに変えられない。**

**敵は `features/hud/foeplate.ts` の `DebugText` に移した**（`10-implementation.md` 8-1）。
**ここに残るのは、全員に見えてよいものだけ**——**数が少なく、絞る理由が無い。**

## 同じなら書き直さない
 *
 * **控えと比べる。** `entity.nameTag` を**読み返して比べない**——
 * 読み返した値が書いた値と同じ保証が無く、**毎回書き直し＝ちらつき**になる。
 */

import { Player, world, type Entity } from "@minecraft/server";

import { bar, hpNumber } from "../../core/bar.js";
import { plateText } from "../../core/plate.js";
import { ENEMY_FAMILY } from "../../services/field.js";
import { current, has, max } from "../../state/hp.js";
import { labelOf } from "../../state/label.js";

/** 出す距離（マス）。**遠くの分まで組み立てない** */
const RANGE = 64;

/** 最後に書いた中身。**メモリだけ。** `/reload` で消えてよい */
const written = new Map<string, string>();

/**
 * **敵の名札を消した控え。**
 *
 * **敵は `DebugText` に移った**ので、**前に書いた名札が残っていると二重に見える。**
 * **1 度だけ空にする**——毎 tick 書くと、それ自体が重い。
 */
const cleared = new Set<string>();

/** 名札の中身 */
function plate(entity: Entity): string | undefined {
  const now = current(entity);
  const cap = max(entity);
  if (now === undefined || cap === undefined) return undefined;
  return plateText({
    name: `§f${entity instanceof Player ? entity.name : (labelOf(entity) ?? "？")}`,
    bar: bar(now, cap),
    hp: `§7HP ${hpNumber(now, cap)}`,
  });
}

/** それは敵か。**敵は頭上表示のほう**（`foeplate.ts`） */
function isFoe(entity: Entity): boolean {
  try {
    return entity.matches({ families: [ENEMY_FAMILY] });
  } catch {
    return false;
  }
}

/**
 * 近くの、**敵以外**の実体。
 *
 * **一覧を持たない。** HP を持っている実体が、そのまま対象になる。
 */
function nearby(): Entity[] {
  const seen = new Set<string>();
  const out: Entity[] = [];
  for (const p of world.getAllPlayers()) {
    // getEntities側ではプレイヤーを除外しているため、本人の名札をここで1回だけ更新する。
    if (has(p)) out.push(p);
    try {
      for (const e of p.dimension.getEntities({ location: p.location, maxDistance: RANGE })) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (e.id === p.id) continue;
        if (e.typeId === "minecraft:player") continue;
        if (!has(e)) continue;
        if (isFoe(e)) {
          // **前に書いた名札を、1 度だけ空にする**
          if (!cleared.has(e.id)) {
            cleared.add(e.id);
            try {
              e.nameTag = "";
            } catch {
              /* 消えている */
            }
          }
          continue;
        }
        out.push(e);
      }
    } catch {
      /* 消えている */
    }
  }
  return out;
}

/** 名札を合わせる。**変わったものだけ書き直す** */
export function updateNameplates(): void {
  const seen = new Set<string>();
  for (const e of nearby()) {
    try {
      const text = plate(e);
      if (text === undefined) continue;
      seen.add(e.id);
      if (written.get(e.id) === text) continue;
      e.nameTag = text;
      written.set(e.id, text);
    } catch {
      /* 消えている */
    }
  }
  // ---- 居なくなった分の控えを捨てる。**残すと際限なく増える**
  if (written.size > seen.size) {
    for (const id of [...written.keys()]) if (!seen.has(id)) written.delete(id);
  }
  // **消した控えも、際限なく増えないように切る**
  if (cleared.size > 512) cleared.clear();
}
