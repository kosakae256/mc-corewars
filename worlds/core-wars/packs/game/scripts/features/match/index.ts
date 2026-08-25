/**
 * 試合の進行。
 *
 * 仕様は `docs/spec/11-match.md`。
 *
 * ## 状態は2つだけ
 *
 * ```
 *          /game:start
 *   非開始 ─────────────→ 開始
 *     ↑                    │
 *     └────────────────────┘
 *        コアが 0 / /game:stop / /game:abort
 * ```
 *
 * ## 停止と強制終了の違い
 *
 * | | 意味 | 後片付け |
 * | --- | --- | --- |
 * | `/game:stop` | いったん止める | **しない**（続きから再開できる） |
 * | `/game:abort` | 無かったことにする | **する** |
 * | コアが 0 | 決着 | **する** |
 *
 * **停止で片付けないのが要点。**
 * 不具合を直したい、人を待ちたい、で止めることがある。
 * そこで盤面を消すとやり直しになる。
 */

import {
  GameMode,
  ItemStack,
  system,
  world,
  Player,
  CommandPermissionLevel,
  CustomCommandStatus,
  PlayerPermissionLevel,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type CustomCommandRegistry,
} from "@minecraft/server";

import {
  coreStart,
  assignTeam,
  beginMatch,
  clearTeamOf,
  coreLeft,
  discardMatch,
  hostId,
  isPaused,
  isRunning,
  matchState,
  matchStateName,
  pauseMatch,
  resumeMatch,
  sessionId,
  setCelebrating,
  setHost,
  setPreparing,
  shouldBeInBattle,
  teamName,
  teamOf,
  type MatchState,
  type Team,
} from "../../lib/match-state.js";
import { ARENAS, CORE_BLOCK, arenaById, inBox, type Arena } from "../../lib/arena.js";
import { clearVault } from "../../lib/vault.js";
import { isOp } from "../../lib/op.js";
import { isMapBlock } from "../../lib/protection.js";
import { isEditor, toggleEditor } from "../protection/index.js";
import { grantSpawnProtection } from "../combat/index.js";
import { showTickingSetup } from "../ticking/index.js";
import { forceKit } from "../admin/index.js";
import { showWarp } from "../admin/warp.js";
import { resetToLobby } from "../lobby/reset.js";
import { fxCoreDown, fxGo, fxTick, titleAll, title } from "../../lib/fx.js";
import { celebrate } from "../finish/index.js";
import { openPriceEditor } from "../shop/price.js";
import { soundAll } from "../../lib/fx.js";
import { hasAgreed } from "../../lib/rules.js";
import { showRules } from "../lobby/rules-ui.js";
import { closeJoinWindow, wantsToJoin } from "../lobby/join.js";
import { manualTeams } from "../../lib/settings.js";
import { blockedReason } from "../../lib/timeout.js";
import { PHASE1_TICKS, beginPhases, resetPhases } from "../../lib/phase.js";
import { wearTeamHat } from "../cosmetic/index.js";
import { forceAlive, goDown, toggleDamageLog } from "../death/index.js";
import { lobbyPoint, resetLobbyPoint, setLobbyPoint } from "../../lib/lobby.js";
import { keeperCount } from "../shop/keeper.js";
import { opMessage, reportTo } from "../../lib/op.js";
import { generatorCount, rescanUntilFound } from "../generator/index.js";
import { clearEverything, giveLoadout, resetInventory } from "../loadout/index.js";
import {
  cleanupBusy,
  clearContainersJob,
  clearEntitiesJob,
  clearPlacedJob,
  forgetPlaced,
  markCleanup,
  placedCount,
  sweepPlaceableJob,
} from "../cleanup/index.js";

/**
 * 後片付けでチェストを探す範囲。
 *
 * **マップ全体。** [02-map.md](../../../docs/02-map.md) の座標から取る。
 * 拠点も中央も含む大きさにしてある。
 */
// **座標は lib/arena.ts が持つ。** ここには書かない

// ---------------------------------------------------------------- 演出の余地
/**
 * 演出を差し込む口。
 *
 * **いまは通知だけ。** あとでタイトル表示・音・花火をここに足す。
 *
 * > **呼び出し口を先に用意しておく**（`docs/spec/11-match.md` 6章）。
 * > 後から差し込もうとすると進行の途中に処理を挿すことになり、
 * > 状態の管理が壊れやすい。
 */
function onMatchStart(session: number): void {
  // **通し番号は出さない**（2026-08-25 変更）。
  // 何戦目かは遊ぶ側に意味が無く、**画面を長くするだけ**だった
  world.sendMessage(`§a試合開始§r （コア ${coreStart()}）`);
  // **フェーズ 1 はここから数える**（docs/spec/11-match.md 6-Z）。
  // カウントダウンの間は含めない——まだ動けない
  beginPhases();
  world.sendMessage(`§6フェーズ 1§r §e${PHASE1_TICKS / 20 / 60} 分間はコアを削れません`);
}

/**
 * 開始を押してから、チーム分けまで（tick）。**10 秒。**
 *
 * **切り替える時間を残す。**
 * 押した瞬間に締め切ると、参加・非参加を選び直せない。
 */
const GRACE_TICKS = 200;

/**
 * チーム分けから、開始まで（tick）。**10 秒。**
 *
 * 自分のチームと相手を確かめる時間。
 * **最後の 5 秒がカウントダウン**になる。
 */
const READY_TICKS = 200;

/** 開始時に配る鉄（`docs/spec/11-match.md` 7-4） */
const STARTER_IRON = 32;

/** 開始時に配る金 */
const STARTER_GOLD = 16;

/** 決着の演出が終わるまで（tick）。**3 秒 + 10 秒 + 余白** */
const CELEBRATION_TICKS = 60 + 200 + 40;

/**
 * 試合が終わった。
 *
 * **決着（コアが 0）ではここを通らない。**
 * あちらは `features/finish` が見せ方まで面倒を見る。
 *
 * ここは**強制終了のとき**だけ。
 */
function onMatchEnd(reason: string): void {
  // **必ず下ろす。** 立ったままだと、次に始めるまで状態が食い違う
  setPreparing(false);
  setCelebrating(false);
  resetPhases();
  world.sendMessage(`§c§l試合を強制終了しました§r §7（${reason}）`);
  world.sendMessage("§7全員をロビーへ戻します");
  // **すぐ戻す。** 強制終了は見せる場面ではない
  const at = lobbyPoint();
  for (const p of world.getAllPlayers()) {
    // **ロビーの人に戻す**（features/lobby/reset.ts に集約）。
    // 持ち物・装備・効果・帽子・観戦者、まとめて元に戻す
    resetToLobby(p, false);
    try {
      p.teleport(at, { dimension: p.dimension });
    } catch {
      /* 読み込まれていない */
    }
  }
}

