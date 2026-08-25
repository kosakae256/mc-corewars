/**
 * ブロックを置けない場所。
 *
 * 仕様は `docs/spec/11-match.md` 6-G。
 *
 * ## 2 種類ある
 *
 * | どこ | なぜ |
 * | --- | --- |
 * | **拠点の中** | 埋めるとリスポーン地点やショップが塞がる |
 * | **ジェネレータの真上（3x3、上 4 マス）** | 埋めると湧いた資源が取れなくなる |
 *
 * ## 置かせない。消すのは保険
 *
 * 置いてから消すと、**置いた本人には一瞬置けたように見える。**
 * 手応えが嘘になる。だから**置く前に打ち消す**のを本筋にする。
 *
 * ただし `playerPlaceBlock` に `before` が無いので、
 * **「ブロックに向けて何かを使った瞬間」**を捕まえて計算する。
 * 計算が外れることがあるので、**後から消す保険**も置く。
 */

import { bar } from "../../lib/fx.js";
import { system, world, type Block, type Player } from "@minecraft/server";

import { ARENAS, coreAt, inBox } from "../../lib/arena.js";
import { blockedByGenerator, generatorBlocks } from "../generator/index.js";
import { isEditor } from "../protection/index.js";
import { isMapBlock } from "../../lib/protection.js";
import { LOBBY_BOUNDS } from "../../lib/lobby.js";
import { opMessage } from "../../lib/op.js";

/** 通知を絞る間隔（tick）。連打されるので */
const NOTIFY_TICKS = 20;

const lastNotified = new Map<string, number>();

function notify(player: Player, text: string): void {
  // **黙って止める印**（`SILENT`）。出す側で落とす
  if (text === SILENT) return;
  const now = system.currentTick;
  const last = lastNotified.get(player.id);
  if (last !== undefined && now - last < NOTIFY_TICKS) return;
  lastNotified.set(player.id, now);
  bar(player, text);
}

/**
 * **理由を出さずに止めるための印。**
 *
 * 空文字を返すと「置ける」と見分けが付かないので、
 * **中身のある文字列**にしておく。出す側がこれを見て黙る。
 */
export const SILENT = "cw:silent";

/**
 * **拠点でも置けるもの。**
 *
 * 仕様は `docs/spec/11-match.md` 6-G。
 *
 * TNT は**置いた瞬間に実体になる**（`features/special/tnt.ts`）ので、
 * **ブロックとして残らない。**
 * 「埋めて塞ぐ」という、拠点で禁じたい行為にならない。
 */
const BASE_ALLOWED: ReadonlySet<string> = new Set(["minecraft:tnt"]);

/** そのアイテムは拠点でも置けるか */
export function allowedInBase(typeId: string | undefined): boolean {
  return typeId !== undefined && BASE_ALLOWED.has(typeId);
}

/** 置けない場所か。置けないなら理由を返す */
export function whyCannotBuild(x: number, y: number, z: number): string | undefined {
  // ---- **ロビーには置けない**（2026-08-25 追加）
  //
  // ロビーは戦場の外にあり、後片付けの範囲にも入っていない。
  // **置かれたものが誰にも消されず、そのまま残り続ける。**
  //
  // 運営は編集モード（`/game:build`）で置ける
  //
  // **理由は出さない**（2026-08-25 変更）。
  // ロビーで置こうとする場面は多く、**そのたびに画面へ出るとうるさい。**
  // 置けないことは、置けない時点で伝わる
  if (inBox(LOBBY_BOUNDS, { x, y, z })) return SILENT;

  for (const arena of ARENAS) {
    for (const box of arena.noBuild) {
      if (inBox(box, { x, y, z })) return "§c拠点の中には置けません";
    }
  }
  if (blockedByGenerator(x, y, z)) return "§cジェネレータ付近はブロックを置けません";
  return undefined;
}

