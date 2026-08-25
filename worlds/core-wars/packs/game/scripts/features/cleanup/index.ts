/**
 * 後片付け。
 *
 * 仕様は `docs/spec/11-match.md` 4章。
 *
 * 1. **試合中に置かれたブロックを消す**
 * 2. **チェストの中身を空にする**
 * 3. 持ち物を配り直す（`loadout` が行う）
 *
 * ## なぜ「置かれた位置」を覚えるのか
 *
 * 種類での一括削除（例: 羊毛を全部消す）にすると、
 * **マップに同じ種類が使われた瞬間に破綻する。**
 *
 * 覚えた位置しか触らなければ、**マップを削る事故が起こりえない。**
 *
 * ## 記録はメモリに置く
 *
 * 数万マスになりうるので、動的プロパティには入らない。
 * `/reload` で消えるが、そのときは**後片付けが不完全になるだけ**で、
 * 試合そのものは壊れない。
 */

import { system, world, type Dimension, type Vector3 } from "@minecraft/server";

import { isRunning } from "../../lib/match-state.js";
import { isMapBlock } from "../../lib/protection.js";
import { isPlaceable } from "../../lib/placeable.js";
import { coreAt } from "../../lib/arena.js";

/** 試合中に置かれたブロックの位置 */
const placed = new Map<string, Vector3>();

/** 1 tick あたりに触るマス数（watchdog 対策。docs/imp.md 5.3） */
const PER_TICK = 2048;

/**
 * 掃き取る高さの下限。
 *
 * **戦闘範囲の下限（−60）まで見る必要が無い。**
 * 島の底は −14 で、その下は奈落しかない。
 *
 * 4,710,951 マスを 1 マスずつ見ていたので、
 * **終わるまで 7 分以上かかっていた**（2026-08-25 の「掃除されない」）。
 * 終わる前に次の操作をすれば、当然残る。
 */
const SWEEP_MIN_Y = -20;

/** 中身を空にする対象 */
const CONTAINERS: ReadonlySet<string> = new Set([
  "minecraft:chest",
  "minecraft:trapped_chest",
  "minecraft:barrel",
  // **エンダーチェストは入れない。**
  // 中身はブロックではなくプレイヤーに紐づくので、
  // ここを空にしても何も起きない。`loadout.resetInventory` が消す
]);

const key = (v: Vector3): string => `${v.x},${v.y},${v.z}`;

/** いま何マス覚えているか */
/**
 * いま片付けが動いているか。
 *
 * **動いている間は試合を始めさせない**（`docs/spec/11-match.md` 7-5）。
 * 途中で始めると、始めたあとに片付けが走って
 * **新しい試合の物を消す。**
 */
let busy = false;

export function cleanupBusy(): boolean {
  return busy;
}

/** 片付けの開始と終了を挟む。**呼ぶ側が忘れないよう関数で包む** */
export function markCleanup(on: boolean): void {
  busy = on;
}

export function placedCount(): number {
  return placed.size;
}

/** 記録を捨てる。**消さずに忘れるだけ** */
export function forgetPlaced(): void {
  placed.clear();
}

/**
 * 置かれたブロックを消す。
 *
 * **覚えた位置だけ。** マップには触らない。
 */
export function* clearPlacedJob(dim: Dimension, out: { removed: number }): Generator<void, void, void> {
  let seen = 0;
  for (const [k, at] of [...placed]) {
    placed.delete(k);
    if (++seen % PER_TICK === 0) yield;
    try {
      const b = dim.getBlock(at);
      // **空なら何もしない。** 既に壊されている
      if (b === undefined || b.isAir) continue;
      b.setType("minecraft:air");
      out.removed++;
    } catch {
      /* 読み込まれていない。捨てる */
    }
  }
}

/**
 * 範囲内のチェストを空にする。
 *
 * **エンダーチェストは対象外。**
 * 中身はブロックではなくプレイヤーに紐づくので、ここでは消せない。
 * `loadout.resetInventory` が `minecraft:ender_inventory` から消す。
 */
export function* clearContainersJob(
  dim: Dimension,
  min: Vector3,
  max: Vector3,
  out: { emptied: number; scanned?: number; unreadable?: number }
): Generator<void, void, void> {
  let seen = 0;
  // **下は見ない。** 島の底より下は奈落しかない（SWEEP_MIN_Y の説明）
  const fromY = Math.max(Math.floor(min.y), SWEEP_MIN_Y);
  for (let x = Math.floor(min.x); x <= Math.floor(max.x); x++) {
    for (let y = fromY; y <= Math.floor(max.y); y++) {
      for (let z = Math.floor(min.z); z <= Math.floor(max.z); z++) {
        if (++seen % PER_TICK === 0) yield;
        if (out.scanned !== undefined) out.scanned++;
        try {
          const b = dim.getBlock({ x, y, z });
          if (b === undefined) {
            // **読めなかった。** 読み込まれていない場所は片付かない
            if (out.unreadable !== undefined) out.unreadable++;
            continue;
          }
          if (!CONTAINERS.has(b.typeId)) continue;
          const inv = b.getComponent("minecraft:inventory");
          const container = inv?.container;
          if (container === undefined) continue;
          container.clearAll();
          out.emptied++;
        } catch {
          if (out.unreadable !== undefined) out.unreadable++;
        }
      }
    }
  }
}

