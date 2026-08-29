/**
 * 支柱弾。**投げた先に上下 10 マスの柱が生える。**
 *
 * 仕様は `docs/spec/18-pillar.md`。
 *
 * ## なぜ実体を使わないのか
 *
 * 投げ物の実体を作ると、**当たり判定と当たったときの通知**が要る。
 * バニラの投げ物を借りると、こんどは**見た目と当たり方が固定される。**
 *
 * **自分で飛ばす。**
 * 毎 tick 少し進めて、進んだ先にブロックか人が居るかを見る。
 * 判定は 1 発あたり 1 回の走査で済み、**当たり方も好きに決められる。**
 *
 * ## 0.5 秒で 15 マス
 *
 * 10 tick で 15 マスなので、**1 tick あたり 1.5 マス。**
 * 当たらなければそこで炸裂する（`docs/spec/18-pillar.md` 2章）。
 *
 * **距離は変えず、速さだけ 3 倍にした**（2026-08-25）。
 * 1.5 秒は戦闘中には長く、**着く前に状況が変わっていた。**
 */

import { system, world, type Dimension, type Player, type Vector3 } from "@minecraft/server";

import { ARENAS, inBox, type Team } from "../../lib/arena.js";
import { isRunning, teamOf } from "../../lib/match-state.js";
import { LOBBY_BOUNDS } from "../../lib/lobby.js";
import { noteLobbyBlock } from "../cleanup/index.js";
import { practicing } from "../../lib/practice.js";
import { droneMuzzle, droneThrowCost, isFlyingDrone } from "../drone/index.js";
import { spendGas } from "../grapple/gas.js";
import { whyCannotBuild } from "../build/index.js";
import { bar, particle, sound, soundAll } from "../../lib/fx.js";

/** 投げるアイテム */
const ITEM = "game:pillar_shot";

/**
 * 飛ぶ速さ（マス/tick）。
 *
 * **1.5 → 7.5 → 10 → 15**（2026-08-26）。
 *
 * 飛ぶ時間は **0.1 秒**（`FUSE`）なので、**届く距離は約 30 マス。**
 *
 * 速さと時間の両方が距離を決める。
 * **近すぎるときは、まず速さを上げる**——
 * 時間を伸ばすと「待たされる」が戻ってくる。
 *
 * > 足場が要る場面は「**いま落ちる**」ときで、
 * > **待たされるほど使い道が無くなる。**
 */
const SPEED = 15;

/**
 * 自動で炸裂するまで（tick）。**0.1 秒**（2026-08-26 変更）。
 *
 * 速さを 5 倍にしたぶん**飛ぶ時間を 5 分の 1 に戻した**ので、
 * **届く距離は元どおり（約 15 マス）。**
 *
 * 変わったのは**着くまでの速さだけ。**
 * 足場が要る場面は「**いま落ちる**」ときなので、
 * **待たされないことがそのまま値打ちになる。**
 */
const FUSE = 2;

/**
 * 1 tick を何回に分けて調べるか。
 *
 * **速くすると壁をすり抜ける**（2026-08-25 修正）。
 * 1 tick に 1.5 マス進むので、1 回しか調べないと
 * **厚さ 1 マスの壁を跨いで通り抜けてしまう。**
 *
 * 0.25 マスごとに調べれば、どんな壁でも必ず 1 回は中に入る。
 *
 * **速さを上げたぶん、刻みも増やす**（2026-08-26。6 → 40）。
 * 刻みを増やさないと、**1 tick に 15 マス跨いで壁を抜ける。**
 * いまは 0.25 マスごとに調べている。
 */
const SUBSTEPS = 60;

/** 柱が伸びる長さ（上下それぞれ） */
const REACH = 10;

/** 柱が残る時間（tick）。**5 秒** */
const LIFE = 100;

/** 崩れる予告を出すまで（tick）。**消える 1 秒前** */
const WARN_AT = LIFE - 20;

/** 当たったと見なす距離（マス）。**プレイヤーの幅** */
const HIT_RADIUS = 1.2;

/** チームごとの柱ブロック */
const PILLAR: Readonly<Record<Team, string>> = {
  red: "game:pillar_red",
  blue: "game:pillar_blue",
};

/**
 * ロビーで撃ったときの柱。**白**（`docs/spec/25-practice.md`）。
 *
 * 無所属で撃つので**チームの色が無い。**
 * 試合の色を使うと、**どちらの陣営の物か**という意味が付いてしまう。
 */
const PILLAR_LOBBY = "game:pillar_white";

/** 柱として消してよいブロック */
const PILLAR_BLOCKS: ReadonlySet<string> = new Set([PILLAR.red, PILLAR.blue, PILLAR_LOBBY]);

/** 飛んでいる弾。**メモリだけ。** `/reload` で消えてよい */
interface Shot {
  readonly owner: string;
  /** 撃った人の所属。**ロビーで撃ったなら undefined** */
  readonly team: Team | undefined;
  /** 立てる柱のブロック */
  readonly block: string;
  at: Vector3;
  readonly dir: Vector3;
  age: number;
}
const shots: Shot[] = [];