/**
 * **置かれてしまったものを消す。**
 *
 * ## なぜ要るのか
 *
 * 設置は `before` で打ち消しているが、**`/reload` の隙間では誰も見ていない。**
 * スクリプトが読み直されるまでの間に置かれると、そのまま残る。
 *
 * 実際に「リロードの隙に置けてしまう」と報告を受けた。
 *
 * **打ち消しは取りこぼす。だから後から消す。**
 *
 * ## マップは消さない
 *
 * ジェネレータの真上にマップの飾りがある可能性がある。
 * **守るブロックには触らない。** 消すのはプレイヤーが置けるものだけ。
 *
 * ## 費用
 *
 * 見るのは**ジェネレータ 1 つにつき 3x3x4 = 36 マス**だけ。
 * 12 個あっても 432 マス。2 秒に 1 回なら無視できる。
 */
const SWEEP_INTERVAL = 40;

function sweepGenerators(): void {
  const dim = world.getDimension("overworld");
  for (const b of generatorBlocks()) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 1; dy <= 4; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          try {
            const block = dim.getBlock({ x: b.x + dx, y: b.y + dy, z: b.z + dz });
            if (block === undefined || block.isAir) continue;
            // **マップのブロックには触らない。** 消してよいのは置かれたものだけ
            if (isMapBlock(block.typeId)) continue;
            block.setType("minecraft:air");
          } catch {
            /* 読み込まれていない */
          }
        }
      }
    }
  }
}

/**
 * **拠点の中に置かれてしまったものを消す。**
 *
 * ジェネレータと同じ理由（`/reload` の隙間で置かれる）。
 * **そもそも設置できない範囲**なので、あるものは全部おかしい。
 *
 * ## 範囲が広いので、ゆっくり見る
 *
 * 拠点 1 つで 30x15x30 = 13,500 マス。2 箇所で 27,000 マス。
 * 毎秒見るには重いので、**30 秒に 1 回、刻みながら**見る。
 *
 * ## 消してはいけないもの
 *
 * | | なぜ |
 * | --- | --- |
 * | マップのブロック | 拠点そのもの。壁も床もチェストも守る対象 |
 * | **コア** | **範囲の中にある。** 守る対象ではないので、除外しないと消える |
 */
const BASE_SWEEP_INTERVAL = 600;

/** 1 tick あたりに見るマス数（watchdog 対策。docs/imp.md 5.3） */
const PER_TICK = 1024;

let baseSweeping = false;

function* sweepBasesJob(): Generator<void, void, void> {
  const dim = world.getDimension("overworld");
  let seen = 0;
  let removed = 0;

  for (const arena of ARENAS) {
    for (const box of arena.noBuild) {
      for (let x = box.min.x; x <= box.max.x; x++) {
        for (let y = box.min.y; y <= box.max.y; y++) {
          for (let z = box.min.z; z <= box.max.z; z++) {
            if (++seen % PER_TICK === 0) yield;
            // **コアは消さない。** 守る対象ではないが、消してはいけない
            if (coreAt(x, y, z) !== undefined) continue;
            try {
              const b = dim.getBlock({ x, y, z });
              if (b === undefined || b.isAir) continue;
              if (isMapBlock(b.typeId)) continue;
              b.setType("minecraft:air");
              removed++;
            } catch {
              /* 読み込まれていない */
            }
          }
        }
      }
    }
  }
  if (removed > 0) opMessage(`§7拠点の中に置かれていた ${removed} マスを消した`);
  baseSweeping = false;
}

/**
 * 右クリックで**何かが起きる**ブロックか。
 *
 * 中身を持つもの（チェスト等）は、そのまま持ち物の有無で判定できる。
 * それ以外は数が限られているので並べる。
 */
const INTERACTABLE: ReadonlySet<string> = new Set([
  "minecraft:ender_chest",
  "minecraft:crafting_table",
  "minecraft:anvil",
  "minecraft:enchanting_table",
  "minecraft:grindstone",
  "minecraft:stonecutter_block",
  "minecraft:smithing_table",
  "minecraft:cartography_table",
  "minecraft:loom",
  "minecraft:bed",
  "minecraft:lever",
  "minecraft:crafter",
]);