/**
 * 開始前に数える。
 *
 * **コマンドを打った瞬間に始めない**（`docs/spec/15-presentation.md` 2章）。
 * 打った人以外は、いつ始まったか分からない。
 *
 * 数える間も無敵のままなので、**構える時間**になる。
 */
const COUNTDOWN = 5;

function countdown(then: () => void): void {
  for (let i = COUNTDOWN; i >= 1; i--) {
    system.runTimeout(
      () => {
        titleAll(`§e${i}`, undefined, 16);
        for (const p of world.getAllPlayers()) fxTick(p, i);
      },
      (COUNTDOWN - i) * 20
    );
  }
  system.runTimeout(() => {
    // **副題は付けない**（2026-08-25 変更）。
    // 目的は猶予の始めにチャットで流してある（docs/spec/11-match.md 7-0）。
    // ここは合図なので、短いほうがよい
    titleAll("§a開始！", undefined, 30);
    for (const p of world.getAllPlayers()) fxGo(p);
    then();
  }, COUNTDOWN * 20);
}

// ---------------------------------------------------------------- チーム分け
/**
 * **途中参加のチームを決める**（`docs/spec/11-match.md` 5-A）。
 *
 * | 順 | 見るもの | 入れる先 |
 * | --- | --- | --- |
 * | 1 | 人数 | 少ないほう |
 * | 2 | コアの残り | 少ないほう（負けている側） |
 * | 3 | — | 運 |
 *
 * **傾いている側を起こす側に回す。**
 * 人数が同じでも、削られている側は押され続けているということなので、
 * そちらに足す。
 *
 * 以前は 3 番目が「常に赤」だった。
 * **開始直後は必ず同数・同点**なので、
 * **最初の途中参加者はいつも赤**に入っていた。
 */
function pickTeam(): Team {
  let red = 0;
  let blue = 0;
  for (const p of world.getAllPlayers()) {
    const t = teamOf(p);
    if (t === "red") red++;
    else if (t === "blue") blue++;
  }
  if (red !== blue) return red < blue ? "red" : "blue";

  // ---- 人数が同じ。**負けている側へ**
  const a = ARENAS[0];
  const leftRed = coreLeft(a.id, "red");
  const leftBlue = coreLeft(a.id, "blue");
  if (leftRed !== leftBlue) return leftRed < leftBlue ? "red" : "blue";

  // ---- どちらとも言えない。**運で決める**
  return coin();
}

/** 表か裏か */
function coin(): Team {
  return Math.random() < 0.5 ? "red" : "blue";
}

/**
 * 混ぜる（Fisher-Yates）。
 *
 * **元の配列は触らない。** 呼ぶ側の並びを壊さない
 */
function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * **開始時のチーム分け**（`docs/spec/11-match.md` 5-A）。
 *
 * **混ぜてから交互に配る。**
 *
 * 1 人ずつ「少ないほうへ」を適用すると、**入室順で組が決まる。**
 * いつも一緒に入る 2 人が、毎回同じ側に落ちる。
 *
 * 人数は必ず均等になる。**奇数のときに余る 1 人がどちらへ付くかも運。**
 */
function dealTeams(players: readonly Player[]): Map<string, Team> {
  const out = new Map<string, Team>();
  const first = coin();
  const other: Team = first === "red" ? "blue" : "red";
  shuffled(players).forEach((p, i) => out.set(p.id, i % 2 === 0 ? first : other));
  return out;
}

/**
 * **試合に加える。開始時も途中参加も、必ずここを通る。**
 *
 * ```
 *   /game:start  →  状態を「開始」に  →  居る人を全員 joinMatch
 *   途中で入室    →                      その人だけ joinMatch
 * ```
 *
 * **開始時に全員ぶんまとめて処理する形にしない。**
 * まとめてやると、途中参加のときに同じことを別に書くことになり、
 * **片方だけ直して食い違う**（実際にエンダーチェストで指摘を受けた）。
 *
 * ## ここで持ち物を空にする
 *
 * **持ち込みを許さない。** 前の試合の資源も、準備中に集めた物も持ち越さない。
 * エンダーチェストの中身も同じ理由で空にする。
 *
 * > エンダーチェストは**ブロックではなくプレイヤーに紐づく。**
 * > 拠点のブロックを空にしても消えない。だからここで消す。
 *
 * ## 抜けて戻った人
 *
 * **同じセッションなら元のチームに戻る。**
 * ただし**持ち物は空にする。** 戻るたびに装備を持ち込めると、
 * わざと抜けて入り直す抜け道になる。
 */
function joinMatch(player: Player, announce: boolean, fromStart = false, given?: Team): void {
  let team = teamOf(player);
  const returning = team !== undefined;
  if (team === undefined) {
    // **開始時は配られた組を使う**（`dealTeams`）。
    // 決まっていないのは途中参加なので、そのときだけ `pickTeam`
    team = given ?? pickTeam();
    assignTeam(player, team);
  }

  // **倒れたままにしない。**
  // 倒れて抜けた人が、次の試合で観戦者のまま始まるのを防ぐ
  //（docs/spec/14-death.md）
  forceAlive(player);

  // **持ち物とエンダーチェストを空にして、支給品だけにする**
  resetInventory(player);
  // **金庫も 0 に戻す**（docs/spec/22-vault.md 1 章）。
  // 前回貯めた分で開幕から装備が揃っては、1 試合ごとに区切る意味が無い。
  // **持ち物を空にするのと同じ場所で、同じ理由**で行う
  clearVault(player);
  grantSpawnProtection(player);
  setTeamSpawn(player, team);

  // **帽子をかぶせる**（docs/spec/15-presentation.md 7-2）
  wearTeamHat(player, team);

  // ---- 途中参加はその場で戦場へ送る
  //
  // **開始からの参加は、カウントダウンの後に送る**（sendToBattle）。
  // 待たせる理由が無いのは途中参加だけ。
  //
  // **支給の資源は渡さない**（docs/spec/11-match.md 7-4）。
  // 遅れて入るほうが得になってはいけない
  if (!fromStart) sendToBattle(player, false);

  if (announce) {
    player.sendMessage(returning ? `§7${teamName(team)} に戻った` : `§7${teamName(team)} に入った`);
  }

  // ---- **途中参加は全体に知らせる**（2026-08-26 追加 / `docs/spec/16-participation.md` 3 章）
  //
  // **人数が増えたことは、両チームに関わる。**
  //
  // 黙って増えると、
  // - 味方は**居るはずのない味方**を数え損ねる
  // - 敵は**居ないはずの敵**に不意を突かれる
  //
  // 開始からの参加は出さない。**始まった時点で顔ぶれを読み上げている**
  if (!fromStart) {
    try {
      world.sendMessage(
        returning
          ? `§7${player.name} が ${teamName(team)}§7 に戻りました`
          : `§7${player.name} が ${teamName(team)}§7 に途中参加しました`
      );
    } catch {
      /* 送れなかった。**参加そのものは済んでいる** */
    }
  }
}

