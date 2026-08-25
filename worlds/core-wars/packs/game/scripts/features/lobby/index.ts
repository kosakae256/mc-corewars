/**
 * 待機所。
 *
 * 仕様は `docs/spec/15-presentation.md` 1章・6章。
 *
 * ## 何をするか
 *
 * **試合をしていない間、決まった場所に居させる。**
 *
 * 決めておかないと、前の試合が終わった場所に散らばったままになる。
 * 相手の拠点の中に居座ることもできてしまう。
 *
 * ## 縛りすぎない
 *
 * **毎 tick 引き戻したりはしない。**
 * 非開始中はマップを直したり試したりする時間でもあるので、
 * **動けなくすると邪魔になる。**
 *
 * 移すのは**入ってきたときだけ。**
 *
 * 以前は「戦闘範囲の外に居たら戻す」も回していたが、
 * **ロビー自体が範囲の外にある。**
 * 自分で自分を掴み、3 秒ごとに引き戻していた（2026-08-24）。
 */

import { system, world } from "@minecraft/server";

import { ARENAS } from "../../lib/arena.js";
import { isRunning, matchState, teamOf } from "../../lib/match-state.js";
import { lobbyPoint } from "../../lib/lobby.js";
import { title } from "../../lib/fx.js";
import { giveLoadout } from "../loadout/index.js";
import { hasStaleState, resetToLobby } from "./reset.js";
import { hasAgreed } from "../../lib/rules.js";
import { showRules } from "./rules-ui.js";
import { isWatching } from "../spectate/index.js";

/**
 * 支給品を確かめ直す間隔（tick）。**5 秒**。
 *
 * **持っているかを見るだけ**なので、細かく回す理由が無い。
 * 何かの拍子に失っても 5 秒で戻る。
 */
const KIT_INTERVAL = 100;

/** 待機所へ移す */
function toLobby(playerId: string): void {
  const player = world.getAllPlayers().find((p) => p.id === playerId);
  if (player === undefined) return;
  try {
    player.teleport(lobbyPoint(), { dimension: player.dimension });
    title(player, "", "§7試合はまだ始まっていません", 30);
  } catch {
    /* 読み込まれていない。次の機会に */
  }
}

/**
 * 入ってきた人を受け入れる。
 *
 * | 状態 | どうするか |
 * | --- | --- |
 * | 試合中 | **`features/match` が拾う**（joinMatch で自陣へ） |
 * | 一時停止中 | 所属があれば自陣、無ければ待機所 |
 * | 非開始 | **待機所** |
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerLobby(): void {
  world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const player = ev.player;
    // **試合中は match 側が自陣へ移す。** ここで触ると二重になる
    if (isRunning()) return;

    // **少し待つ。** 入った直後はまだ読み込まれていない
    system.runTimeout(() => {
      const team = teamOf(player);
      // 一時停止中で所属があるなら自陣へ（docs/spec/11-match.md 6-H）
      if (matchState() === "paused" && team !== undefined) {
        try {
          player.teleport(ARENAS[0].spawns[team], { dimension: player.dimension });
          title(player, "", "§e一時停止中です", 30);
        } catch {
          /* 読み込まれていない */
        }
        return;
      }
      toLobby(player.id);

      // ---- **未同意なら、その場でルールを見せる**
      //
      // 同意していないと**チーム分けで黙って弾かれる**
      //（docs/spec/16-participation.md 1-3）。
      // 看板を探させると、なぜ入れないのか気づけない
      if (!hasAgreed(player)) {
        system.runTimeout(() => showRules(player), 40);
      }
    }, 40);
  });

  // ---- **ロビーに居る人は、持っているかを見て配り直す**（2026-08-24 追加）
  //
  // 3D Maneuver Gear はロビーでも使える（docs/spec/13-grapple.md 6章）。
  // **練習させたいのに、手元に無ければ試せない。**
  //
  // **配ったきりにしない。**
  // クリエイティブで消した、何かの拍子に失った、
  // 途中で入ってきた——どの経路でも 5 秒で戻る。
  //
  // 参加の札は `features/lobby/join.ts` が同じ間隔で見ている。
  // どちらも**枠から動かせず、捨てられない**
  system.runInterval(() => {
    // ---- **試合中も回す。ただし出ていない人だけ**（2026-08-25 修正）
    //
    // 以前は**試合中はまるごと回さなかった。**
    // そのせいで、
    //
    // | 誰 | どうなっていたか |
    // | --- | --- |
    // | **試合中に入ってきた人** | ロビーに居るのに**手ぶら** |
    // | **観戦から戻った人** | 同じく**手ぶら** |
    //
    // ロビーの装備は**練習用**（`docs/spec/13-grapple.md` 6 章）なので、
    // **試合をしているかどうかとは関係が無い。**
    //
    // 止めたかったのは「**試合に出ている人に手を出すこと**」だけ——
    // `preparing` で帽子を名残りと見なして**所属ごと消していた**
    //（`docs/spec/11-match.md` 6-Y）。
    // ならば**所属で外せばよい。**
    const state = matchState();

    for (const player of world.getAllPlayers()) {
      // **試合に出ている人はここでは触らない。**
      // 装備も体力も `features/match` と `features/death` の持ち場
      if (state !== "idle" && teamOf(player) !== undefined) continue;
      // ---- **観戦中の人は対象外**（2026-08-25 追加）
      //
      // `hasStaleState` は**観戦者を「名残り」と見なす**ので、
      // ここを通すと**サバイバルに戻され、観戦の側が戻し直す**——
      // 押し合ってちらつく（`docs/spec/20-spectate.md`）
      if (isWatching(player.id)) continue;

      // ---- **前の試合の名残りを落とす**（2026-08-25 追加）
      //
      // 別のセッションで戻ってきた人は所属が外れるが、
      // **装備・効果・帽子は残ったまま**だった。
      //
      // 戻すべき状態は 1 つしかないので、`resetToLobby` に集めてある
      // ---- **名残りを落とすのは非開始のときだけ**
      //
      // 試合中に落とすと、**運営がスペクテイターで見て回っている**のを
      // 名残りと見なして生存に戻してしまう
      if (state === "idle" && hasStaleState(player)) resetToLobby(player, false);

      giveLoadout(player);

      // ---- **ロビーでは常に満タン**（2026-08-24 追加）
      //
      // 減ったまま試合が始まると、**2 発で倒れる。**
      // 戦場へ送るときにも戻しているが、
      // ロビーで減った状態を残しておく理由がそもそも無い
      try {
        const h = player.getComponent("minecraft:health");
        if (h !== undefined && h.currentValue < h.effectiveMax) h.resetToMaxValue();
      } catch {
        /* 消えている */
      }
    }
  }, KIT_INTERVAL);

  // ---- 場外の見張りは置かない
  //
  // **以前は「非開始で戦闘範囲の外に居たらロビーへ戻す」を回していたが、
  // ロビー自体が範囲の外にある。**
  // 自分で自分を掴み、3 秒ごとにロビーへ引き戻していた
  //（2026-08-24 の「5 秒おきに戻される」）。
  //
  // 奈落へ落ちた場合は `features/death` が拾うので、ここでは何もしない
}
