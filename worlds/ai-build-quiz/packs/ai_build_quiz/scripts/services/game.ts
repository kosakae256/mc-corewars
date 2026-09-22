/**
 * ゲームの始め・止め・対戦の結果（`docs/spec/11-flow.md` 1 章、`17-modes.md` 1 章）。
 *
 * admin（コマンド・コンパス）と answer（N 問目が終わったら結果）の両方から呼ぶので services に置く。
 */

import { system, world } from "@minecraft/server";

import { MSG } from "../lib/format.js";
import { currentMode, versusRounds } from "../state/mode.js";
import { setPhase, setRoundNumber } from "../state/phase.js";
import { resetQuestions, setPending, setRound, setSetter, setVersusGoal } from "../state/round.js";
import { resetScores, showTotal, versusRanking } from "../state/score.js";
import { clearBox } from "./blocks.js";
import { allowFlightAll } from "./flight.js";
import { tellAll, tellOps } from "./tell.js";

export function startGame(): void {
  // 対戦は始めるたびに対戦スコアを 0 にし、このゲームの問数を決める（17-modes 1 章）。累計は常に tab
  if (currentMode() === "versus") {
    resetScores();
    setVersusGoal(versusRounds());
  } else {
    setVersusGoal(undefined);
  }
  showTotal();
  setSetter(undefined);
  resetQuestions();
  setRound(undefined);
  setPending(undefined);
  setRoundNumber(0);
  setPhase("waiting", system.currentTick);
  allowFlightAll(); // ゲームモード変更などで飛べなくなった人のために 1 回だけ（16-world-rules 2 章）
  tellAll(currentMode() === "versus" ? MSG.startedVersus(versusRounds()) : MSG.started);
  // 開始の演出（11-flow 2 章）
  for (const p of world.getAllPlayers()) {
    try {
      p.onScreenDisplay.setTitle(MSG.startTitle, {
        subtitle: MSG.startSubtitle,
        fadeInDuration: 5,
        stayDuration: 50,
        fadeOutDuration: 15,
      });
      p.playSound("random.explode", { volume: 1, pitch: 1 }); // raid.horn は「うるさすぎる」→ 爆発の音（本人・2026-09-21）
    } catch {
      /* 抜けた */
    }
  }
}

export function stopGame(): void {
  setRound(undefined);
  setSetter(undefined);
  setPending(undefined);
  setVersusGoal(undefined);
  setPhase("idle", system.currentTick);
  try {
    clearBox();
  } catch (err) {
    tellOps(`片づけに失敗: ${String(err)}`);
  }
  tellAll(MSG.stopped);
}

/** 対戦の N 問目が終わった: 結果を出して止める（17-modes 1 章） */
export function finishVersus(): void {
  const ranking = versusRanking();
  const top = ranking[0];
  for (const p of world.getAllPlayers()) {
    try {
      p.onScreenDisplay.setTitle(top ? MSG.versusWinner(top.name) : MSG.versusNoWinner, {
        subtitle: top ? MSG.versusPoints(top.score) : "",
        fadeInDuration: 5,
        stayDuration: 100,
        fadeOutDuration: 20,
      });
      p.playSound("random.totem", { volume: 1, pitch: 1 });
    } catch {
      /* 抜けた */
    }
  }
  tellAll(MSG.versusResult(ranking));
  stopGame();
}
