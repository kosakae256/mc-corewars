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
  CORE_MAX,
  assignTeam,
  beginMatch,
  coreLeft,
  discardMatch,
  hostId,
  isPaused,
  isRunning,
  matchState,
  matchStateName,
  type MatchState,
  pauseMatch,
  resumeMatch,
  setHost,
  sessionId,
  teamName,
  teamOf,
  type Team,
} from "../../lib/match-state.js";
import { ARENAS, CORE_BLOCK, arenaById, inBox, type Arena } from "../../lib/arena.js";
import { isMapBlock } from "../../lib/protection.js";
import { isEditor, toggleEditor } from "../protection/index.js";
import { grantSpawnProtection } from "../combat/index.js";
import { addTickingAreas, removeTickingAreas } from "../ticking/index.js";
import { keeperCount } from "../shop/keeper.js";
import { generatorCount, rescanUntilFound } from "../generator/index.js";
import { giveLoadout, resetInventory } from "../loadout/index.js";
import {
  clearContainersJob,
  clearEntitiesJob,
  clearPlacedJob,
  forgetPlaced,
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
  world.sendMessage(`§a試合開始§r （第 ${session} 戦 / コア ${CORE_MAX}）`);
}

function onMatchEnd(reason: string): void {
  world.sendMessage(`§e試合終了§r （${reason}）`);
}

function onTeamWin(team: Team): void {
  world.sendMessage(`§6${teamName(team)} の勝ち§r`);
}

// ---------------------------------------------------------------- チーム分け
/**
 * チームを割り当てる。
 *
 * **人数の少ないほうへ入れる。** 人数が不定（1〜15）なので、
 * 途中参加でも偏らないようにする（`docs/01-rules.md`）。
 */