function isInteractable(block: Block): boolean {
  try {
    // **中身を持つなら、触る対象。** チェスト・かまど・樽など
    if (block.getComponent("minecraft:inventory") !== undefined) return true;
  } catch {
    /* 読めなかった。一覧で判断する */
  }
  const id = block.typeId;
  if (INTERACTABLE.has(id)) return true;
  // 扉・ボタン・感圧板・フェンスゲート・トラップドアはまとめて拾う
  return (
    id.endsWith("_door") ||
    id.endsWith("_trapdoor") ||
    id.endsWith("_button") ||
    id.endsWith("_fence_gate") ||
    id.includes("pressure_plate")
  );
}

/** 面の向き → その面の外側へ 1 マス */
const FACE_OFFSET: Readonly<Record<string, { x: number; y: number; z: number }>> = {
  Up: { x: 0, y: 1, z: 0 },
  Down: { x: 0, y: -1, z: 0 },
  North: { x: 0, y: 0, z: -1 },
  South: { x: 0, y: 0, z: 1 },
  West: { x: -1, y: 0, z: 0 },
  East: { x: 1, y: 0, z: 0 },
};

/**
 * 購読を始める。
 *
 * ## `playerPlaceBlock` に `before` が無い
 *
 * 置くのを**直接**打ち消す手段が無い。
 * 代わりに**「ブロックに向けて何かを使った瞬間」**を捕まえる。
 *
 * `playerInteractWithBlock` は打ち消せる。
 * 触った面から**どこへ置かれるか**を計算し、そこが禁止なら打ち消す。
 *
 * ## 取りこぼしの保険
 *
 * 置き換え可能なブロック（草など）に重ねる場合は、
 * 触った面の外ではなく**その場所そのもの**に置かれる。
 * 計算が外れることがあるので、**置かれた後にも見て、消す。**
 *
 * > 置いてから消すのは手応えが嘘になるので**最後の手段**。
 * > 普段は打ち消しで止まる。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerBuildRules(): void {
  // **打ち消しの取りこぼしを、後から消す**（/reload の隙間など）
  system.runInterval(sweepGenerators, SWEEP_INTERVAL);

  // 拠点の中も同じ。**範囲が広いのでゆっくり**
  system.runInterval(() => {
    if (baseSweeping) return;
    baseSweeping = true;
    system.runJob(sweepBasesJob());
  }, BASE_SWEEP_INTERVAL);

  // ---- 置く直前に打ち消す
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (isEditor(ev.player.id)) return;
    // **手に何も持っていないなら置く動作ではない**
    if (ev.itemStack === undefined) return;

    // **触る動作を邪魔しない。**
    //
    // ブロックを持ったままチェストを右クリックすると、
    // 「置こうとした」とみなして打ち消していた。**チェストが開けなかった。**
    //
    // Minecraft の判断基準に合わせる:
    //   スニークしていない → **触る**（チェストを開く）
    //   スニークしている   → **置く**
    //
    // 取りこぼしても、後の掃除で消えるので緩く判定してよい
    if (isInteractable(ev.block) && !ev.player.isSneaking) return;

    const b = ev.block.location;
    const off = FACE_OFFSET[String(ev.blockFace)];
    if (off === undefined) return;
    const target = { x: b.x + off.x, y: b.y + off.y, z: b.z + off.z };

    const why = whyCannotBuild(target.x, target.y, target.z);
    if (why === undefined) return;
    // **TNT は拠点でも置ける**（docs/spec/11-match.md 6-G）
    if (why === "§c拠点の中には置けません" && allowedInBase(ev.itemStack.typeId)) return;

    ev.cancel = true;
    const player = ev.player;
    // **restricted execution。** 通知は次の tick へ逃がす
    system.run(() => notify(player, why));
  });

  // ---- 取りこぼしたら、置かれた後に消す
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    if (isEditor(ev.player.id)) return;
    const at = ev.block.location;
    const why = whyCannotBuild(at.x, at.y, at.z);
    if (why === undefined) return;
    // **TNT は拠点でも置ける**（置いた瞬間に実体になるので残らない）
    if (why === "§c拠点の中には置けません" && allowedInBase(ev.block.typeId)) return;

    const block = ev.block;
    const player = ev.player;
    system.run(() => {
      try {
        block.setType("minecraft:air");
      } catch {
        /* 消せなかった */
      }
      notify(player, why);
    });
  });
}