/**
 * **場内のエンティティを消す。**
 *
 * ## なぜ「消さないもの」を選ぶのか
 *
 * 消す対象を並べる形にすると、**新しく増えたものを消し忘れる。**
 * 今後スキルで何かを置くようになったら、そのたびに一覧へ足す必要があり、
 * **足し忘れても誰も気づかない。**
 *
 * だから逆にする。**残すものだけを並べ、それ以外は消す。**
 * 新しいものが増えても、黙って消える側に入る。
 *
 * > 保護の判定（`lib/protection.ts`）と同じ考え方。
 * > **失敗したときに安全な側へ倒れる向きを選ぶ。**
 *
 * ## 残すもの
 *
 * - **プレイヤー**（当然）
 * - **ショップの店員**（試合の道具であって、片付ける対象ではない）
 *
 * 落ちているアイテム、矢、置いた実体、湧いた敵、すべて消える。
 *
 * > 店員は消しても 2 秒で戻る（`features/shop/keeper.ts` が見張っている）。
 * > **消えて戻る点滅に意味が無い**ので、初めから触らない。
 */
const KEEP_ENTITIES: ReadonlySet<string> = new Set([
  "minecraft:player",
  "game:shopkeeper",
  // **絵画はマップの一部**（docs/spec/10-block-protection.md 5 章）。
  // 実体だが、置かれたものではない——消すと**掲示物が毎試合消える**
  "minecraft:painting",
]);

export function* clearEntitiesJob(
  dim: Dimension,
  min: Vector3,
  max: Vector3,
  out: { removed: number }
): Generator<void, void, void> {
  let all: { typeId: string; remove: () => void }[] = [];
  try {
    all = dim.getEntities({
      location: {
        x: (min.x + max.x) / 2,
        y: (min.y + max.y) / 2,
        z: (min.z + max.z) / 2,
      },
      // **箱の対角線の半分。** 範囲を確実に覆う
      maxDistance: Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2 + 2,
    });
  } catch {
    return;
  }

  let seen = 0;
  for (const e of all) {
    if (++seen % 64 === 0) yield;
    if (KEEP_ENTITIES.has(e.typeId)) continue;
    try {
      e.remove();
      out.removed++;
    } catch {
      /* 既に消えている */
    }
  }
}

/**
 * **記録が消えていても掃除できるように、種類でも掃き取る。**
 *
 * 位置の記録はメモリにしかないので `/reload` で消える。
 * そのままだと、置かれたブロックが盤面に残り続ける。
 *
 * ## なぜ種類で消しても安全なのか
 *
 * **ショップで売るものとマップの素材を重ねない**と決めてある
 *（`docs/spec/10-block-protection.md` 2-4）。
 *
 * マップの素材は「守るブロック」なので、
 * **守らないブロックだけを消せば、マップには当たらない。**
 *
 * コアだけは守らないブロックだが、**位置が決まっている**ので除外する。
 *
 * > **記録が正、掃き取りが保険。** 両方やって困らない。
 */
export function* sweepPlaceableJob(
  dim: Dimension,
  min: Vector3,
  max: Vector3,
  out: { removed: number; scanned?: number; unreadable?: number }
): Generator<void, void, void> {
  let seen = 0;
  for (let x = Math.floor(min.x); x <= Math.floor(max.x); x++) {
    for (let y = Math.floor(min.y); y <= Math.floor(max.y); y++) {
      for (let z = Math.floor(min.z); z <= Math.floor(max.z); z++) {
        if (++seen % PER_TICK === 0) yield;
        if (out.scanned !== undefined) out.scanned++;
        try {
          const b = dim.getBlock({ x, y, z });
          if (b === undefined) {
            if (out.unreadable !== undefined) out.unreadable++;
            continue;
          }
          if (b.isAir) continue;
          // ---- **置けるものだけ消す**（docs/spec/11-match.md 8章）
          //
          // 以前は「守らないブロック」を全部消していたため、
          // **運営が編集したマップのブロックまで消えていた。**
          //
          // 判断の向きを逆にする。
          // 「消してよいと分かっているもの」だけ消す
          if (!isPlaceable(b.typeId)) continue;
          // 念のため二重に見る。**守るブロックには触らない**
          if (isMapBlock(b.typeId)) continue;
          // コアは守らないブロックだが、位置が決まっている。消してはいけない
          if (coreAt(x, y, z) !== undefined) continue;
          b.setType("minecraft:air");
          out.removed++;
        } catch {
          if (out.unreadable !== undefined) out.unreadable++;
        }
      }
    }
  }
}

/**
 * 記録を始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない（実際に事故った）。
 */
export function registerCleanup(): void {
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    // **試合中だけ覚える。** 準備中の建築を消してしまわないように
    if (!isRunning()) return;
    const at = ev.block.location;
    placed.set(key(at), { x: at.x, y: at.y, z: at.z });
  });

  // 置いたものを壊したら、記録から外す。**消す対象を増やさない**
  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    if (!isRunning()) return;
    placed.delete(key(ev.block.location));
  });

  void system;
}
