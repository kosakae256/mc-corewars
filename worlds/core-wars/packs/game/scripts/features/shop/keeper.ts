/**
 * ショップの店員。
 *
 * 仕様は `docs/spec/12-shop.md` 5〜6章。
 *
 * ## 何をするか
 *
 * **試合中だけ、拠点の中に店員を立たせる。** 触るとショップが開く。
 *
 * | 状態 | 店員 |
 * | --- | --- |
 * | 試合中 | 居る |
 * | 一時停止中 | **居ない** |
 * | 非開始 | **居ない** |
 *
 * 一時停止中に消すのは、**止まっている間に買い物が進むのを防ぐ**ため。
 *
 * ## 置いて終わりにしない
 *
 * 店員は簡単に消える。
 *
 * - 試合開始時の**エンティティ一掃**（場内の実体を消す処理）
 * - チャンクが読み込まれていない間の湧き損ね
 * - `/reload`（位置の記憶はメモリにしかない）
 *
 * だから**居るべき姿を、一定間隔で作り直す。**
 * 消えた原因を数えるより確実で、状態の変わり目を拾い損ねても自然に直る。
 *
 * ジェネレータの再走査やティッキングエリアと同じ考え方
 *（`docs/spec/11-match.md` 6-B / R-3）。
 */

import { BAR, bar } from "../../lib/fx.js";
import { system, world, type Dimension, type Entity, type Vector3 } from "@minecraft/server";

import { ARENAS, type Arena, type Team } from "../../lib/arena.js";
import { matchState, teamOf } from "../../lib/match-state.js";
import { openShop, shopBlockedReason } from "./index.js";
import { droneUiBlocked } from "../drone/index.js";

/** 店員の種類。`behavior_packs/game/entities/shopkeeper.json` */
const KEEPER = "game:shopkeeper";

/**
 * チームを表すタグ。
 *
 * **触った人の所属と突き合わせる**ので、実体そのものに持たせる。
 * 位置から逆引きすると、少しでもずれたときに判定できなくなる。
 */
function teamTag(team: Team): string {
  return `cw_shop_${team}`;
}

/** 表示名。**色でどちらの店か分かるようにする** */
const KEEPER_NAME: Readonly<Record<Team, string>> = {
  blue: "§9ショップ",
  red: "§cショップ",
};

/**
 * 同じ場所に居ると見なす距離。
 *
 * **ぴったり一致は求めない。** 湧いた直後に少し沈む（地面に乗る）ので、
 * 厳密に比べると毎回「居ない」と判断して湧かし続けることになる。
 */
const SAME_SPOT = 1.5;

/** 見張る間隔（tick）。**2 秒に 1 回で足りる。** 急ぐものではない */
const INTERVAL = 40;

/**
 * 湧かせる位置のずらし幅。
 *
 * **座標はブロックの角を指す。** そのまま湧かすと角に立ち、
 * ブロックの真ん中からずれて見える。
 *
 * **x も z も半マスずらす。** どちらの軸でも事情は同じ。
 */
const SPAWN_OFFSET = { x: 0.5, y: 0, z: 0.5 } as const;

/**
 * 向き。
 *
 * **常に会場の中央（z = コアの位置）を向く。**
 * 拠点の手前側と奥側に 2 体ずつ立つので、
 * 向きを固定しないと**背中を向けた店員ができる。**
 *
 * Bedrock の yaw は **0 が +z（南）、180 が -z（北）。**
 */
function facingYaw(at: Vector3, towardZ: number): number {
  return at.z < towardZ ? 0 : 180;
}

/** 向きが合っているか。**浮動小数なので幅を持たせる** */
function facingOk(now: number, want: number): boolean {
  // -180 と 180 は同じ向き
  const d = Math.abs(((now - want + 540) % 360) - 180);
  return d > 175;
}

/** 湧かせ損ねを 1 度だけ知らせるための印 */
let warned = false;

/** 立たせる実際の座標 */
function spawnPoint(at: Vector3): Vector3 {
  return { x: at.x + SPAWN_OFFSET.x, y: at.y + SPAWN_OFFSET.y, z: at.z + SPAWN_OFFSET.z };
}

function distance(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 場内の店員を全部拾う */
function keepersIn(dim: Dimension, arena: Arena): Entity[] {
  const b = arena.bounds;
  try {
    return dim.getEntities({
      type: KEEPER,
      location: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 },
      maxDistance: Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2 + 2,
    });
  } catch {
    // 読み込まれていない。次の機会に
    return [];
  }
}

function removeAll(dim: Dimension, arena: Arena): void {
  for (const e of keepersIn(dim, arena)) {
    try {
      e.remove();
    } catch {
      /* 既に消えている */
    }
  }
}

/**
 * 居るべき姿に合わせる。
 *
 * **足りなければ湧かし、余っていれば消す。**
 * 何度呼んでも同じ結果になる（呼びすぎても壊れない）。
 */
