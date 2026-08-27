/**
 * 落ちた支給品は消す。
 *
 * 仕様は `docs/spec/16-participation.md` 2-4。
 *
 * ## なぜ鍵を使わないのか
 *
 * `ItemLockMode` を付けると、**持ち替えるたびに但し書きが出る。**
 *
 * ```
 *   Swift Sword [Mk-1]
 *   ✦ ドロップできないアイテム: ドロップ、削除、クラフトでの使用
 *   このアイテムは死亡してもなくなりません
 * ```
 *
 * **ワイヤーのガス表示と同じ場所に重なる。**
 * 言語ファイルでは行ごと消せなかった（空にすると既定の文に戻る）。
 *
 * ## 拾い直さない。消す
 *
 * **捨てる前には止められない**（打ち消せるドロップのイベントが無い）。
 *
 * 拾い直して返す形も試したが、やめた。
 *
 * > **落ちている支給品には、誰にとっても意味が無い。**
 * > 全員が最初から 1 本持っているので、**拾う理由が無い。**
 * > 倒した相手のものを拾えると、**同じ物が場に増えるだけ。**
 *
 * **床にあるものは消す。** それだけ。
 *
 * ## 無くした人には配り直される
 *
 * ロビーでは 5 秒ごとに配り直す（`features/lobby`）。
 * 試合中は**復活したときに配られる**（`features/loadout`）。
 *
 * **捨てた人は、その試合の間は手ぶら。** 捨てた本人の判断として扱う。
 */

import { Player, system, world, type Entity } from "@minecraft/server";

/**
 * 床に落ちていたら消すもの。
 *
 * **配られたものだけ。** 買ったものは落ちるし、拾える。
 */
const ERASE: ReadonlySet<string> = new Set([
  // 支給品（`features/loadout`）
  "game:sword_wood",
  // 参加 / 非参加の札（`features/lobby/join`）
  "game:join_yes",
  "game:join_no",
  // 退役した支給品
  "game:grapple",
]);

/** 拾い残しを消す間隔（tick）。**1 秒** */
const SWEEP = 20;

/** 落ちている物の実体 */
const ITEM_ENTITY = "minecraft:item";

/** その落ちている物の中身 */
function stackOf(item: Entity): string | undefined {
  try {
    return item.getComponent("minecraft:item")?.itemStack.typeId;
  } catch {
    return undefined;
  }
}

/** 消す */
function erase(item: Entity): void {
  try {
    item.remove();
  } catch {
    /* 既に消えている */
  }
}

/**
 * 受け取りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function registerNoDrop(): void {
  // ---- **湧いた瞬間に消す**（2026-08-26 変更）
  //
  // **落ちている物も「実体が湧く」ことに変わりない。**
  // 捨てられようが、倒れて落ちようが、**必ずここを通る。**
  //
  // 以前は `entityItemDrop`（捨てた通知）だけを見ていたが、
  // **プレイヤーが手で捨てた分では飛んでこない。**
  // 見張りの拾い残し（最大 1 秒）でしか消えていなかった
  world.afterEvents.entitySpawn.subscribe((ev) => {
    const item = ev.entity;
    try {
      if (item.typeId !== ITEM_ENTITY) return;
    } catch {
      return;
    }
    const id = stackOf(item);
    if (id === undefined || !ERASE.has(id)) return;
    // **その場では消せない。** after の中は消してよいが、
    // 湧いた直後は中身が揃っていないことがあるので次の tick に回す
    system.run(() => erase(item));
  });

  // ---- **捨てた通知も残す。** 飛ぶ経路があるなら、それも拾う
  world.afterEvents.entityItemDrop.subscribe((ev) => {
    if (!(ev.entity instanceof Player)) return;
    for (const item of ev.items) {
      const id = stackOf(item);
      if (id === undefined || !ERASE.has(id)) continue;
      system.run(() => erase(item));
    }
  });
}

/**
 * 見張りを始める。**取りこぼしの保険。**
 *
 * 上のイベントが飛ばない落ち方——**倒れたときにバニラが落とした分**など——
 * があっても、**1 秒以内に消える。**
 *
 * **トップレベルから呼ぶこと。**
 */
export function startNoDrop(): void {
  system.runInterval(() => {
    let items: Entity[];
    try {
      items = world.getDimension("overworld").getEntities({ type: ITEM_ENTITY });
    } catch {
      return;
    }
    for (const item of items) {
      const id = stackOf(item);
      if (id !== undefined && ERASE.has(id)) erase(item);
    }
  }, SWEEP);
}
