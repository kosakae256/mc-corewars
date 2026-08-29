/**
 * ファイヤーチャージを投げ物にする。
 *
 * 仕様は `docs/03-content.md` 1-4。
 *
 * ## バニラのままでは投げられない
 *
 * 手で使うと**目の前のブロックに火を点けるだけ。**
 * 飛ばせるのはディスペンサーからだけ。
 *
 * **打ち消して自前で飛ばす手も効かなかった**（2026-08-25）。
 * バニラの `minecraft:fire_charge` は
 * **空に向けて右クリックしても `itemUse` が飛ばない**——
 * ブロックに使う動作しか持っていないため、拾える瞬間が無い。
 *
 * **独自アイテム `game:fire_charge` にした。**
 * 見た目はバニラの火の玉のまま（テクスチャを借りている）。
 *
 * ## 弾は自分で飛ばす（2026-08-25 修正）
 *
 * `minecraft:small_fireball` を出して `shoot` させる形にしたが、
 * **飛ばなかった。**
 *
 * **支柱弾（`features/pillar`）と同じ作りにする。**
 * 実体を出さず、**点を毎 tick 進めて、当たったかを自分で見る。**
 * 実体まわりの都合に振り回されない。
 *
 * ## 人には当たらない
 *
 * **これは陣地を焼く道具で、人を倒す道具ではない。**
 *
 * 倒す手段は既にある。そこへ**当たれば強い遠距離攻撃**を足すと、
 * **近づく理由が減る。**

 *
 * ## 壊せないものがある
 *
 * **合成鋼は飛ばない**（`docs/03-content.md` 1-5）。
 *
 * 金 2 個の弾で金 2 個の壁が消えるなら、**置く意味が無い。**
 * 合成鋼を崩すには TNT を持ち出す——**置きに行く手間と時間差**が要る。
 *
 * 合成鋼はバニラのブロックをテクスチャだけ差し替えたものなので、
 * **耐性の数字を書き換える手段が無い。**
 * **爆発の対象から外す**ことで同じ結果にしている。
 *
 * ## 自分で壊す（2026-08-25 変更）
 *
 * **`createExplosion` は使わない。**
 *
 * あれは**人も物も巻き込む前提の仕組み**で、
 * 「人に当てない」設定が無い。ダメージを後から打ち消す形にしていたが、
 * **取りこぼした**（2026-08-25 の「たまにプレイヤーを殺せる」
 * 「アイテムもまれに消える」）。
 *
 * | 取りこぼす経路 | |
 * | --- | --- |
 * | ダメージが次の tick に回る | 打ち消す窓から外れる |
 * | 落ちている物が消える | **傷つける経路を通らない**ものがある |
 * | 吹き飛ばされて落ちる | ダメージを消しても**ノックバックは残る** |
 *
 * **壊すブロックを自分で選んで消す。**
 * 実体には**一切触らない**ので、取りこぼしようが無い。
 */

import { system, world, type Block, type Player, type Vector3 } from "@minecraft/server";

import { bar } from "../../lib/fx.js";
// **ドローンから撃つ**（docs/spec/23-drone.md 5 章）
import { droneMuzzle, droneThrowCost, isFlyingDrone } from "../drone/index.js";
import { spendGas } from "../grapple/gas.js";
import { isProtectedAt } from "../protection/index.js";
import { coreAt } from "../../lib/arena.js";

/** この道具。**バニラではなく独自アイテム**（上記） */
const ITEM = "game:fire_charge";

/**
 * 壊す半径（マス）。
 *
 * 以前は `createExplosion` の「強さ 4」だったものを、
 * **実際に消す距離**として書き直した（2026-08-25）。
 *
 * ## 4 倍に戻した（2026-08-28）
 *
 * | | 半径 |
 * | --- | --- |
 * | 元（ガストと同じ） | 0.9 |
 * | 2 倍 | 1.75 |
 * | **4 倍（TNT と同じ）** | **3.5** |
 *
 * 一度 4 倍にし、**強すぎる**として 0.9 へ戻した（2026-08-26）。
 * **もう一度 4 倍にする**（2026-08-28 の指定）。
 *
 * **壊れないものは変わらない**（`TOUGH` と保護）——
 * 黒曜石と合成鋼は、半径がいくつでも消えない。
 * **広くなっても、崩せる物の種類は増えない。**
 */
const RADIUS = 3.5;

/** 飛ぶ速さ（マス/tick） */
const SPEED = 1.2;

/**
 * 1 tick を何回に分けて進めるか。
 *
 * **壁をすり抜けさせない**ためと、**火の玉を繋げて見せる**ため。
 * 1 tick に 1 つしか出さないと、1.2 マスおきの点にしか見えない
 *（2026-08-25 の「飛んでいるように見えない」）。
 */
