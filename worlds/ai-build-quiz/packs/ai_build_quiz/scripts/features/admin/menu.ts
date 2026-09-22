/**
 * 運営のコンパスのメニュー（`docs/spec/17-modes.md` 4 章）。コンパスの配布と右クリックは `index.ts`。
 *
 * モード／回答のルール／カテゴリ固定／対戦の問数／生成モデル／出題の受付を止める・再開する／出題キューを空にする／開始・停止／対戦スコア 0／観覧の輪／累計。
 */

import { system, world, type Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

import { kindLabel, MSG } from "../../lib/format.js";
import { bridgeConnected } from "../../state/bridge.js";
import {
  answerRule,
  currentMode,
  fixedKind,
  GEN_PROFILES,
  genProfile,
  KINDS,
  MODES,
  RULES,
  setAnswerRule,
  setFixedKind,
  setGenProfile,
  setMode,
  setVersusRounds,
  versusRounds,
  type AnswerRule,
  type GenProfile,
  type Kind,
  type Mode,
} from "../../state/mode.js";
import { phase } from "../../state/phase.js";
import { setSetter } from "../../state/round.js";
import { clearQueue, queueEntries, queueOpen, setQueueOpen } from "../../state/queue.js";
import { resetScores, totalOf } from "../../state/score.js";
import { placeRing } from "../../services/blocks.js";
import { startGame, stopGame } from "../../services/game.js";
import { tellAll, tellOps } from "../../services/tell.js";

const MODE_LABEL: Record<Mode, string> = { free: "フリー", versus: "対戦", custom: "出題" };
const RULE_LABEL: Record<AnswerRule, string> = { first: "早い者勝ち", all: "全員回答" };
const GEN_LABEL: Record<GenProfile, string> = {
  v3: "v3（Japanese SDXL・日本語のまま・遅い）",
  v1: "v1（sd-turbo・速い・味がある）",
  v2: "v2（SDXL-Turbo・キャラに強い・遅い）",
};

function statusText(): string {
  const k = fixedKind();
  return [
    `§7モード: §f${MODE_LABEL[currentMode()]}`,
    `§7回答のルール: §f${RULE_LABEL[answerRule()]}`,
    `§7カテゴリ: §f${k ? kindLabel(k) : "すべて"}`,
    `§7対戦の問数: §f${versusRounds()} 問`,
    `§7生成モデル: §f${genProfile()}`,
    `§7状態: §f${phase()}`,
    `§7bridge: §f${bridgeConnected(system.currentTick) ? "接続" : "§c未接続"}`,
  ].join("\n");
}

async function modeMenu(player: Player): Promise<void> {
  const form = new ActionFormData().title("モード").body(statusText());
  for (const m of MODES) form.button(`${MODE_LABEL[m]}${m === currentMode() ? " §a✔" : ""}`);
  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  const m = MODES[res.selection];
  if (!m) return;
  setMode(m);
  setSetter(undefined);
  tellAll(MSG.modeChanged(MODE_LABEL[m]));
}

/** 回答のルール（17-modes 1-1）: 早い者勝ち／全員回答 */
async function ruleMenu(player: Player): Promise<void> {
  const form = new ActionFormData().title("回答のルール").body(statusText());
  for (const r of RULES) form.button(`${RULE_LABEL[r]}${r === answerRule() ? " §a✔" : ""}`);
  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  const r = RULES[res.selection];
  if (!r) return;
  setAnswerRule(r);
  tellAll(MSG.answerRuleChanged(RULE_LABEL[r]));
}

/** 生成モデル（docs/spec/08-genlab.md 2-1b）: v1 / v2。次の問題から効く */
async function genMenu(player: Player): Promise<void> {
  const form = new ActionFormData().title("生成モデル").body(statusText());
  const choices = GEN_PROFILES.filter((g) => g !== "v3"); // v3（Japanese SDXL）はキャラを知らないので出さない（2026-09-22）
  for (const g of choices) form.button(`${GEN_LABEL[g]}${g === genProfile() ? " §a✔" : ""}`);
  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  const g = choices[res.selection];
  if (!g) return;
  setGenProfile(g);
  tellAll(MSG.genChanged(g));
}

/** 対戦の問数（17-modes 4 章）。数字の入力。1 以上の整数でなければ変えない */
async function roundsMenu(player: Player): Promise<void> {
  const form = new ModalFormData()
    .title("対戦の問数")
    .textField("何問で勝負するか（1 以上）", String(versusRounds()), { defaultValue: String(versusRounds()) });
  const res = await form.show(player);
  const v = res.formValues?.[0];
  if (res.canceled || typeof v !== "string") return;
  const n = Number(v.trim());
  if (!Number.isInteger(n) || n < 1) {
    player.sendMessage("§c1 以上の整数を入れてください");
    return;
  }
  setVersusRounds(n);
  tellAll(MSG.roundsChanged(n));
}

async function kindMenu(player: Player): Promise<void> {
  const form = new ActionFormData().title("カテゴリを固定").body(statusText());
  const options: Array<Kind | ""> = ["", ...KINDS];
  for (const k of options) form.button(`${k ? kindLabel(k) : "すべて"}${k === fixedKind() ? " §a✔" : ""}`);
  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  const k = options[res.selection];
  if (k === undefined) return;
  setFixedKind(k);
  tellAll(MSG.kindChanged(k ? kindLabel(k) : "すべて"));
}

export async function mainMenu(player: Player): Promise<void> {
  const running = phase() !== "idle";
  const form = new ActionFormData()
    .title("運営メニュー")
    .body(statusText())
    .button("モードを選ぶ")
    .button(`回答のルール（${RULE_LABEL[answerRule()]}）`)
    .button("カテゴリを固定")
    .button(`対戦の問数（${versusRounds()} 問）`)
    .button(`生成モデル（${genProfile()}）`)
    .button(queueOpen() ? "出題の受付を止める" : "§a出題の受付を再開する")
    .button(`出題キューを空にする（${queueEntries().length} 件）`)
    .button(running ? "§cゲームを止める" : "§aゲームを始める")
    .button("対戦スコアを 0 に")
    .button("観覧の輪を置く")
    .button(`累計を見る（自分: ${totalOf(player)}）`);
  const res = await form.show(player);
  if (res.canceled || res.selection === undefined) return;
  switch (res.selection) {
    case 0:
      await modeMenu(player);
      break;
    case 1:
      await ruleMenu(player);
      break;
    case 2:
      await kindMenu(player);
      break;
    case 3:
      await roundsMenu(player);
      break;
    case 4:
      await genMenu(player);
      break;
    case 5:
      // 受付の停止／再開（17-modes 3 章）。止めても入っている分はそのまま進む
      setQueueOpen(!queueOpen());
      tellAll(queueOpen() ? MSG.queueOpenedAll : MSG.queueClosedAll);
      break;
    case 6:
      clearQueue(); // 17-modes 4 章。運営だけ
      tellAll(MSG.queueCleared);
      break;
    case 7:
      if (running) stopGame();
      else if (!bridgeConnected(system.currentTick)) player.sendMessage(MSG.bridgeNotConnected);
      else startGame();
      break;
    case 8:
      resetScores();
      player.sendMessage("§7対戦スコアを 0 にした");
      break;
    case 9:
      try {
        placeRing();
        player.sendMessage("§7観覧の輪を置いた");
      } catch (err) {
        tellOps(`観覧の輪を置けない: ${String(err)}`);
      }
      break;
    case 10: {
      const lines = world.getAllPlayers().map((p) => `§f${p.name}: §e${totalOf(p)}`);
      player.sendMessage(`§6累計正解\n${lines.join("\n")}`);
      break;
    }
    default:
      break;
  }
}
