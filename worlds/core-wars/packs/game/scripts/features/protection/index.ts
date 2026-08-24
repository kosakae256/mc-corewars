/**
 * マップのブロックを守る。
 *
 * 仕様は `docs/spec/10-block-protection.md`。
 * 判定そのものは `lib/protection.ts`（純粋関数・種類だけを見る）。
 * **ここはイベントを受けて判定を呼ぶだけの薄い層**（`docs/imp.md` P-5）。
 *
 * ## 壊れ方は全部で何通りあるか
 *
 * | 壊し方 | 塞ぎ方 |
 * | --- | --- |
 * | プレイヤーが掘る | `playerBreakBlock` を `cancel` |
 * | 爆発 | `explosion` の対象から外す |
 * | ピストン | **独自ブロック**: `movable: immovable` |
 * | 炎 | **独自ブロック**: `flammable: false` / **飾り**: `fireguard.ts` が**焼けた後に戻す** |
 * | 液体 | **独自ブロック**: `liquid_detection: blocking` / **飾り**: 流し込みを止める |
 * | 湧いた敵の爆発 | `explosion` の対象から外す（爆発と同じ経路） |
 *
 * **ピストン・炎・液体の「広がり」には before イベントが無い。**
 * だが**火を点ける瞬間・溶岩を置く瞬間**にはある。
 * そこを止めれば、ゲームルールを潰さずに守れる。
 *
 * > `doFireTick` も `mobGriefing` も **true のままでよい。**
 * > 爆発は対象から除外され、焼けたマップは後から戻る。
 * > **炎の挙動そのものには一切手を触れていない。**
 *
 * ## 実行文脈に注意
 *
 * `beforeEvents` は **restricted execution**（`docs/imp.md` 5.1）。
 * world の状態を変更できない。
 *
 * - `ev.cancel = true` はイベント自身の操作なので**可**
 * - プレイヤーへの通知は**不可**。`system.run()` で次の tick に逃がす
 */

import { system, world, PlayerPermissionLevel, type Block, type Player } from "@minecraft/server";

import { isMapBlock } from "../../lib/protection.js";
import { watchFireAt } from "./fireguard.js";

/**
 * **既定は「全員守る」。オペレーターも壊せない**（2026-08-24 変更）。
 *
 * ## なぜ既定を逆にしたか
 *
 * 以前は「オペレーターは何でも壊せる」にしていた。
 * 制作中にマップを直せなくなると困る、という理由だった。
 *
 * だが**作り手は遊ぶ側でもある。**
 * 自分が試合に出たとき、自分だけマップを壊せてしまう。
 * 実際に「サバイバルで普通に壊れる」と報告を受けた。
 *
 * **守られていないことに気づけない**のが一番まずい。
 * だから**既定を安全な側に倒し、直したいときだけ明示的に外す。**
 *
 * ## 外し方
 *
 * `/game:build` で**自分だけ**編集できるようになる。もう一度打つと戻る。
 *
 * - **人ごとに持つ。** 誰かが編集中でも、他の人の保護は効いたまま
 * - **メモリに置く。** `/reload` で全員が守られる側に戻る。
 *   消えても安全側に倒れるので、これでよい（`docs/spec/11-match.md` 6-B / R-3）
 */
const editors = new Set<string>();

/** 編集できる状態か */
export function isEditor(playerId: string): boolean {
  return editors.has(playerId);
}

/**
 * 編集の可否を切り替える。
 *
 * **オペレーターだけが入れる。** 一般プレイヤーが入れたら保護の意味が無い。
 */
export function toggleEditor(player: Player): { allowed: boolean; on: boolean } {
  if (player.playerPermissionLevel !== PlayerPermissionLevel.Operator) {
    return { allowed: false, on: false };
  }
  const on = !editors.has(player.id);
  if (on) editors.add(player.id);
  else editors.delete(player.id);
  return { allowed: true, on };
}

/** そのブロックを、このプレイヤーから守るべきか */
function shouldProtect(player: Player, block: Block): boolean {
  // **編集中の人だけが素通りする。** 権限だけでは素通りしない
  if (editors.has(player.id)) return false;
  return isMapBlock(block.typeId);
}

/**
 * **見張りを始める道具。**
 *
 * これらを使うと火が点きうる。**点くこと自体は止めない。**
 * 火は普通に燃えてよく、延焼してよい。
 *
 * 困るのは**マップの柵や階段が永久に失われること**だけなので、
 * `fireguard.ts` が**火が収まってから記憶で戻す**。
 *
 * ここでやるのは「そろそろ火が点くぞ」と見張りに教えることだけ。
 */
const IGNITERS: ReadonlySet<string> = new Set([
  "minecraft:flint_and_steel",
  "minecraft:fire_charge",
  "minecraft:lava_bucket",
]);

/**
 * **壊せなかったことは知らせない**（2026-08-24 変更）。
 *
 * 以前はアクションバーに「マップのブロックは壊せません」と出していた。
 * だが**壊せないブロックはずっと壊せない。** 一度分かれば十分で、
 * 殴るたびに出ると邪魔になるだけ。
 *
 * > 知らせるべきなのは**予想と違うとき**であって、
 * > **いつもどおりのとき**ではない。
 */

/**
 * 購読を始める。
 *
 * **`worldLoad` から呼ぶこと。** トップレベルで呼ぶと early execution になる。
 */
export function registerProtection(): void {
  // ---- 手で掘る
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (!shouldProtect(ev.player, ev.block)) return;
    ev.cancel = true;
  });

  // ---- 爆発
  //
  // **爆発そのものは打ち消さない。**
  // 消すとノックバックまで消え、奈落へ突き落とす戦術が変わってしまう
  //（docs/02-map.md 2-A-2）。**守るブロックだけを対象から抜く。**
  world.beforeEvents.explosion.subscribe((ev) => {
    const impacted = ev.getImpactedBlocks();
    const kept = impacted.filter((b) => !isMapBlock(b.typeId));
    if (kept.length !== impacted.length) ev.setImpactedBlocks(kept);
  });

  // ---- 火を点ける・溶岩を流す
  //
  // **ゲームルールを潰さずに、着火の瞬間だけを止める。**
  // 木の柵・木の階段・葉はバニラのままなので燃えてしまうが、
  // 火が点かなければ燃えようがない
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const item = ev.itemStack;
    if (item === undefined || !IGNITERS.has(item.typeId)) return;
    // **止めない。火は普通に点いてよい。**
    // 見張りを始めるだけ。これが唯一の起点なので、
    // 誰も火を点けなければ見張りは一切動かない
    const at = ev.block.location;
    system.run(() => watchFireAt(at));
  });
}