const SUBSTEPS = 6;

/** 飛び続けられる長さ（tick）。**当たらなければ消える** */
const MAX_AGE = 100;

/**
 * 先頭に出す粒のずらし方（マス）。
 *
 * **1 点だけだと火の粉にしか見えない。**
 * 少しずらして数個出すと、飛んでいる塊に見える。
 */
const HEAD: readonly Vector3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0.18, y: 0, z: 0 },
  { x: -0.18, y: 0, z: 0 },
  { x: 0, y: 0.18, z: 0 },
  { x: 0, y: -0.18, z: 0 },
  { x: 0, y: 0, z: 0.18 },
  { x: 0, y: 0, z: -0.18 },
];

/** 飛んでいる弾 */
interface Shot {
  readonly owner: string;
  at: Vector3;
  readonly dir: Vector3;
  age: number;
}

const shots: Shot[] = [];

/**
 * ファイヤーチャージでは壊れないブロック。
 *
 * 仕様は `docs/03-content.md` 1-5。
 *
 * | 建材 | なぜ |
 * | --- | --- |
 * | **合成鋼**（青 = 未加工の鉄 / 赤 = 未加工の銅） | 一番硬い建材。金 2 個の弾で消えては置く意味が無い |
 * | **黒曜石** | **そもそも何でも壊れない**建材（2026-08-26 追加） |
 *
 * ## 黒曜石が飛んでいた
 *
 * この爆発は**バニラの爆発ではない。**
 * 「壊すブロックを自分で選んで消す」ので、
 * **爆発耐性という考え方がそもそも通らない。**
 *
 * バニラなら耐性で守られるものも、**ここに書かないと消える。**
 */
const TOUGH: ReadonlySet<string> = new Set([
  "minecraft:raw_iron_block",
  "minecraft:raw_copper_block",
  "minecraft:obsidian",
  // **泣く黒曜石も同じ扱い。** いまは売っていないが、置かれても壊れないほうが筋が通る
  "minecraft:crying_obsidian",
]);

