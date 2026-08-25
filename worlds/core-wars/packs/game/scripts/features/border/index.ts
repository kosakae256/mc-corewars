/**
 * 戦闘範囲（ワールドボーダー）。
 *
 * 仕様は `docs/spec/11-match.md` 6-F。
 *
 * ## Bedrock にワールドボーダーは無い
 *
 * **組み込みのコマンドが存在しない。** 自分で作る。
 *
 * | 案 | 採否 |
 * | --- | --- |
 * | バリアブロックで壁を作る | **不採用。** 300 x 140 の壁は数万ブロックになる |
 * | 出たら中へ戻す | **採用。** 判定は 6 回の比較で済む |
 * | 近づいたら粒子を出す | **採用。** バニラと同じ見た目にできる |
 *
 * ## 見た目はバニラのものを借りる
 *
 * `minecraft:rising_border_dust_particle` は
 * **バニラのワールドボーダーが使っている粒子そのもの。** 引数も要らない。
 *
 * 自前で作らない。**見慣れた見た目のほうが、境界だと伝わる。**
 *
 * ## 下は区切らない
 *
 * **奈落へ落ちるのはゲームの一部**（`docs/02-map.md` 2-A）。
 * y の下限は見ない。
 *
 * ## 上は頭で判定する
 *
 * 座標は**足元**を指す。天井を足元で見ると、
 * **体のぶんだけ丸ごと天井の外に出られる。**
 * 横の壁では起きない（体の幅が細いので目立たない）。
 */

import { bar } from "../../lib/fx.js";
import { GameMode, system, world, type Player, type Vector3 } from "@minecraft/server";

import { ARENAS, inBox, type Box } from "../../lib/arena.js";
import { matchState, shouldBeInBattle, teamOf } from "../../lib/match-state.js";
import { LOBBY_BOUNDS, lobbyPoint } from "../../lib/lobby.js";

/**
 * **バニラのワールドボーダーの粒子から、動きだけを止めたもの。**
 *
 * ## 経緯
 *
 * 1. `minecraft:rising_border_dust_particle` をそのまま使った
 *    → **見た目は良かったが上へ昇る。** 壁ではなく煙に見える
 * 2. 赤いぼやけた点を自作した
 *    → **のっぺりして格好悪かった**
 * 3. **バニラの定義を写して、上昇だけ外した** ← いまここ
 *
 * テクスチャ・大きさ・色・フリップブック（パラパラ変わる模様）は
 * **バニラのまま。** `particle_motion_dynamic`（上向きの加速）を外し、
 * `particle_motion_parametric` で**その場に固定**しただけ。
 *
 * > **見慣れた見た目のほうが、境界だと伝わる。**
 * > 自分で作るより、動きを直すほうが良かった。
 */
const BORDER_PARTICLE = "game:border_wall";

/**
 * 何 tick ごとに出し直すか。
 *
 * **粒子の寿命と必ず揃える**（`resource_packs/game/particles/border_wall.json`
 * の `max_lifetime` = 0.1 秒 = 2 tick）。
 *
 * | ずれると | 何が起きるか |
 * | --- | --- |
 * | 寿命 > 間隔 | 前のぶんが残って**重なり、明滅する** |
 * | 寿命 < 間隔 | 途切れて**点滅する** |
 *
 * **片方を変えたら、必ずもう片方も変える。**
 */
const INTERVAL = 2;

/**
 * **見える半径**（マス）。
 *
 * プレイヤーを中心にした球で切る。
 * 面の上に**丸く窓が開いた**ように見える。
 *
 * 近すぎると気づいたときには手遅れ。広すぎると視界が粒子だらけになる
 */
const SHOW_RADIUS = 6;

/**
 * 壁の粒子を置く間隔（マス）。
 *
 * **ぼやけた点なので、少し重なるくらいがちょうどよい。**
 * 粒子の大きさが 0.7 マスなので、1.5 マス間隔だと隙間なく繋がって見える
 */
const STEP = 1.5;

/**
 * 天井の粒子を置く間隔（マス）。
 *
 * **壁より粗くする。** 天井は面積が広く、同じ間隔だと数が跳ね上がる
 */
const CEILING_STEP = 2;

/** 押し戻したあと、境界からどれだけ内側に置くか */
const PUSH_IN = 1.5;