/**
 * リスポーン地点をチームの拠点にする。
 *
 * **死んだら自陣に戻る。** これが無いとワールドのスポーン地点へ飛ばされ、
 * 戦線に戻れなくなる。
 *
 * ## どのアリーナか
 *
 * いまは会場が 1 つなので先頭を使う。
 * 複数同時開催をやるなら、**その人がどのアリーナに居るか**で選ぶことになる
 *（`docs/spec/11-match.md` 6-A の「残る作業」）。
 */
function setTeamSpawn(player: Player, team: Team, arena: Arena = ARENAS[0]): void {
  const at = arena.spawns[team];
  try {
    player.setSpawnPoint({ dimension: player.dimension, x: at.x, y: at.y, z: at.z });
  } catch {
    // **失敗しても進む。** 座標が読み込まれていないだけのことがある
  }
}

// ---------------------------------------------------------------- 後片付け
function* cleanupJob(report: Player | undefined, attempt: number): Generator<void, void, void> {
  // **かかった時間を出す。** 長ければ範囲か粒度を見直す手がかりになる
  const startedAt = system.currentTick;
  const dim = world.getDimension("overworld");
  if (attempt === 1) {
    reportTo(report, "§7片付けを始めます。終わるまで §f/game:start§7 は使えません");
  }
  // **走査した数と、読めなかった数も数える。**
  // 「0 個」が「無かった」なのか「読めなかった」なのかを分けるため
  const blocks = { removed: 0, scanned: 0, unreadable: 0 };
  const chests = { emptied: 0, scanned: 0, unreadable: 0 };

  yield* clearPlacedJob(dim, blocks);
  // **全アリーナぶん片付ける**
  for (const a of ARENAS) {
    yield* clearContainersJob(dim, a.bounds.min, a.bounds.max, chests);
    // **記録が消えていても消せるように、種類でも掃き取る**
    //（docs/spec/11-match.md 6-B）
    yield* sweepPlaceableJob(dim, a.bounds.min, a.bounds.max, blocks);
  }

  // **持ち物には触らない。**
  // 空にするのは「試合に加わるとき」の仕事（joinMatch）。
  // 両方でやると、どちらが正か分からなくなる

  markCleanup(false);
  const sec = Math.round((system.currentTick - startedAt) / 20);
  const scanned = blocks.scanned + chests.scanned;
  const bad = blocks.unreadable + chests.unreadable;

  // ---- **読めなかった場所が残っていたら、やり直す**
  //
  // 一度で終わらせると、読み込みの進み具合で毎回違う結果になる
  if (bad > 0 && attempt < CLEANUP_RETRY) {
    const again = `§7読めない場所が ${bad.toLocaleString()} マス。${CLEANUP_WAIT / 20} 秒待ってやり直します §8(${attempt}/${CLEANUP_RETRY})`;
    reportTo(report, again);
    system.runTimeout(() => runCleanup(report, attempt + 1), CLEANUP_WAIT);
    return;
  }

  const msg =
    `§7片付け完了 ブロック ${blocks.removed} / チェスト ${chests.emptied} §8(${sec} 秒)
` +
    `§8  走査 ${scanned.toLocaleString()} マス` +
    (bad > 0
      ? ` / §c読めなかった ${bad.toLocaleString()} マス§8（${CLEANUP_RETRY} 回試しても読めず）`
      : " / 全部読めた");
  reportTo(report, msg);
}

/**
 * 場内のエンティティを消す。
 *
 * **試合を始めるたびに行う。** 前の試合の落とし物を持ち込ませない。
 */
function* clearArenaEntitiesJob(): Generator<void, void, void> {
  const dim = world.getDimension("overworld");
  const out = { removed: 0 };
  for (const a of ARENAS) {
    yield* clearEntitiesJob(dim, a.bounds.min, a.bounds.max, out);
  }
  if (out.removed > 0) opMessage(`§7場内のエンティティを ${out.removed} 体 消した`);
}

/**
 * 片付けをやり直す回数。
 *
 * **読めなかった場所が残っていたら、もう一度回す。**
 *
 * 読み込みが間に合っていない場所は「何も無い」と同じ扱いになるので、
 * **一度で終わらせると毎回違う結果になる**（2026-08-25 の
 * 「チェストの数が変動する」）。
 */
const CLEANUP_RETRY = 3;

/** やり直すまでの間（tick）。**読み込みを待つ** */
const CLEANUP_WAIT = 60;

function runCleanup(report: Player | undefined, attempt = 1): void {
  system.run(() => {
    // **動いている間は開始を拒否する**（docs/spec/11-match.md 7-5）
    markCleanup(true);
    system.runJob(cleanupJob(report, attempt));
  });
}

// ---------------------------------------------------------------- 進行
/** 試合を始める */
/**
 * 試合を始める。
 *
 * **プレイヤーから見える順番を決めてある**（`docs/spec/11-match.md` 7章）。
 *
 * ```
 * [ロビー] 「ゲームを開始します」
 *     ↓  1 秒
 * チーム分け                    ← ここで「参加した」ことになる
 *     ↓  2 秒
 * ルールをチャットに流す
 *     ↓  2 秒
 * 5 … 4 … 3 … 2 … 1
 *     ↓
 * 「スタート」 ＋ 同時に自陣へテレポート
 * ```
 */