function pickTeam(): Team {
  let red = 0;
  let blue = 0;
  for (const p of world.getAllPlayers()) {
    const t = teamOf(p);
    if (t === "red") red++;
    else if (t === "blue") blue++;
  }
  return red <= blue ? "red" : "blue";
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
function joinMatch(player: Player, announce: boolean): void {
  let team = teamOf(player);
  const returning = team !== undefined;
  if (team === undefined) {
    team = pickTeam();
    assignTeam(player, team);
  }

  // **持ち物とエンダーチェストを空にして、支給品だけにする**
  resetInventory(player);
  grantSpawnProtection(player);
  setTeamSpawn(player, team);

  if (announce) {
    player.sendMessage(returning ? `§7${teamName(team)} に戻った` : `§7${teamName(team)} に入った`);
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
function* cleanupJob(report: Player | undefined): Generator<void, void, void> {
  const dim = world.getDimension("overworld");
  const blocks = { removed: 0 };
  const chests = { emptied: 0 };

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

  const msg = `§7片付け完了 ブロック ${blocks.removed} / チェスト ${chests.emptied}`;
  if (report !== undefined) report.sendMessage(msg);
  else world.sendMessage(msg);
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
  if (out.removed > 0) world.sendMessage(`§7場内のエンティティを ${out.removed} 体 消した`);
}

function runCleanup(report: Player | undefined): void {
  system.run(() => {
    system.runJob(cleanupJob(report));
  });
}

// ---------------------------------------------------------------- 進行
/** 試合を始める */
function startMatch(by: Player): string {
  if (isRunning()) return "もう始まっている";
  // **一時停止中に新規開始させない。**
  // 間違えて押すと、コアの残りも盤面も捨てることになる
  if (isPaused()) {
    return (
      "§c一時停止中です。§f/game:resume§c で続きから再開できます' + BS + 'n" +
      "§7新しく始めたいなら、先に §f/game:abort§7 で捨ててください"
    );
  }
  // **始める前に片付ける。** 前の試合の残りを持ち込まない
  forgetPlaced();
  const session = beginMatch();
  // **試合を始めた人を運営主として覚える。** 名前ではなく id
  setHost(by.id);

  // **先にマップを読み込み続ける状態にする**（docs/spec/11-match.md 6-C）。
  // これをやらないと、離れた島のジェネレータが見つからず、そのあと一生湧かない
  const areas = addTickingAreas();

  // **場内のエンティティを消す。**
  // 前の試合で落ちた資源、置かれた実体、湧いた敵。
  // 読み込み直後は間に合わないので、少し待ってから
  system.runTimeout(() => {
    system.runJob(clearArenaEntitiesJob());
  }, 40);

  // **張った直後はまだ読み込まれていない。** 見つかるまでやり直す
  rescanUntilFound(undefined);

  for (const p of world.getAllPlayers()) joinMatch(p, true);
  onMatchStart(session);
  void by;
  return `第 ${session} 戦を始めた（範囲 ${areas} 箇所を読み込み中）`;
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
  const areas = addTickingAreas();
  rescanUntilFound(undefined);

  for (const p of world.getAllPlayers()) {
    if (teamOf(p) === undefined) {
      // 停止中に入ってきた人。**通常どおり参加させる**
      joinMatch(p, true);
      continue;
    }
    // **元から居た人。持ち物には触らない**
    grantSpawnProtection(p);
    giveLoadout(p);
    const t = teamOf(p);
    if (t !== undefined) setTeamSpawn(p, t);
  }

  world.sendMessage(`§a試合を再開§r （第 ${sessionId()} 戦の続き）`);
  return `再開した（範囲 ${areas} 箇所を読み込み中）`;
}

/**
 * 決着。
 *
 * **負けたチームを受け取る**（コアが 0 になったチーム）。
 */
export function finishMatch(loser: Team): void {
  if (!isRunning()) return;
  discardMatch();
  onTeamWin(loser === "red" ? "blue" : "red");
  onMatchEnd("決着");
  runCleanup(undefined);
  // **片付けてから外す。** 先に外すと、離れた場所が片付かない
  system.runTimeout(() => removeTickingAreas(), 200);
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
  removeTickingAreas();
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
      { name, description, permissionLevel: CommandPermissionLevel.GameDirectors },
      (origin: CustomCommandOrigin): CustomCommandResult => {
        const player = playerOf(origin);
        if (player === undefined) return ng("プレイヤーから実行すること");
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
    onMatchEnd("一時停止");
    // **停止でも外す。** 盤面は残すが、読み込み続ける理由は無い
    removeTickingAreas();
    return "一時停止した。§f/game:resume§r で続きから再開できます";
  });

  simple("game:resume", "一時停止した試合を、続きから再開する", () => resume());

  simple("game:abort", "試合を強制終了する（片付ける）", (p) => {
    discardMatch();
    onMatchEnd("強制終了");
    runCleanup(p);
    // **片付けてから外す。** 先に外すと、離れた場所が片付かない
    system.runTimeout(() => removeTickingAreas(), 200);
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

  simple("game:host", "自分を運営主にする（抜けたら一時停止される）", (p) => {
    setHost(p.id);
    return "あなたを運営主にしました";
  });

  simple("game:status", "いまの状態を出す", (p) => {
    // **3 つの状態を必ず出す。**
    // 一時停止が「非開始」に見えていて、再開できることに気づけなかった
    const st = matchState();
    const lines = [`§e状態§r  ${matchStateName(st)}  §7/ 第 ${sessionId()} 戦`];
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

  // ---- チームが無い＝新規参加。通常どおり
  if (team === undefined) {
    if (state === "running") joinMatch(player, true);
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

  // **拠点の外に居た＝戦線から抜けた。** 死亡として扱う
  player.sendMessage("§c戦闘中に切断したため、死亡として扱われました");
  try {
    player.kill();
  } catch {
    /* 殺せなかった。せめて自陣へ戻す */
    try {
      player.teleport(ARENAS[0].spawns[team], { dimension: player.dimension });
    } catch {
      /* 何もできない */
    }
  }
}