function syncArena(dim: Dimension, arena: Arena, running: boolean): void {
  if (!running) {
    removeAll(dim, arena);
    return;
  }

  const alive = keepersIn(dim, arena);
  const used = new Set<Entity>();

  for (const team of ["blue", "red"] as const) {
    for (const raw of arena.shops[team]) {
      const at = spawnPoint(raw);
      // **その位置に既に居るか。** 居るなら何もしない
      const yaw = facingYaw(at, arena.cores[team].z);
      const found = alive.find((e) => !used.has(e) && distance(e.location, at) <= SAME_SPOT);
      if (found !== undefined) {
        used.add(found);
        // **向きが狂っていたら直す。** 押されたり読み込み直したりで変わりうる
        try {
          if (!facingOk(found.getRotation().y, yaw)) found.setRotation({ x: 0, y: yaw });
        } catch {
          /* 消えている */
        }
        continue;
      }
      try {
        const e = dim.spawnEntity(KEEPER, at);
        e.addTag(teamTag(team));
        e.nameTag = KEEPER_NAME[team];
        e.setRotation({ x: 0, y: yaw });
      } catch (err) {
        // **黙って諦めない。** 一度だけログに出す。
        //
        // 読み込まれていないだけなら次の機会に湧くが、
        // 定義そのものが悪いと**永遠に湧かない。**
        // 握りつぶすと、どちらなのか分からないまま時間が溶ける
        if (!warned) {
          warned = true;
          console.warn(`[cw] 店員を湧かせられません (${at.x},${at.y},${at.z}): ${String(err)}`);
        }
      }
    }
  }

  // **決められた位置に居ないものは消す。**
  // 押されて動いた、古い会場の残り、など
  for (const e of alive) {
    if (used.has(e)) continue;
    try {
      e.remove();
    } catch {
      /* 既に消えている */
    }
  }
}

/** いま店員が居るべきか */
function shouldExist(): boolean {
  return matchState() === "running";
}

/**
 * 店員の見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function startShopKeepers(): void {
  system.runInterval(() => {
    // **`world.getDimension` は毎回この中で呼ぶ。**
    // トップレベル（early execution）で呼ぶと落ちる恐れがある
    //（`docs/imp.md` 5.1）。実際、動的プロパティの読み取りで一度落ちている
    const dim = world.getDimension("overworld");
    const running = shouldExist();
    for (const arena of ARENAS) syncArena(dim, arena, running);
  }, INTERVAL);
}

/**
 * いま何体立っているか。
 *
 * **`/game:status` に出すため。** 「居ない」と言われたときに、
 * 湧かせ損ねているのか、そもそも試合中でないのかを切り分けられる。
 */
export function keeperCount(): { alive: number; want: number } {
  let alive = 0;
  let want = 0;
  try {
    const dim = world.getDimension("overworld");
    for (const arena of ARENAS) {
      want += arena.shops.blue.length + arena.shops.red.length;
      alive += keepersIn(dim, arena).length;
    }
  } catch {
    /* 読み込まれていない */
  }
  return { alive, want };
}

/**
 * 店員は殴っても何も起きない。
 *
 * ## なぜスクリプトで止めるのか
 *
 * エンティティの定義にも `minecraft:damage_sensor` を入れてあるが、
 * **それだけでは死んだ。**
 *
 * 定義側は「どう扱うか」の宣言で、**通る経路が版によって変わる。**
 * こちらは**ダメージそのものを取り消す**ので、経路に依らない。
 *
 * ## 二重にしておく
 *
 * 定義側も残す。**スクリプトが止まっているときの受け皿**になる。
 * `/reload` の隙や、購読前の一瞬に殴られても、そこで守られる。
 *
 * ## 見た目までは消せない
 *
 * 殴る動作そのものは止められない。**振りかぶりは出る。**
 * だが**減りも死にもしない**ので、実害は無い。
 */
export function registerShopKeeperGuard(): void {
  world.beforeEvents.entityHurt.subscribe(
    (ev) => {
      ev.cancel = true;
    },
    // **店員に来たものだけ受け取る。**
    // 全エンティティのダメージを毎回見るのは無駄が大きい
    { entityFilter: { type: KEEPER } }
  );
}

/**
 * 店員に触ったらショップを開く。
 *
 * ## なぜ before イベントなのか
 *
 * **バニラの動きを止める必要がある。**
 * 専用のエンティティなので取引の画面は出ないが、
 * **手に持っているものを使ってしまう**（食べる、ブロックを置く）のを止めたい。
 *
 * ## 開くのは次の tick
 *
 * before イベントは restricted execution。**画面を出せない**
 *（`docs/imp.md` 5.1）。`system.run` に逃がす。
 */
export function registerShopKeeperInteract(): void {
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const target = ev.target;
    if (target.typeId !== KEEPER) return;
    // **ドローンの最中は開かない**（`features/drone` 5-E）
    if (droneUiBlocked(ev.player, ev.itemStack?.typeId)) return;

    // **バニラの動きを止める。** 手に持っているものが暴発しないように
    ev.cancel = true;

    const player = ev.player;
    system.run(() => {
      // ---- 開ける条件（docs/spec/12-shop.md 5章）
      //
      // 「試合中か」「所属があるか」は `index.ts` が見る。
      // **ここでしか分からないのは「自チームの店員か」だけ**
      const blocked = shopBlockedReason(player);
      if (blocked !== undefined) {
        bar(player, blocked);
        return;
      }
      // ---- **相手の店でも買える**（2026-08-26 変更）
      //
      // 仕様は `docs/spec/12-shop.md` 5-B。
      //
      // 以前は**店員の所属で弾いていた。**
      // だが攻め込んだ先で買えないのは、**攻めた側だけが補給を絶たれる**
      // ということで、拠点に踏み込む理由をひとつ削っていた。
      //
      // **開けるが、払えるのは手持ちだけ**（金庫もエンダーチェストも覗けない）。
      // 何を持って攻め込むかが、そのまま判断になる
      const mine = teamOf(player);
      if (mine !== undefined && !target.hasTag(teamTag(mine))) {
        bar(player, "§e敵陣のショップ §7手持ちの資源だけで買えます", BAR.notice, 60);
      }
      openShop(player);
    });
  });
}