function startMatch(by: Player): string {
  if (isRunning()) return "もう始まっている";
  // **一時停止中に新規開始させない。**
  // 間違えて押すと、コアの残りも盤面も捨てることになる
  if (isPaused()) {
    return (
      "§c一時停止中です。§f/game:resume§c で続きから再開できます\n" +
      "§7新しく始めたいなら、先に §f/game:abort§7 で捨ててください"
    );
  }
  // ---- **片付けが終わっていなければ始めない**（docs/spec/11-match.md 7-5）
  //
  // 途中で始めると、始めたあとに片付けが走って
  // **新しい試合の物を消す**
  if (cleanupBusy()) return "§c片付けが終わっていません。終わってから始めてください";

  // **始める前に片付ける。** 前の試合の残りを持ち込まない
  forgetPlaced();
  const session = beginMatch();
  // **試合を始めた人を運営主として覚える。** 名前ではなく id
  setHost(by.id);

  // **先にマップを読み込み続ける状態にする**（docs/spec/11-match.md 6-C）。
  // これをやらないと、離れた島のジェネレータが見つからず、そのあと一生湧かない

  // **場内のエンティティを消す。**
  // 前の試合で落ちた資源、置かれた実体、湧いた敵
  system.runTimeout(() => {
    system.runJob(clearArenaEntitiesJob());
  }, 20);

  // ---- 段取り（docs/spec/11-match.md 7章）
  //
  // **準備中の印を立てる。** これが立っている間、誰も戦場に居ないことになる
  setPreparing(true);
  titleAll("§e§lゲームを開始します", `§7${GRACE_TICKS / 20} 秒後にチーム分け`, 60);
  soundAll("random.click", 1.2, 0.8);
  world.sendMessage(`§e試合の準備を始めます§r §7（${GRACE_TICKS / 20} 秒後にチーム分け）`);
  world.sendMessage("§7いま切り替えれば、参加・非参加を選べます");
  world.sendMessage(`§6コアを ${coreStart()} 回壊したほうが勝ち§r`);

  // ---- チーム分け（= 参加の瞬間）
  system.runTimeout(() => {
    assignAll();
    // **ここで場が動き出す**（docs/spec/11-match.md 7-1）。
    // テレポートしてから始めると、着いた瞬間に何も動いていない
    rescanUntilFound(undefined);
    titleAll("§aチーム分け完了", `§7${READY_TICKS / 20} 秒後に開始`, 50);
  }, GRACE_TICKS);

  // ---- 5,4,3,2,1（開始のちょうど 5 秒前から）
  system.runTimeout(
    () => {
      countdown(() => {
        // **表示と同時に戦場へ送る**（docs/spec/11-match.md 7-2）
        setPreparing(false);
        for (const p of world.getAllPlayers()) sendToBattle(p, true);
        onMatchStart(session);
      });
    },
    GRACE_TICKS + READY_TICKS - COUNTDOWN * 20
  );

  return "試合を始めた";
}

/**
 * チーム分け。**参加の瞬間。**
 *
 * 参加しないことを選んだ人は入れない
 *（`docs/spec/16-participation.md` 2章）。
 * ルールに同意していない人も入れない（同 1-3）。
 */
/**
 * ルールに同意しているか。**していなければ、その場で画面を出す。**
 *
 * **参加させる経路すべてがここを通る**（`docs/spec/16-participation.md` 1-3）。
 *
 * 呼ぶ側それぞれに判定を書くと、**経路が増えたときに必ず1つ漏れる。**
 * 実際、途中参加は看板の側でだけ見ていて、
 * `joinNow` を直接呼べば素通りできる形になっていた。
 */
function agreedOrAsk(player: Player): boolean {
  if (hasAgreed(player)) return true;
  player.sendMessage("§cルールに同意していないので参加できません");
  // **その場で出す。** 看板を探させると、なぜ入れないのか気づけない
  showRules(player);
  return false;
}

function assignAll(): void {
  // ---- **手動なら、所属が決まっている人だけ**（docs/spec/19-admin-menu.md 4 章）
  //
  // 腕前が偏っているときに自動で振られると、**やり直す手段が無い。**
  // 運営が設定メニューから決めた組を、そのまま使う
  const manual = manualTeams();

  // ---- **入る人を先に決めてから配る**（2026-08-25 変更）
  //
  // 以前は 1 人ずつ「少ないほうへ」入れていたので、
  // **入室順で組が決まっていた**（`docs/spec/11-match.md` 5-A）。
  //
  // 全員そろってからでないと混ぜられないので、**選ぶのと配るのを分ける。**
  const entering: Player[] = [];
  for (const p of world.getAllPlayers()) {
    // **タイムアウト中は入れない**（docs/spec/19-admin-menu.md 6 章）
    const blocked = blockedReason(p);
    if (blocked !== undefined) {
      p.sendMessage(blocked);
      continue;
    }
    if (manual) {
      if (teamOf(p) === undefined) {
        // **黙って弾かない。** 理由が分からないと直しようが無い
        p.sendMessage("§7手動のチーム分けです。運営に組を決めてもらってください");
        continue;
      }
      if (!agreedOrAsk(p)) continue;
      entering.push(p);
      continue;
    }
    if (!wantsToJoin(p)) {
      p.sendMessage("§7非参加を選んでいるので、試合には入りません");
      continue;
    }
    if (!agreedOrAsk(p)) continue;
    entering.push(p);
  }

  // **手動なら運営が決めた組がそのまま残る**（`joinMatch` は所属を上書きしない）
  const dealt = dealTeams(entering);
  let n = 0;
  for (const p of entering) {
    joinMatch(p, true, true, dealt.get(p.id));
    n++;
  }
  // **参加を締め切る**（docs/spec/16-participation.md 2-1）
  closeJoinWindow();

  // ---- **誰も入らなかったら知らせる**
  //
  // 黙って進むと、カウントダウンだけ流れて誰もテレポートされず、
  // **何が起きたのか分からない**（2026-08-24 の「戦場にtpしない」）
  if (n === 0) {
    if (manual) {
      world.sendMessage("§c参加者が 0 人です。手動のチーム分けなのに、誰にも組が付いていません");
      world.sendMessage("§7設定（コンパス）→ プレイヤー管理 から決めてください");
    } else {
      world.sendMessage("§c参加者が 0 人です。ルールに同意していないか、全員が非参加です");
      world.sendMessage("§7ロビーの §f[ルール]§7 看板、または中央スロットの札で切り替えてください");
    }
    return;
  }
  world.sendMessage(`§aチーム分け完了§r §7${n} 人`);
  announceRoster();
}

/**
 * 誰がどちらに入ったかを出す。
 *
 * **チーム分けの瞬間に一度だけ。**
 * 自分の所属は本人に伝わるが、
 * **相手が誰かは全体に出さないと分からない。**
 */
function announceRoster(): void {
  for (const team of ["blue", "red"] as const) {
    const names = world
      .getAllPlayers()
      .filter((p) => teamOf(p) === team)
      .map((p) => p.name);
    if (names.length === 0) {
      world.sendMessage(`${teamName(team)}§7  （誰も居ません）`);
      continue;
    }
    world.sendMessage(`${teamName(team)}§7 (${names.length})  §f${names.join("§7, §f")}`);
  }
}

