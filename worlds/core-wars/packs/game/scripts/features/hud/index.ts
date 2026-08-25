/**
 * 常に見える表示（サイドバー）。
 *
 * 仕様は `docs/spec/15-presentation.md` 5章。
 *
 * ## なぜ要るのか
 *
 * **削った本人しか状況を知らない**状態だった。
 * どちらが優勢かを、聞かなくても分かるようにする。
 *
 * ## スコアボードを使う
 *
 * Bedrock で常時表示を作る手段はこれしかない。
 * **点数として数字を入れると、右側に数字が並ぶ。**
 * 行の名前を「赤コア」「青コア」にすれば、そのまま残り回数になる。
 *
 * ## 試合中だけ出す
 *
 * 終わったら消す。**盤面が残っていると、終わったのか分からない。**
 *
 * ## 個人の点数は出さない（2026-08-25 変更）
 *
 * 以前はロビーで前の試合の上位 6 人を並べていたが、やめた。
 *
 * **行を消さずに書き足していたので、試合が始まっても残っていた。**
 * コアの残りと前の試合の戦績が**同じ盤面に混ざる。**
 *
 * そもそも**ここは「いま何が起きているか」を出す場所。**
 * 振り返りは別の場所に出す（`docs/spec/15-presentation.md` 4-5）。
 *
 * ## フェーズ 2 までの残り秒も出す（2026-08-25 追加）
 *
 * **ここが残り時間を知る唯一の場所。**
 * チャットの読み上げもカウントダウンもやめた
 *（`docs/spec/11-match.md` 6-Z）ので、
 * これが無いと**いつ削れるようになるのか誰にも分からない。**
 */

import { DisplaySlotId, ObjectiveSortOrder, system, world, type ScoreboardObjective } from "@minecraft/server";

import { ARENAS } from "../../lib/arena.js";
import { coreLeft, isRunning, matchState } from "../../lib/match-state.js";
import { phase1LeftSeconds } from "../../lib/phase.js";

/** スコアボードの名前。**変えると今までの表示が消える** */
const OBJECTIVE = "cw_hud";

/** 出し直す間隔（tick）。**1 秒で足りる。** 数字が飛ぶほど速く動かない */
const INTERVAL = 20;

/**
 * 行の名前。
 *
 * **点数の大きい順に上から並ぶ**ので、
 * 順番を固定したいなら名前だけでは決まらない。
 * ここでは残り回数がそのまま点数になるので、**多いほうが上**に出る。
 */
function rowName(team: "red" | "blue"): string {
  return team === "red" ? "§c赤チーム" : "§9青チーム";
}

/**
 * フェーズ 2 までの残りを出す行。
 *
 * **秒数をそのまま点数にする。** 右に出る数字が残り秒になる。
 *
 * 並び順は点数で決まる（多いほうが上）ので、
 * **残り 100 秒を切るとチームの行より下へ移る。**
 * サイドバーの仕組み上そうなる。順番より**数字が読めるほう**を取った
 *（`docs/spec/15-presentation.md` 5 章）。
 */
const PHASE_ROW = "§eフェーズ2まで";

function objective(): ScoreboardObjective | undefined {
  try {
    const sb = world.scoreboard;
    return sb.getObjective(OBJECTIVE) ?? sb.addObjective(OBJECTIVE, "§l§6Core Wars");
  } catch {
    return undefined;
  }
}

/** 表示を消す */
function hide(): void {
  try {
    world.scoreboard.clearObjectiveAtDisplaySlot(DisplaySlotId.Sidebar);
  } catch {
    /* もともと出ていない */
  }
}

/**
 * 表示を出す。
 *
 * **書く前に、いま出す行以外を全部消す**（2026-08-25 追加）。
 * 書き足すだけにしていたので、**前の試合の行が残り続けていた。**
 */
function show(): void {
  const obj = objective();
  if (obj === undefined) return;
  try {
    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
      objective: obj,
      sortOrder: ObjectiveSortOrder.Descending,
    });
  } catch {
    /* 出せなかった。次の機会に */
  }

  // **会場は 1 つ前提。** 増えたら会場ごとに行を分けることになる
  const a = ARENAS[0];
  for (const team of ["red", "blue"] as const) {
    try {
      obj.setScore(rowName(team), coreLeft(a.id, team));
    } catch {
      /* 書けなかった */
    }
  }

  // ---- フェーズ 1 の残り秒
  //
  // **フェーズ 2 に入ったら行ごと消す。**
  // 0 が残っていると、まだ何かを待っているように見える
  const left = phase1LeftSeconds();
  try {
    if (left > 0) obj.setScore(PHASE_ROW, left);
  } catch {
    /* 書けなかった */
  }

  // ---- **出すもの以外は消す**
  //
  // 残っているのは前の試合の行なので、**名前で見分けずに消してよい**
  const keep = new Set<string>([rowName("red"), rowName("blue")]);
  if (left > 0) keep.add(PHASE_ROW);
  try {
    for (const p of obj.getParticipants()) {
      if (!keep.has(p.displayName)) obj.removeParticipant(p);
    }
  } catch {
    /* 消せなかった。次の機会に */
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function startHud(): void {
  system.runInterval(() => {
    // **一時停止中も出したまま。** 盤面が残っていることを示す
    if (isRunning() || matchState() === "paused") {
      show();
      return;
    }
    // **ロビーでは何も出さない**（2026-08-25 変更）。
    // 個人の点数を並べていたが、ここは「いま何が起きているか」の場所
    hide();
  }, INTERVAL);
}