/**
 * プレイヤーの背丈（マス）。
 *
 * **座標は足元を指す。** 天井を足元で判定すると、
 * **体のぶんだけ丸ごとはみ出す**（実際に 2 マスほど超えられた）。
 *
 * 横の壁では起きない。横は体の幅が細く、ずれても目立たないため。
 */
const PLAYER_HEIGHT = 1.8;

/**
 * 天井に頭がついたとき、どれだけ下に置くか。
 *
 * **横の押し戻し（`PUSH_IN`）より小さくする。**
 * 上から 1.5 マス引き下ろされると、落とされたように感じる。
 * **頭をぶつけた程度**に留めたい。
 */
const CEILING_MARGIN = 0.2;

/** 押し戻しを知らせる間隔（tick） */
const NOTIFY_TICKS = 40;

const lastNotified = new Map<string, number>();

/**
 * 範囲の外に出ていたら、中へ戻した座標を返す。
 *
 * 中に居るなら `undefined`。**下は見ない**（奈落は正しい死に方）。
 */
function pushInside(box: Box, at: Vector3): Vector3 | undefined {
  let { x, y, z } = at;
  let moved = false;

  if (x < box.min.x) {
    x = box.min.x + PUSH_IN;
    moved = true;
  } else if (x > box.max.x) {
    x = box.max.x - PUSH_IN;
    moved = true;
  }
  if (z < box.min.z) {
    z = box.min.z + PUSH_IN;
    moved = true;
  } else if (z > box.max.z) {
    z = box.max.z - PUSH_IN;
    moved = true;
  }
  // **上だけ見る。** 下は奈落なので区切らない。
  //
  // **頭の位置で判定する。** 足元で見ると、
  // 天井の粒子より体のぶん（約 1.8 マス）上に出られてしまう
  if (y + PLAYER_HEIGHT > box.max.y) {
    y = box.max.y - PLAYER_HEIGHT - CEILING_MARGIN;
    moved = true;
  }

  return moved ? { x, y, z } : undefined;
}

/**
 * 境界を見せる。
 *
 * ## 半径で切る
 *
 * **プレイヤーからの距離で切る。** 面の上に丸く窓が開いたように見える。
 *
 * 以前は「前後 12 マス x 上下 8 マス」と四角く切っていたが、
 * **角が張って不自然だった。** 見えている範囲の形が、
 * 自分との距離と合っていなかった。
 *
 * 丸く切れば、**どの方向を見ても縁までの距離が同じ**になる。
 */
function showWalls(player: Player, box: Box): void {
  const p = player.location;
  const dim = player.dimension;
  const r = SHOW_RADIUS;
  const rr = r * r;

  /** 距離が半径の中なら粒子を出す */
  const put = (x: number, y: number, z: number): void => {
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    if (dx * dx + dy * dy + dz * dz > rr) return;
    if (x < box.min.x || x > box.max.x) return;
    if (z < box.min.z || z > box.max.z) return;
    try {
      dim.spawnParticle(BORDER_PARTICLE, { x, y, z });
    } catch {
      /* 読み込まれていない */
    }
  };

  /** x か z を固定した面を、プレイヤーの周りだけ描く */
  const wall = (fixed: "x" | "z", value: number): void => {
    // **その面までの距離ぶん、描ける範囲が狭まる。**
    // 遠い面ほど、見える窓は小さくなる
    const away = Math.abs((fixed === "x" ? p.x : p.z) - value);
    const reach = Math.sqrt(Math.max(0, rr - away * away));
    for (let t = -reach; t <= reach; t += STEP) {
      for (let dy = -reach; dy <= reach; dy += STEP) {
        if (fixed === "x") put(value, p.y + dy, p.z + t);
        else put(p.x + t, p.y + dy, value);
      }
    }
  };

  /** 天井。**上方向にも境界がある** */
  const ceiling = (): void => {
    const away = Math.abs(p.y - box.max.y);
    const reach = Math.sqrt(Math.max(0, rr - away * away));
    for (let dx = -reach; dx <= reach; dx += CEILING_STEP) {
      for (let dz = -reach; dz <= reach; dz += CEILING_STEP) {
        put(p.x + dx, box.max.y, p.z + dz);
      }
    }
  };

  if (p.x - box.min.x < r) wall("x", box.min.x);
  if (box.max.x - p.x < r) wall("x", box.max.x);
  if (p.z - box.min.z < r) wall("z", box.min.z);
  if (box.max.z - p.z < r) wall("z", box.max.z);
  if (box.max.y - p.y < r) ceiling();
}