/**
 * 戦場へ送る。
 *
 * **支給の 3D Maneuver Gear はここで配る**
 *（`docs/spec/13-grapple.md` 6章）。
 * カウントダウン中に持っていると、始まる前に飛び出せる。
 */
function sendToBattle(player: Player, withStarter: boolean): void {
  const team = teamOf(player);
  if (team === undefined) return;
  try {
    player.teleport(ARENAS[0].spawns[team], { dimension: player.dimension });
  } catch {
    /* 読み込まれていない。リスポーン地点は設定済み */
  }

  // ---- **体力を戻す**（2026-08-24 追加）
  //
  // 戻していなかったので、**準備中に減っていた体力のまま始まっていた。**
  // 半分まで減った状態で始まれば、当然すぐ倒れる
  try {
    player.getComponent("minecraft:health")?.resetToMaxValue();
  } catch {
    /* 消えている */
  }

  // ---- **着いてから配る**（2026-08-24 変更）
  //
  // 前はチーム分けの時点で配っていたが、
  // **ロビーで装備が揃うのは順番がおかしい。**
  // 着いた瞬間に手元が整うほうが、始まった感じが出る
  giveLoadout(player);
  if (withStarter) giveStarter(player);
  grantSpawnProtection(player);
}

/**
 * 開始の支給（`docs/spec/11-match.md` 7-4）。
 *
 * **開始から居た人だけ。** 途中参加は受け取らない。
 * 遅れて入るほうが得になってはいけない。
 */
function giveStarter(player: Player): void {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (inv === undefined) return;
  try {
    inv.addItem(new ItemStack("minecraft:iron_ingot", STARTER_IRON));
    inv.addItem(new ItemStack("minecraft:gold_ingot", STARTER_GOLD));
  } catch {
    /* 入らなかった */
  }
}

/**
 * **続きから再開する。**
 *
 * ## 持ち物を空にしない（重要）
 *
 * 参加処理（`joinMatch`）は持ち物を空にする。新規参加では正しい。
 * だが**再開で全員を空にすると、集めた資源が消える。**
 * それは再開ではない。
 *
 * | 相手 | 何をするか |
 * | --- | --- |
 * | **既に所属がある人** | 無敵と支給品の確認だけ。**持ち物は触らない** |
 * | 所属が無い人（停止中に入ってきた） | 通常の参加処理（空にする） |
 */
function resume(): string {
  if (isRunning()) return "もう動いている";
  if (!isPaused()) return "一時停止していません。§f/game:start§r で始めてください";

  resumeMatch();
  rescanUntilFound(undefined);

  for (const p of world.getAllPlayers()) {
    const t = teamOf(p);

    // ---- **所属の無い人は入れない**（2026-08-24 修正）
    //
    // 以前はここで参加させていたが、
    // **止まっている間にロビーで見ていただけの人まで
    // 強制的に試合へ引き込んでいた。**
    //
    // 再開は「続きから始める」であって、募集ではない。
    // 入りたいなら**ロビーの `[参加]` 看板**から
    //（docs/spec/16-participation.md 3章）
    if (t === undefined) {
      p.sendMessage("§7試合が再開しました。§f[途中参加]§7 の看板から入れます");
      continue;
    }

    // **元から居た人。持ち物には触らない**
    // ただし**倒れたままにはしない**。止めている間に戻す
    forceAlive(p);
    grantSpawnProtection(p);
    giveLoadout(p);
    setTeamSpawn(p, t);
  }

  world.sendMessage("§a試合を再開§r §7（続きから）");
  return "再開した";
}

/**
 * 決着。
 *
 * **負けたチームを受け取る**（コアが 0 になったチーム）。
 */
export function finishMatch(loser: Team): void {
  // **フェーズを下ろす**（docs/spec/11-match.md 6-Z）
  resetPhases();
  if (!isRunning()) return;
  const winner: Team = loser === "red" ? "blue" : "red";
  setPreparing(false);
  discardMatch();
  world.sendMessage(`§6${teamName(winner)} の勝ち§r`);

  // **見せるのは `features/finish` に任せる**（docs/spec/15-presentation.md 4-3）。
  // 勝敗の表示 → 中央で花火 → ロビーで戦績、まで面倒を見る
  celebrate(winner, loser);

  // **片付けは演出のあと。**
  // 先に片付けると、中央に集める前にブロックが消えて見た目が変わる。
  //
  // **ティッキングエリアは外さない**（2026-08-24 変更）。
  // 外すとジェネレータが見つからなくなる
  system.runTimeout(() => runCleanup(undefined), CELEBRATION_TICKS);
}

/**
 * コアが壊されたときに呼ぶ。
 *
 * **まだ数える仕組みが無いので、いまは呼ばれない。**
 * コアの検出を作ったらここに繋ぐ（`docs/01-rules.md` の未確定）。
 */
export function onCoreBroken(arenaId: string, team: Team, left: number): void {
  if (left > 0) return;
  const arena = arenaById(arenaId);
  world.sendMessage(`§6${arena?.label ?? arenaId}§r — ${teamName(team)} のコアが尽きた`);
  // **尽きた瞬間だけ大きく出す**（docs/spec/15-presentation.md 4-3）
  if (arena !== undefined) fxCoreDown(arena.cores[team]);
  finishMatch(team);
}

// ---------------------------------------------------------------- 登録
function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

const ok = (message: string): CustomCommandResult => ({
  status: CustomCommandStatus.Success,
  message,
});
const ng = (message: string): CustomCommandResult => ({
  status: CustomCommandStatus.Failure,
  message,
});

/**
 * **ワールドが起動したか。**
 *
 * `system.beforeEvents.startup` から立てる。
 * あそこは**ワールドロード時にしか走らない**ので、
 * 立っていれば「本当に起動した」と断言できる。
 */
let freshStart = false;

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function markFreshStart(): void {
  freshStart = true;
}

/** 一度だけ受け取る。**二度目からは false** */
function consumeFreshStart(): boolean {
  const v = freshStart;
  freshStart = false;
  return v;
}

/**
 * **落ちたので一時停止する。**
 *
 * 後片付けはしない。盤面はそのまま残す。
 * 運営主が戻って `/game:start` すれば続きから始められる。
 *
 * > 落ちたことと、試合を捨てることは別。**勝手に消さない。**
 */