/** 生えている柱。**時間で消すために覚えておく** */
interface Pillar {
  readonly cells: Vector3[];
  born: number;
  warned: boolean;
}
const pillars: Pillar[] = [];

function norm(v: Vector3): Vector3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < 1e-6 ? { x: 0, y: 0, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * そこに柱を置けるか。
 *
 * **置けない場所には生えない**（`docs/spec/18-pillar.md` 2-3）。
 * 投げれば置けるなら、置けない場所を作った意味が無い。
 */
function canPlace(dim: Dimension, at: Vector3, block: string): boolean {
  // ---- **手で置くときと同じ規則を通す**（2026-08-25 修正）
  //
  // 拠点の中だけを見ていたので、
  // **ジェネレータの真上にも柱が立った。**
  // 手では置けない場所に、投げれば置ける状態だった。
  //
  // 規則が 2 箇所にあると必ず食い違う。**`features/build` に寄せる**
  if (whyCannotBuild(at.x, at.y, at.z, block) !== undefined) return false;

  // **人が行ける範囲の外には作らない**（`docs/spec/25-practice.md`）
  if (!reachable(at)) return false;

  try {
    const b = dim.getBlock(at);
    // **空いているところだけ。** 上書きするとマップを削る
    return b !== undefined && b.isAir;
  } catch {
    return false;
  }
}

/**
 * そこは**人が行ける範囲**か。
 *
 * | | |
 * | --- | --- |
 * | 試合中 | **戦闘範囲**（`arena.bounds`） |
 * | ロビー | **ロビーの範囲**（`LOBBY_BOUNDS`） |
 *
 * **範囲の外では炸裂させない**（2026-08-27 追加）。
 * 誰も行けない場所で爆ぜても、**誰にも見えないまま柱が残る。**
 */
function reachable(at: Vector3): boolean {
  for (const arena of ARENAS) {
    if (inBox(arena.bounds, at)) return true;
  }
  return inBox(LOBBY_BOUNDS, at);
}

/**
 * 柱を立てる。
 *
 * **途中にブロックがあれば、そこで止まる**（貫通しない）。
 * 貫通させると、壁の向こう側に足場ができてしまう。
 */
function raise(dim: Dimension, center: Vector3, block: string): void {
  const cells: Vector3[] = [];
  const base = { x: Math.floor(center.x), y: Math.floor(center.y), z: Math.floor(center.z) };

  for (const step of [1, -1]) {
    for (let i = 0; i < REACH; i++) {
      const at = { x: base.x, y: base.y + step * i, z: base.z };
      // **止まったらそこまで。** 先へは伸ばさない
      if (!canPlace(dim, at, block)) break;
      try {
        dim.setBlockType(at, block);
        cells.push(at);
        // **ロビーに立てたぶんは覚えておく**（試合が始まるときに消す）
        if (block === PILLAR_LOBBY) noteLobbyBlock(at);
      } catch {
        break;
      }
    }
  }

  if (cells.length === 0) return;
  pillars.push({ cells, born: system.currentTick, warned: false });
  particle({ x: base.x + 0.5, y: base.y + 0.5, z: base.z + 0.5 }, "minecraft:knockback_roar_particle", dim);
  soundAll("mob.shulker.close", 0.8, 0.5);
}

/**
 * 弾が炸裂する。
 *
 * **柱が立たなくても、炸裂したことは見せる**（2026-08-25 追加）。
 * 何も起きないと「投げ損なった」のか「置けない場所だった」のか分からない。
 */
function burst(shot: Shot, at: Vector3): void {
  const dim = world.getDimension("overworld");
  const center = { x: at.x, y: at.y, z: at.z };

  // **人が行ける範囲の外では炸裂しない**（2026-08-27 追加）。
  // 見えない所で音と粒を出しても、驚かせるだけで意味が無い
  if (!reachable(center)) return;

  // ---- 炸裂の粒。**小さく散らして、爆ぜたように見せる**
  for (let i = 0; i < BURST_PARTICLES; i++) {
    particle(
      {
        x: center.x + (Math.random() - 0.5) * BURST_SPREAD,
        y: center.y + (Math.random() - 0.5) * BURST_SPREAD,
        z: center.z + (Math.random() - 0.5) * BURST_SPREAD,
      },
      "minecraft:basic_crit_particle",
      dim
    );
  }
  particle(center, "minecraft:knockback_roar_particle", dim);
  soundAll("random.explode", 1.6, 0.25);

  raise(dim, center, shot.block);
}

/** 炸裂の粒の数 */
const BURST_PARTICLES = 12;

/** 炸裂の粒を散らす幅（マス） */
const BURST_SPREAD = 1.6;

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function startPillar(): void {
  system.runInterval(() => {
    const dim = world.getDimension("overworld");
    const now = system.currentTick;

    // ---- 飛んでいる弾を進める
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.age++;

      // **炸裂する場所は「最後に空いていたところ」**（2026-08-25 修正）。
      //
      // 壁に当たった位置で炸裂させていたので、
      // **柱の根元が壁の中**になり、置けずに何も起きなかった。
      // 「壁に当たっても炸裂しない」の正体はこれ。
      let at: Vector3 = s.at;
      let hitAt: Vector3 | undefined = s.age >= FUSE ? s.at : undefined;

      const step = SPEED / SUBSTEPS;
      for (let k = 0; k < SUBSTEPS && hitAt === undefined; k++) {
        const next = { x: at.x + s.dir.x * step, y: at.y + s.dir.y * step, z: at.z + s.dir.z * step };

        // ---- ブロックに当たったか。**手前で炸裂させる**
        let blocked = false;
        try {
          const b = dim.getBlock({ x: Math.floor(next.x), y: Math.floor(next.y), z: Math.floor(next.z) });
          if (b !== undefined && !b.isAir) blocked = true;
        } catch {
          // 読み込まれていない。**そこで炸裂させる**
          blocked = true;
        }
        if (blocked) {
          hitAt = at;
          break;
        }

        // ---- 人に当たったか（味方には当たらない）。**その場で炸裂**
        let onPlayer = false;
        for (const p of world.getAllPlayers()) {
          if (p.id === s.owner) continue;
          if (s.team !== undefined && teamOf(p) === s.team) continue;
          const d = Math.hypot(p.location.x - next.x, p.location.y + 1 - next.y, p.location.z - next.z);
          if (d <= HIT_RADIUS) {
            onPlayer = true;
            break;
          }
        }
        at = next;
        if (onPlayer) {
          hitAt = next;
          break;
        }
      }

      s.at = at;
      // 軌跡
      particle(s.at, "minecraft:basic_crit_particle", dim);

      if (hitAt !== undefined) {
        burst(s, hitAt);
        shots.splice(i, 1);
      }
    }

    // ---- 生えている柱を消す
    for (let i = pillars.length - 1; i >= 0; i--) {
      const p = pillars[i];
      const age = now - p.born;

      // **崩れる予告**（docs/spec/18-pillar.md 4章）。
      // 足場が消えるのは事故につながる。予告が無いと理由が分からない
      if (!p.warned && age >= WARN_AT) {
        p.warned = true;
        soundAll("random.fizz", 1.4, 0.5);
        for (const c of p.cells) {
          particle({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }, "minecraft:basic_smoke_particle", dim);
        }
      }

      if (age < LIFE) continue;

      // **下から順に消す。** 崩れるように見せる
      for (const c of [...p.cells].sort((a, b) => a.y - b.y)) {
        try {
          const b = dim.getBlock(c);
          // **他のものに変わっていたら触らない。** 上書き事故を避ける
          if (b !== undefined && PILLAR_BLOCKS.has(b.typeId)) {
            b.setType("minecraft:air");
            particle({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }, "minecraft:basic_smoke_particle", dim);
          }
        } catch {
          /* 読み込まれていない */
        }
      }
      pillars.splice(i, 1);
    }
  }, 1);
}