function notify(player: Player, text: string): void {
  const now = system.currentTick;
  const last = lastNotified.get(player.id);
  if (last !== undefined && now - last < NOTIFY_TICKS) return;
  lastNotified.set(player.id, now);
  bar(player, text);
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function startBorder(): void {
  system.runInterval(() => {
    // **会場は 1 つ前提。** 増えたら「その人がどの会場に居るか」で選ぶ
    const arena = ARENAS[0];
    const state = matchState();

    const paused = state === "paused";
    const idle = state === "idle";

    for (const player of world.getAllPlayers()) {
      // ---- **クリエイティブは通す**（2026-08-25 追加）
      //
      // 運営はマップを直しに行く。**境界に阻まれると仕事にならない。**
      //
      // 遊ぶ人はクリエイティブにならないので、これで区別が付く
      try {
        if (player.getGameMode() === GameMode.Creative) continue;
      } catch {
        continue;
      }

      // ---- 観戦者は触らない
      //
      // **倒れている人**（docs/spec/14-death.md）はここを通る。
      // 押し戻すと、倒れた場所から飛ばされて何が起きたか分からなくなる。
      // どこへ行っても実害は無いので、そのままにする
      try {
        if (player.getGameMode() === GameMode.Spectator) continue;
      } catch {
        continue;
      }

      // ---- 一時停止中は自陣の建物から出られない
      //
      // **止まっている間に相手の陣地を見に行けると、
      // 再開したときに情報の差が付く。**
      //
      // 扱いはボーダーと同じ。**押し戻して、境界を見せる。** 殺さない
      // ---- **どの領域の人か**（docs/spec/15-presentation.md 1章）
      //
      // 試合中でも、場に居る人と居ない人が同時に存在する。
      //
      // | 誰 | 領域 |
      // | --- | --- |
      // | 戦場に居るべき人 | 戦闘範囲（一時停止中は自陣） |
      // | 参加していない人・**準備中の人** | ロビー |
      //
      // 判断は `shouldBeInBattle` に集めてある。
      // **ここで独自に考えると、必ずどこかで食い違う**
      const fighting = shouldBeInBattle(player);

      // ---- **ロビーの中に居る人は、何があっても押さない**
      //
      // 準備中に読み込み直した、途中で迷い込んだ、など
      // 想定していない経路で入ってくることがある。
      // **ロビーは常に安全**という受け皿を残しておく
      if (!fighting || inBox(LOBBY_BOUNDS, player.location)) {
        if (!inBox(LOBBY_BOUNDS, player.location)) {
          // 戦場に居るべきでないのに外に居る。**ロビーへ送る**
          try {
            player.teleport(lobbyPoint(), { dimension: player.dimension });
            notify(player, "§7ロビーの外には出られません");
          } catch {
            /* 読み込まれていない */
          }
          continue;
        }
        showWalls(player, LOBBY_BOUNDS);
        continue;
      }

      // ---- 戦場の領域
      const team = paused ? teamOf(player) : undefined;
      const box = team === undefined ? arena.bounds : arena.pauseBoxes[team];
      const back = pushInside(box, player.location);
      if (back !== undefined) {
        // ---- 一時停止中に外に居た
        //
        // **本来ここには来ない。** 一時停止に入る時点で自陣に居るはずで、
        // その後は押し戻しているので出られない。
        //
        // それでも来たなら、**壁際へ押し戻すのは中途半端。**
        // 建物のどこに戻すべきか分からないので、
        // **リスポーン地点（自陣の中央）へ戻す。** そこなら必ず正しい
        if (team !== undefined) {
          try {
            player.teleport(arena.spawns[team], { dimension: player.dimension });
            notify(player, "§c一時停止中は自陣から出られません");
          } catch {
            /* 戻せなかった。次の機会に */
          }
          continue;
        }

        // **殺さない。** 事故で出ることがあるし、
        // 奈落以外で死ぬ理由を増やしたくない
        try {
          player.teleport(back, { dimension: player.dimension });
          notify(player, team === undefined ? "§c戦闘範囲の外です" : "§c一時停止中は自陣から出られません");
        } catch {
          /* 戻せなかった。次の機会に */
        }
        continue;
      }
      showWalls(player, box);
    }
  }, INTERVAL);
}