function pauseByDisconnect(reason: string): void {
  if (!isRunning()) return;
  pauseMatch();
  world.sendMessage(`§e試合を一時停止しました§r （${reason}）`);
  world.sendMessage("§7盤面はそのままです。§f/game:resume§7 で続きから再開できます");
}

/**
 * 運営主が抜けた／ワールドが落ちたときに止める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerAutoPause(): void {
  // **クラフトを封じる。** 読み込みのたびに掛け直す
  system.run(() => enforceNoCrafting());

  // ---- 運営主が抜けた
  world.afterEvents.playerLeave.subscribe((ev) => {
    if (!isRunning()) return;
    if (ev.playerId !== hostId()) return;
    system.run(() => pauseByDisconnect("運営主が退出しました"));
  });

  // ---- ワールドが起動したなら、試合中のままはおかしい
  //
  // ## 見分け方（2 つの条件を「かつ」で見る）
  //
  // ### 1. `startup` の合図が立っている
  //
  // `system.beforeEvents.startup` は**ワールドロード時にしか走らない**
  // と資料にはある。だが**実際には `/reload` でも走っている**（実測）。
  // これだけでは足りない。
  //
  // ### 2. **プレイヤーが 1 人も居ない**
  //
  // これが決め手。
  //
  // | | この瞬間のプレイヤー |
  // | --- | --- |
  // | ワールドが起動した直後 | **居ない**（まだ入場していない） |
  // | `/reload` した | **居る**（打った本人が必ず居る） |
  //
  // **`/reload` は必ず誰かが打つ。** だから打った人が必ず居る。
  // 居ないなら、それは人の操作ではなく起動そのもの。
  system.run(() => {
    if (!consumeFreshStart()) return;
    if (!isRunning()) return;
    // **誰か居るなら `/reload`。** 止めない
    if (world.getAllPlayers().length > 0) return;
    pauseByDisconnect("ワールドが起動しました");
  });

  // ---- 運営主が決まっていなければ、居るオペレーターを充てる
  //
  // この仕組みより前に始めた試合は運営主が空になっている。
  // **空のままだと、抜けても止まらない。** 気づけないので埋めておく
  system.runInterval(() => {
    if (!isRunning() || hostId() !== undefined) return;
    for (const p of world.getAllPlayers()) {
      if (p.playerPermissionLevel !== PlayerPermissionLevel.Operator) continue;
      setHost(p.id);
      p.sendMessage("§7あなたを運営主として登録しました");
      return;
    }
  }, 100);
}

/**
 * **クラフトを封じる。**
 *
 * ## レシピの上書きだけでは足りない
 *
 * 作業台のレシピ 1179 件は、同じ識別子で上書きして無効にしてある
 *（`tools/gen-no-craft.mjs`）。
 *
 * だが**染色のように、JSON に存在しない組み込みのレシピがある。**
 * 実際に「赤い羊毛 + 骨粉 → 白い羊毛」が作れてしまった。
 * **ファイルが無いものは上書きできない。**
 *
 * ## ゲームルールで塞ぐ
 *
 * `doLimitedCrafting` は「**解放済みのレシピしか作れない**」という規則。
 * 解放は普通、進行度や実績で起きる。**この試合では何も解放しない**ので、
 * 結果として**何も作れなくなる。**
 *
 * > 単体では「禁止」ではないので当てにできないが、
 * > **レシピの上書きと重ねれば、取りこぼしを拾える。**
 *
 * ## それでも残る穴
 *
 * 一番確実なのは**材料を持ち込ませないこと。**
 * 染料も骨粉もショップで売らなければ、染色は起こりえない
 *（`docs/03-content.md`）。
 */