/**
 * 投げる。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerPillarThrow(): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== ITEM) return;
    const player = ev.source;
    // ---- **ロビーでも撃てる**（`docs/spec/25-practice.md`）
    //
    // 試す場所なので、**投げてみないと使い道が分からない。**
    // 立つ柱は**白**——所属が無いので、陣営の色を使う理由が無い
    const lobby = practicing(player);
    if (!lobby && !isRunning()) return;
    const team = teamOf(player);
    if (!lobby && team === undefined) return;

    system.run(() => {
      // **1 個消費する。** クールダウンは定義側（`items/pillar_shot.json`）
      try {
        const c = player.getComponent("minecraft:inventory")?.container;
        const slot = player.selectedSlotIndex;
        const item = c?.getItem(slot);
        if (c === undefined || item === undefined || item.typeId !== ITEM) return;
        if (item.amount <= 1) c.setItem(slot, undefined);
        else {
          item.amount -= 1;
          c.setItem(slot, item);
        }
      } catch {
        return;
      }

      // ---- **機体から撃つときはマナを使う**（`docs/spec/24-role.md` 4-3）
      //
      // 手で投げる分は縛らない。**空から出すぶんにだけ値段を付ける**
      if (isFlyingDrone(player.id) && !spendGas(player, droneThrowCost(ITEM))) {
        bar(player, "§cマナが足りません");
        return;
      }

      // **ドローンを飛ばしているなら、機体から出す**（docs/spec/23-drone.md 5 章）
      const eye = droneMuzzle(player) ?? player.getHeadLocation();
      const dir = norm(player.getViewDirection());
      shots.push({
        owner: player.id,
        team,
        block: team === undefined ? PILLAR_LOBBY : PILLAR[team],
        at: { x: eye.x + dir.x, y: eye.y + dir.y, z: eye.z + dir.z },
        dir,
        age: 0,
      });
      sound(player, "random.bow", 0.8, 0.7);
    });
  });
}
