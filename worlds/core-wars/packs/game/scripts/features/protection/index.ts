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

import { system, world, PlayerPermissionLevel, type Block, type Player, type Vector3 } from "@minecraft/server";

import { isMapBlock } from "../../lib/protection.js";
import { LOBBY_BOUNDS } from "../../lib/lobby.js";
import { ARENAS, coreAt, inBox } from "../../lib/arena.js";
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
 * - **`/reload` をまたぐ**（2026-08-25 変更）
 *
 * ## なぜ残すようにしたか
 *
 * 以前はメモリだけに置き、「消えても安全側に倒れる」としていた。
 * だが**直している最中に `/reload` を打つのが普通**で、
 * そのたびに**黙って守られる側に戻っていた。**
 *
 * **気づけない。** 壊せなくなった理由が分からないまま探すことになる。
 * 安全側かどうかより、**言わずに変わることのほうが害が大きい**
 *（`docs/spec/09-state-management.md` 4 章）。
 */
const editors = new Set<string>();

/** 編集できる印。**`/reload` で消えない** */
const KEY_EDITOR = "cw:editor";

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
  try {
    player.setDynamicProperty(KEY_EDITOR, on ? true : undefined);
  } catch {
    /* 消えている。メモリの側は切り替わっている */
  }
  return { allowed: true, on };
}

/**
 * そのブロックは守るべきか。**人によらない判断。**
 *
 * ## 場所と種類の両方で決める
 *
 * 種類だけで決めていたので、
 * **羊毛や黒曜石で作られた部分は壊せた**（買える建材は守らない一覧に入っている）。
 *
 * ロビーは試合の場ではない。**置くのも壊すのも運営だけ。**
 * 場所で決めるほうが、材料を選ばずに済む。
 *
 * **掘るのも爆発も、ここを通す。** 別々に書くと必ず食い違う。
 */
export function isProtectedAt(typeId: string, at: Vector3): boolean {
  if (inBox(LOBBY_BOUNDS, at)) return true;
  return isMapBlock(typeId);
}

/** そのブロックを、このプレイヤーから守るべきか */
function shouldProtect(player: Player, block: Block): boolean {
  // **編集中の人だけが素通りする。** 権限だけでは素通りしない
  if (editors.has(player.id)) return false;
  return isProtectedAt(block.typeId, block.location);
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
/**
 * 壊させない飾り。
 *
 * 仕様は `docs/spec/10-block-protection.md` 5 章。
 *
 * **ブロックではなく実体**なので、ブロックの保護が届かない。
 */
const DECOR: ReadonlySet<string> = new Set(["minecraft:painting"]);

/**
 * 合成鋼（青 = 未加工の鉄 / 赤 = 未加工の銅）。
 *
 * **バニラのブロックをテクスチャだけ差し替えたもの**なので、
 * ブロック定義に爆発耐性を書けない。**script で対象から抜く。**
 */
const TOUGH: ReadonlySet<string> = new Set([
  "minecraft:raw_iron_block",
  "minecraft:raw_copper_block",
  // **黒曜石も同じ扱い。** バニラの耐性でも耐えるが、**書いておく**
  //（`features/special/firecharge` と顔ぶれをそろえる）
  "minecraft:obsidian",
  "minecraft:crying_obsidian",
]);

/**
 * コアの真上に張った、爆発を通さない箱。
 *
 * | | |
 * | --- | --- |
 * | 横 | コアから **10 マス** |
 * | 下端 | コアの **5 マス上**（屋内はここより下） |
 * | 上端 | **青天井** |
 *
 * **屋内で使うぶんには普通に爆ぜる。**
 * 止めたいのは**屋根の上から掘り抜くこと**だけ。
 */
const CORE_SHIELD = { radius: 10, above: 5 } as const;

/** そこはコアの真上か。**爆発の中心で見る** */
function overCore(at: Vector3 | undefined): boolean {
  if (at === undefined) return false;
  for (const arena of ARENAS) {
    for (const team of ["red", "blue"] as const) {
      const c = arena.cores[team];
      if (at.y < c.y + CORE_SHIELD.above) continue;
      if (Math.abs(at.x - c.x) > CORE_SHIELD.radius) continue;
      if (Math.abs(at.z - c.z) > CORE_SHIELD.radius) continue;
      return true;
    }
  }
  return false;
}

export function registerProtection(): void {
  // ---- **`/reload` で消えた分を拾い直す**（2026-08-25 追加）
  //
  // `/reload` はここを通り直すので、**そのときに印から戻せる。**
  // 抜けた人の id は消さない——同じ世界に戻れば同じ id なので、そのまま効く
  system.run(() => {
    for (const player of world.getAllPlayers()) {
      try {
        if (player.getDynamicProperty(KEY_EDITOR) === true) editors.add(player.id);
      } catch {
        /* 消えている */
      }
    }
  });

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
    // ---- **コアの真上では、そもそも爆発しない**（2026-08-26 追加）
    //
    // 仕様は `docs/03-content.md` 1-4。
    //
    // **屋根の上から爆破で穴を開け、コアを直接殴れてしまう。**
    // 拠点を崩す道は残したいが、**上から一直線に開けられるのは別の話。**
    //
    // **屋内はそのまま。** 中で使うぶんには普通に爆ぜる
    let center: Vector3 | undefined;
    try {
      center = ev.source?.location;
    } catch {
      center = undefined;
    }
    if (overCore(center)) {
      ev.cancel = true;
      return;
    }

    const impacted = ev.getImpactedBlocks();
    // **掘るときと同じ規則を通す。** 別々に書くと必ず食い違う。
    //
    // ---- **コアは爆発では消えない**（2026-08-25 追加）
    //
    // コアは守るブロックではない（壊すことが目的）ので、
    // そのままだと**爆発で消し飛ぶ。**
    // それでは削った回数が数えられず、**勝敗が決まらないまま盤面から消える。**
    //
    // **削るのは殴ったときだけ**（`docs/spec/11-match.md`）
    //
    // ---- **合成鋼と黒曜石は爆発では壊れない**（2026-08-26 追加）
    //
    // 仕様は `docs/03-content.md` 1-5。
    // **一番硬い建材**として売っているのに、TNT 1 つで穴が開いていた。
    //
    // 掘る速さは変えない。**ツルハシで削るぶんには今までどおり**
    const kept = impacted.filter(
      (b) =>
        !isProtectedAt(b.typeId, b.location) &&
        coreAt(b.location.x, b.location.y, b.location.z) === undefined &&
        !TOUGH.has(b.typeId)
    );
    if (kept.length !== impacted.length) ev.setImpactedBlocks(kept);
  });

  // ---- **絵画を壊せない**（docs/spec/10-block-protection.md 5 章）
  //
  // 絵画は**ブロックではなく実体**なので、ブロックの保護をすり抜ける。
  // 殴れば消えるし、爆風でも飛ぶ。
  //
  // **マップの一部として扱う。** 傷つけようとしたら、そこで止める
  world.beforeEvents.entityHurt.subscribe((ev) => {
    if (!DECOR.has(ev.hurtEntity.typeId)) return;
    ev.cancel = true;
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