function enforceNoCrafting(): void {
  world.gameRules.doLimitedCrafting = true;
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerMatchCommands(registry: CustomCommandRegistry): void {
  /**
   * コマンドを登録する。
   *
   * ## 中身は必ず次の tick へ逃がす（重要）
   *
   * **カスタムコマンドのコールバックは restricted execution**
   *（`docs/imp.md` 5.1）。world の状態を変更できない。
   *
   * 持ち物を空にする・効果を付ける・動的プロパティを書く、はすべて変更にあたる。
   * コールバックの中で直接やると
   * `native function [container::clearAll] cannot be used in restricted execution`
   * のような実行時エラーになる。**実際に踏んだ。**
   *
   * だから**受け付けたことだけを返し、仕事は `system.run` の中で行う。**
   * 結果は `sendMessage` で後から伝える。
   */
  const simple = (name: string, description: string, run: (player: Player) => string): void => {
    registry.registerCommand(
      { name, description, permissionLevel: CommandPermissionLevel.Admin },
      (origin: CustomCommandOrigin): CustomCommandResult => {
        const player = playerOf(origin);
        if (player === undefined) return ng("プレイヤーから実行すること");
        // ---- **運営かどうかは、こちらでも見る**（2026-08-25 追加）
        //
        // 権限の段はゲーム側の設定次第で動く。
        // **「運営か」の判断は 1 箇所に集めてある**（`lib/op.ts`）ので、
        // そこも通す。二重でも困らない
        if (!isOp(player)) return ng("運営だけが使えます");
        system.run(() => {
          try {
            const msg = run(player);
            if (msg !== "") player.sendMessage(msg);
          } catch (e) {
            player.sendMessage(`§c失敗: ${String(e)}`);
          }
        });
        return ok("");
      }
    );
  };

  simple("game:start", "試合を始める", (p) => startMatch(p));

  simple("game:stop", "一時停止する（片付けない。/game:resume で続きから）", () => {
    if (!isRunning()) return "始まっていない";
    pauseMatch();
    // **ロビーへは戻さない**（docs/spec/11-match.md 6-H）。
    // 一時停止は自陣に留まる。`onMatchEnd` は強制終了のためのもの
    world.sendMessage("§e試合を一時停止しました§r §7（盤面はそのまま）");
    world.sendMessage("§7§f/game:resume§7 で続きから再開できます");
    return "一時停止した。§f/game:resume§r で続きから再開できます";
  });

  simple("game:resume", "一時停止した試合を、続きから再開する", () => resume());

  simple("game:abort", "試合を強制終了する（片付ける）", (p) => {
    discardMatch();
    onMatchEnd("強制終了");
    runCleanup(p);
    return "強制終了して片付け中…";
  });

  simple("game:clean", "後片付けだけを行う", (p) => {
    runCleanup(p);
    return "片付け中…";
  });

  simple("game:build", "マップを直せるようにする／戻す（自分だけ・オペレーター専用）", (p) => {
    const r = toggleEditor(p);
    if (!r.allowed) return "オペレーターだけが使えます";
    return r.on
      ? "§c編集モード 入§r。**あなただけマップを壊せます。**直し終わったらもう一度打つこと"
      : "§a編集モード 切§r。マップは守られます";
  });

  // ---- 待機所（docs/spec/15-presentation.md 1章）
  simple("game:setlobby", "いま立っている場所を待機所にする", (p) => {
    const at = { x: Math.floor(p.location.x) + 0.5, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 0.5 };
    setLobbyPoint(at);
    return `§a待機所を設定  §f${at.x} ${at.y} ${at.z}`;
  });

  simple("game:resetlobby", "待機所を初期値へ戻す", () => {
    resetLobbyPoint();
    const at = lobbyPoint();
    return `§7待機所を初期値へ戻した  §f${at.x} ${at.y} ${at.z}`;
  });

  simple("game:dmglog", "ダメージの中身を表示する／やめる（調査用）", () => {
    const on = toggleDamageLog();
    return on ? "§eダメージの表示 入" : "§7ダメージの表示 切";
  });

  simple("game:ticking", "マップを常時読み込む設定の手順を出す", (p) => {
    showTickingSetup((line) => p.sendMessage(line));
    return "";
  });

  simple("game:kit", "運営の道具を配り直す", (p) => forceKit(p));

  simple("game:host", "自分を運営主にする（抜けたら一時停止される）", (p) => {
    setHost(p.id);
    return "あなたを運営主にしました";
  });

  simple("game:status", "いまの状態を出す", (p) => {
    // **3 つの状態を必ず出す。**
    // 一時停止が「非開始」に見えていて、再開できることに気づけなかった
    const st = matchState();
    const lines = [`§e状態§r  ${matchStateName(st)}`];
    // **アリーナごとに出す。** 増えたときにそのまま並ぶ
    for (const a of ARENAS) {
      lines.push(
        `  ${a.label} — ${teamName("red")} ${coreLeft(a.id, "red")} / ${teamName("blue")} ${coreLeft(a.id, "blue")}`
      );
    }
    // **運営主を出す。** 空だと「抜けても止まらない」ことに気づけない
    const h = hostId();
    const hostPlayer = h === undefined ? undefined : world.getAllPlayers().find((q) => q.id === h);
    lines.push(`  運営主 ${h === undefined ? "§c未設定（/game:host）" : (hostPlayer?.name ?? "§7オフライン")}§r`);
    lines.push(`  記録した設置ブロック ${placedCount()}`);
    // **ジェネレータの把握数。** 0 なら湧かない。/game:regen で探し直す
    const gen = generatorCount();
    lines.push(`  ジェネレータ ${gen === 0 ? "§c0（湧きません。/game:regen）" : `§a${gen}`}§r`);
    // **ショップの店員。** 試合中しか居ない（docs/spec/12-shop.md 6章）
    const k = keeperCount();
    const okKeeper = st !== "running" ? k.alive === 0 : k.alive === k.want;
    lines.push(`  ショップの店員 ${okKeeper ? "§a" : "§c"}${k.alive}/${st === "running" ? k.want : 0}§r`);

    // **保護が効いているかを、その場で確かめられるようにする。**
    // 「壊せた」ときに、権限のせいなのか不具合なのかを切り分けるため
    const op = p.playerPermissionLevel === PlayerPermissionLevel.Operator;
    lines.push(
      `§e保護§r  あなた=${isEditor(p.id) ? "§c編集モード（壊せる）§r" : "§a守られる§r"}` +
        `${op ? " §7/ オペレーター（/game:build が使える）" : ""}`
    );
    // ---- **運営の道具が配られる条件を出す**（2026-08-25 追加）
    //
    // 「配られない」と言われたとき、
    // **どの条件で外れているか**が分からないと直せない
    lines.push(
      `§e運営§r  権限=${p.playerPermissionLevel}` +
        `（運営は ${PlayerPermissionLevel.Operator}）` +
        ` / モード=${p.getGameMode()}` +
        ` / 戦場に居る=${shouldBeInBattle(p) ? "はい" : "いいえ"}`
    );

    // **コアが正しく置かれているかを出す。**
    // 「壊しても戻らない」と言われたとき、位置が合っているかを真っ先に疑うため
    for (const a of ARENAS) {
      for (const team of ["red", "blue"] as const) {
        const c = a.cores[team];
        let actual = "§c読み込まれていない";
        try {
          const b = p.dimension.getBlock(c);
          if (b !== undefined) {
            actual =
              b.typeId === CORE_BLOCK[team]
                ? `§a${b.typeId.replace("minecraft:", "")}`
                : `§c${b.typeId.replace("minecraft:", "")}（期待: ${CORE_BLOCK[team].replace("minecraft:", "")}）`;
          }
        } catch {
          /* 読み込まれていない */
        }
        lines.push(`  コア ${teamName(team)} (${c.x},${c.y},${c.z}) → ${actual}§r`);
      }
    }

    // 足元と目の前のブロックが守られているかを出す
    const under = p.dimension.getBlock({
      x: Math.floor(p.location.x),
      y: Math.floor(p.location.y) - 1,
      z: Math.floor(p.location.z),
    });
    if (under !== undefined) {
      lines.push(
        `  足元 ${under.typeId.replace("minecraft:", "")} → ${isMapBlock(under.typeId) ? "§a守る§r" : "§7守らない§r"}`
      );
    }
    for (const q of world.getAllPlayers()) {
      const t = teamOf(q);
      lines.push(`  ${q.name} — ${t === undefined ? "§7未所属" : teamName(t)}`);
    }
    p.sendMessage(lines.join("\n"));
    return "";
  });
}

/**
 * 途中参加・復帰を受け付ける。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない（実際に事故った）。
 */
export function registerMatchJoin(): void {
  world.afterEvents.playerJoin.subscribe((ev) => {
    const state = matchState();
    if (state === "idle") return;

    // **参加した直後はまだ実体が無い。** 少し待ってから探す
    system.runTimeout(() => {
      const player = world.getAllPlayers().find((p) => p.id === ev.playerId);
      if (player === undefined) return;
      handleRejoin(player, state);
    }, 40);
  });
}

/**
 * 再参加したときの扱い。
 *
 * 仕様は `docs/spec/11-match.md` 6-E。
 *
 * ```
 *   一時停止中に戻ってきた   → 自陣へテレポート。**殺さない**
 *   試合中・自拠点の中        → そのまま。持ち物も触らない
 *   試合中・自拠点の外        → **死亡させる**
 *   チームが無い（新規）      → 通常の参加処理（持ち物を空にする）
 * ```
 *
 * ## なぜ拠点の外だと死亡させるのか
 *
 * **負けそうになったら抜ければいい、が成立してしまう。**
 *
 * 戦っている最中に切断して、落ち着いてから戻れば無傷。
 * それを許すと、劣勢のときに抜けるのが最適手になる。
 *
 * **拠点の中に居たなら、逃げたのではなく普通に居ただけ。** そのままでよい。
 *
 * ## 一時停止中は殺さない
 *
 * **止まっている間の出入りに罰を与える理由が無い。**
 * ただし場所はばらばらなので、自陣へ戻す。
 */
function handleRejoin(player: Player, state: MatchState): void {
  const team = teamOf(player);

  // ---- チームが無い＝この試合に参加していない人
  //
  // **勝手に入れない**（2026-08-24 修正）。
  // 以前はここで参加させていたが、
  // **見に来ただけの人まで試合へ引き込んでいた。**
  //
  // 落ちて戻ってきた人は**同じセッションなら所属が残っている**ので、
  // ここには来ない（`teamOf` はセッションで区切っている）。
  //
  // 入りたいならロビーの `[参加]` 看板から
  //（docs/spec/16-participation.md 3章）
  if (team === undefined) {
    if (state === "running") {
      player.sendMessage("§7試合中です。§f[途中参加]§7 の看板から入れます");
    }
    return;
  }

  // ---- 一時停止中。**殺さず、自陣へ戻す**
  if (state === "paused") {
    const at = ARENAS[0].spawns[team];
    try {
      player.teleport(at, { dimension: player.dimension });
    } catch {
      /* まだ読み込まれていない。次の再開で整う */
    }
    setTeamSpawn(player, team);
    player.sendMessage(`§7${teamName(team)} に戻りました（一時停止中）`);
    return;
  }

  // ---- 試合中
  setTeamSpawn(player, team);

  if (inBox(ARENAS[0].bases[team], player.location)) {
    // **自拠点の中に居た。そのままでよい**
    grantSpawnProtection(player);
    giveLoadout(player);
    player.sendMessage(`§7${teamName(team)} に戻った`);
    return;
  }

  // **拠点の外に居た＝戦線から抜けた。** 倒れた扱いにする
  //
  // **ふつうに倒されたときとまったく同じ道を通す**（`features/death` の `goDown`）。
  // 持ち物も防具も落ち、効果も落ち、戦績に 1 死が付き、5 秒後に自陣へ戻る。
  //
  // **本物の死（`kill()`）は使わない**（docs/spec/14-death.md 1章）。
  // 復活の処理が走り、**チャットを開いていると
  // 「リスポーン中…」から戻れなくなる。**
  //
  // **倒した人は付けない。** 切断してから戻るまでに時間が空いており、
  // 誰と戦っていたかの記録はもう残っていない
  player.sendMessage("§c戦闘中に切断したため、倒れた扱いになりました");
  goDown(player);
}

/**
 * 途中参加させる。
 *
 * **ロビーの看板から呼ばれる**（`docs/spec/16-participation.md` 3章）。
 * 支給の資源は受け取らない（`fromStart` を渡さない）。
 */
export function joinNow(player: Player): void {
  if (!isRunning()) {
    player.sendMessage("§7いま試合は行われていません");
    return;
  }
  if (teamOf(player) !== undefined) {
    // **既に所属がある。** 戦場へ戻すだけ
    sendToBattle(player, false);
    player.sendMessage("§7戦場へ戻りました");
    return;
  }
  // **タイムアウト中は入れない**（docs/spec/19-admin-menu.md 6 章）
  const blocked = blockedReason(player);
  if (blocked !== undefined) {
    player.sendMessage(blocked);
    return;
  }
  // **新しく加わるときは同意を確かめる**（2026-08-25 追加）
  if (!agreedOrAsk(player)) return;
  joinMatch(player, true);
}

/**
 * 運営の道具が押されたときの動き。
 *
 * **`features/admin` から呼ばれる。**
 * 進行の処理はここにあるので、実行はこちらで受ける。
 */
/**
 * 試合を始める。**設定メニューと自動開始から呼ぶ。**
 *
 * **`/game:start` とまったく同じ処理を通す**
 *（`docs/spec/19-admin-menu.md` 2 章）。
 * 入口が増えるだけで、進行そのものは 1 箇所にしかない。
 */
export function beginFromMenu(by: Player): string {
  return startMatch(by);
}

/**
 * その人の所属を変える。**設定メニューから呼ぶ。**
 *
 * 試合中なら**その場で自陣へ移す。**
 * 敵陣のど真ん中に立ったままにしない（`docs/spec/19-admin-menu.md` 6 章）。
 */
export function forceTeam(player: Player, team: Team): void {
  // ---- **持ち物・エンダーチェスト・装備・効果・体力を全部戻す**
  //
  // 組を変えるのは**別の人として入り直す**のと同じ。
  // 前の側で買ったものを持ち越せると、
  // **両チームを行き来して溜め込める**（`docs/spec/19-admin-menu.md` 6 章）
  clearEverything(player);

  assignTeam(player, team);

  // **試合中なら、入り直したのと同じ扱いにする**（支給品・帽子・自陣へ）
  if (isRunning()) {
    joinMatch(player, true);
    return;
  }

  // 非開始。**組だけ決めて、ロビーの支給品を配る**
  setTeamSpawn(player, team);
  giveLoadout(player);
}

/** その人の所属を外す。**試合から抜けさせる** */
export function clearTeam(player: Player): void {
  clearTeamOf(player);
  resetToLobby(player, true);
}

export function runAdminCommand(player: Player, cmd: string): void {
  switch (cmd) {
    case "start":
      player.sendMessage(startMatch(player));
      break;
    case "build": {
      const r = toggleEditor(player);
      player.sendMessage(!r.allowed ? "§cオペレーターだけが使えます" : r.on ? "§c編集モード 入" : "§a編集モード 切");
      break;
    }
    case "abort":
      // **`/game:abort` と同じ**（docs/spec/19-admin-menu.md 2 章）
      discardMatch();
      onMatchEnd("強制終了");
      runCleanup(player);
      player.sendMessage("§7強制終了して片付け中…");
      break;
    case "clean":
      runCleanup(player);
      player.sendMessage("§7片付け中…");
      break;
    case "status":
      player.sendMessage(`§e状態§r  ${matchStateName(matchState())}`);
      break;
    case "price":
      openPriceEditor(player);
      break;
    case "warp":
      showWarp(player);
      break;
    default:
      break;
  }
}