function norm(v: Vector3): Vector3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < 1e-6 ? { x: 0, y: 0, z: 1 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * 持ち物から 1 つ減らして、投げてよいかを返す。
 *
 * **減らせなければ投げない。** 減らないまま飛ぶと無限に撃てる。
 */
function consume(player: Player): boolean {
  try {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (c === undefined) return false;
    const slot = player.selectedSlotIndex;
    const it = c.getItem(slot);
    if (it?.typeId !== ITEM) return false;
    if (it.amount <= 1) c.setItem(slot, undefined);
    else {
      it.amount -= 1;
      c.setItem(slot, it);
    }
    return true;
  } catch {
    return false;
  }
}

/** 投げる */
function throwCharge(player: Player): void {
  // ---- **機体から撃つときはマナを使う**（2026-08-26 変更）
  //
  // 仕様は `docs/spec/24-role.md` 4-3。
  //
  // **間隔（CT）は廃止した。マナがその役をする。**
  // **手で投げる分は縛らない**（撃ち合いの中で使うぶんには釣り合っている）
  if (isFlyingDrone(player.id) && !spendGas(player, droneThrowCost(ITEM))) {
    bar(player, "§cマナが足りません");
    return;
  }

  let eye: Vector3;
  let dir: Vector3;
  try {
    // ---- **ドローンを飛ばしているなら、機体から撃つ**
    //
    // 仕様は `docs/spec/23-drone.md` 5 章。
    // 本人は地上に立っているので、そのままだと**足元から飛んでいく**
    eye = droneMuzzle(player) ?? player.getHeadLocation();
    dir = norm(player.getViewDirection());
  } catch {
    // **黙って諦めない。** 何も起きない理由が分からないのが一番困る
    bar(player, "§c投げられませんでした");
    return;
  }
  if (!consume(player)) return;

  shots.push({
    owner: player.id,
    // **少し前から出す。** 目の位置ちょうどだと自分の顔に当たる
    at: { x: eye.x + dir.x, y: eye.y + dir.y, z: eye.z + dir.z },
    dir,
    age: 0,
  });
  try {
    player.playSound("mob.ghast.fireball", { location: player.location });
  } catch {
    /* 消えている */
  }
}

/**
 * 壊してよいブロックか。
 *
 * **守るブロックとコアは触らない。**
 * 掘るときと同じ判定を通す——別に書くと必ず食い違う。
 */
function breakable(block: Block): boolean {
  if (block.isAir || block.isLiquid) return false;
  const at = block.location;
  // **マップは削れない**（docs/spec/10-block-protection.md）
  if (isProtectedAt(block.typeId, at)) return false;
  // **合成鋼は壊れない**（docs/03-content.md 1-5）
  if (TOUGH.has(block.typeId)) return false;
  // **コアは削らない。** 削るのは殴ったときだけ（docs/spec/11-match.md）
  if (coreAt(at.x, at.y, at.z) !== undefined) return false;
  return true;
}

/**
 * 爆発させる。
 *
 * **実体には触らない。** 壊すブロックを自分で選んで消すだけ。
 */
function blast(at: Vector3): void {
  const dim = world.getDimension("overworld");
  const r = Math.ceil(RADIUS);
  const cx = Math.floor(at.x);
  const cy = Math.floor(at.y);
  const cz = Math.floor(at.z);

  for (let x = cx - r; x <= cx + r; x++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let z = cz - r; z <= cz + r; z++) {
        // **球で切る。** 立方体のまま消すと角が飛び出す
        if (Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y, z + 0.5 - at.z) > RADIUS) continue;
        try {
          const b = dim.getBlock({ x, y, z });
          if (b === undefined || !breakable(b)) continue;
          b.setType("minecraft:air");
        } catch {
          /* 読み込まれていない。そのマスは飛ばす */
        }
      }
    }
  }

  try {
    dim.spawnParticle("minecraft:huge_explosion_emitter", at);
    dim.playSound("random.explode", at, { volume: 1 });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 同じ tick に 2 回投げさせない。
 *
 * 空を向いたときと、ブロックを向いたときで**拾う経路が違う。**
 * 両方来ることがある。
 */
const thrownAt = new Map<string, number>();

function throwOnce(player: Player): void {
  if (thrownAt.get(player.id) === system.currentTick) return;
  thrownAt.set(player.id, system.currentTick);
  system.run(() => throwCharge(player));
}

/**
 * 受け取りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerFireCharge(): void {
  // ---- **使ったら投げる**
  //
  // 独自アイテムなので打ち消す必要が無い。**元の動きが無い**
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== ITEM) return;
    throwOnce(ev.source);
  });

  // ---- **ブロックに向けたときも投げる**
  //
  // 空を向いているときと拾う経路が違う。
  // **同じ tick に両方来ることがある**ので、1 回に絞る
  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.itemStack?.typeId !== ITEM) return;
    throwOnce(ev.player);
  });
}

/**
 * 弾を進める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function startFireCharge(): void {
  system.runInterval(() => {
    if (shots.length === 0) return;
    const dim = world.getDimension("overworld");

    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.age++;

      let at = s.at;
      let hitAt: Vector3 | undefined;

      const step = SPEED / SUBSTEPS;
      for (let k = 0; k < SUBSTEPS && hitAt === undefined; k++) {
        const next = { x: at.x + s.dir.x * step, y: at.y + s.dir.y * step, z: at.z + s.dir.z * step };

        // **通った跡を全部描く**（2026-08-25 修正）。
        // 1 tick に 1 つだと、**飛んでいる玉ではなく点の列**にしか見えない
        try {
          dim.spawnParticle("minecraft:basic_flame_particle", next);
        } catch {
          /* 読み込まれていない */
        }

        // ---- ブロックに当たったか。**手前で炸裂させる**
        //
        // 当たった位置で爆発させると、**壁の中で爆発する**
        //（支柱弾で通った道。`features/pillar`）
        let blocked = false;
        try {
          const b = dim.getBlock({ x: Math.floor(next.x), y: Math.floor(next.y), z: Math.floor(next.z) });
          if (b !== undefined && !b.isAir && !b.isLiquid) blocked = true;
        } catch {
          // 読み込まれていない。**そこで炸裂させる**
          blocked = true;
        }
        if (blocked) {
          hitAt = at;
          break;
        }
        at = next;
      }

      s.at = at;

      // ---- **先頭は玉に見せる**
      //
      // 1 点だけだと火の粉にしか見えない。
      // **少しずらして数個出す**と、飛んでいる塊に見える
      for (const o of HEAD) {
        try {
          dim.spawnParticle("minecraft:basic_flame_particle", { x: at.x + o.x, y: at.y + o.y, z: at.z + o.z });
        } catch {
          /* 読み込まれていない */
        }
      }

      if (hitAt !== undefined) {
        shots.splice(i, 1);
        blast(hitAt);
        continue;
      }

      // **当たらなければ消える。** 際限なく飛ばさない
      if (s.age >= MAX_AGE) shots.splice(i, 1);
    }
  }, 1);
}
