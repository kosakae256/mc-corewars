/**
 * 試合の進行。**砂時計を進め、条件が揃ったら次の状態へ送る。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md`。
 *
 * | 状態 | 出る条件 | 次 |
 * | --- | --- | --- |
 * | 開始準備 | **5 秒（仮）** | 休憩所 |
 * | 休憩所 | **30 秒** | wave 進行中 |
 * | wave 進行中 | **敵 0** | 休憩所（**30 戦目ならゲーム終了**） |
 * | wave 進行中 | **全員死亡** | ゲーム終了 |
 * | ゲーム終了 | **15 秒** | ゲーム非開始 |
 *
 * **状態を変えるのは `services/match.ts`。ここは「いつ変えるか」だけ。**
 */

import { world } from "@minecraft/server";

import type { Feature } from "../../types.js";
import {
  LAST_WAVE,
  PREPARE_TICKS,
  RESULT_TICKS,
  REST_TICKS,
  interludePlan,
  PICK_DEADLINE,
  PICK_OPEN,
  restsAfter,
  SPAWN_DELAY,
  type WorldPhase,
} from "../../core/state.js";
import { FIELD } from "../../core/places.js";
import { legionAt, prepareField, readyEnemies, starAt } from "../../services/stage.js";
import { openGate } from "../../services/gate.js";
import { REST, type PortalTarget } from "../../core/portal.js";
import { placing } from "../../services/mapstore.js";
import { isQueued, setQueued } from "../../services/force.js";
import { spawning, stopSpawning } from "../../services/spawn.js";
import { forcePicks, openPickers, resetPicks } from "./pick.js";
import { clearedCue, departCue } from "../../services/interlude.js";
import { isClear, isDark, untilOut } from "../../services/dark.js";
import { moveAll } from "../../services/presence.js";
import { enemyCount } from "../../services/field.js";
import { end, phase, phaseAge, toPhase, wave } from "../../services/match.js";
import { interFrom } from "../../state/match.js";
import { alive, members, reconcile } from "../../services/presence.js";
import { commands } from "./command.js";

/** ポータルに着いたと見なす距離（マス） */
const PORTAL_REACH = 4;

/**
 * > ### 幕間の順番
 * >
 * > **時刻では当てずっぽうにしない。** 段（`services/dark.ts`）と
 * > 置き終わったかどうか（`services/mapstore.ts`）で進める。
 * >
 * > 1. **全員が真っ暗になったら運ぶ**——明るくする側で運ぶと移動が見える
 * > 2. **運んでから差し替える**——湧く所 (0, 0, −40) は
 * >    どのマップでも地面がある（`14-map-build.md` 0-1）ので足元が抜けない
 * > 3. **置き終わったら 3 択を出し、選ぶのを待たずに出る**（下）
 */

/**
 * 締め切りで、勝手に選ばせたか。
 *
 * > ### 選ぶのを待って止めない（2026-09-05 変更）
 * >
 * > **マルチプレイなので、1 人の手が止まると全員が待たされる。**
 * > **幕間は置き終わったら出る。** 選んでいる人は**暗いまま次の場所に立ち**、
 * > 裏では**湧くまでの 10 秒**が進む。
 * > **その 1 秒前**に勝手に引いて UI を閉じるので、
 * > **敵と出会う時には全員が明るく、動ける。**
 */
let forced = false;

/**
 * **3 択を、まだ出していないか。**
 *
 * > ### 明るくしてから出す（2026-09-05 変更）
 * >
 * > 暗いまま出していたが、**画面を黒く保ったまま UI を開き続けるのが難しかった。**
 * > **幕間で出すのをやめ、次の場所に着いて明るくなってから出す**（`13-flow.md` 2 章）。
 */
let pending = false;

/** 殲滅の合図を、もう出したか */
let cleared = false;

/** 幕間で、組み直した／運んだか */
let swapped = false;
let moved = false;

/**
 * **運ぶ締め切り。** 明転が始まるまでに、これだけ残っていたら運んでしまう。
 *
 * > ### 明転は待ってくれない
 * >
 * > **暗転は 2 秒を 1 回掛けるだけ**（`services/dark.ts`）。
 * > **置き終わっていなくても、明るくなる前に運ぶ**——
 * > 組み立ての続きは見えるが、**別の場所で明るくなるよりはよい**（`13-flow.md` 2 章）。
 */
const LAST_CALL = 10;

/**
 * **敵を全部倒したうえで、誰かがポータルに着いたか**（`13-flow.md` 2-1）。
 *
 * > ### 倒しただけでは終わらない
 * >
 * > 前は敵が 0 になった瞬間に飛ばしていた。**急に飛ぶ。**
 * > **自分で歩いて行った先で切り替わる**ほうが、区切りが分かる。
 */
function someoneAtPortal(): boolean {
  const gate = { x: 0, z: FIELD.portalZ };
  for (const p of alive()) {
    try {
      const at = p.location;
      if (Math.hypot(at.x - gate.x, at.z - gate.z) <= PORTAL_REACH) return true;
    } catch {
      /* 抜けた */
    }
  }
  return false;
}

/**
 * **倒し切ったあと、次にどこへ行くか**（`20-portal.md` 0-2）。
 *
 * **3 の倍数を終えたら休憩所**、最終戦を終えたらリザルト——どちらも**水色**。
 */
function nextTarget(): PortalTarget {
  const w = wave();
  return restsAfter(w) || w >= LAST_WAVE ? REST : starAt(w + 1);
}

/**
 * **明るくなったら 3 択を出し、締め切りが来たら勝手に引く。**
 *
 * 締め切りは戦場では**敵が湧く 1 秒前**、休憩所でも同じ長さ（`core/state.ts`）。
 */
function pickStep(age: number): void {
  if (pending && age >= PICK_OPEN) {
    pending = false;
    openPickers();
  }
  if (forced || age < PICK_DEADLINE) return;
  forced = true;
  forcePicks();
}

/** 前の周期の状態。**入った瞬間**を見つけるために覚える */
let seen: WorldPhase | undefined;

function tick(now: number): void {
  // ---- まず全員をあるべき姿へ寄せる
  for (const player of world.getAllPlayers()) reconcile(player, now);

  const age = phaseAge(now);
  const at = phase();

  // ---- **幕間に入った瞬間**に、前回の選択を捨てる
  //
  // > ### 3 択を開くときに捨てていたら、それまで暗転が掛け直されなかった
  // >
  // > **「まだ選んでいない人」が空**に見えていたため、
  // > **暗転 → 明転 → UI → 暗転**とちらついた（2026-09-05 の失敗）。
  if (at !== seen) {
    // **3 択を出すのは、戦場が終わったときだけ。**
    // 休憩所を出るときも暗転するが、そこでは選ばない
    // **状態を落とすのは `services/match.ts` の入口。**
    // ここは出した 3 つの覚え書きを捨てるだけ
    if (at === "interlude") {
      resetPicks();
      swapped = false;
      moved = false;
    }
    // **締め切りは、移った先で数える**（戦場なら湧く 1 秒前、休憩所なら同じ長さ）
    forced = false;
    seen = at;
  }

  switch (at) {
    case "prepare":
      // **wave 0 も 3 の倍数**なので、最初は休憩所から始まる（`13-flow.md` 1 章）
      if (age >= PREPARE_TICKS) toPhase("rest", now);
      break;

    case "rest":
      pickStep(age);
      // **出発も幕間を挟む**——暗転してから運ぶ（`13-flow.md` 2 章）
      if (age >= REST_TICKS) toPhase("interlude", now);
      break;

    case "wave": {
      // **明るくなったら 3 択を出し、湧く 1 秒前に引く**
      pickStep(age);
      if (members().length > 0 && alive().length === 0) {
        end("wipe", now);
        break;
      }
      // **着いてから 10 秒は湧かない**（`13-flow.md` 2-2）
      if (!isQueued() && age >= SPAWN_DELAY) {
        setQueued(true);
        readyEnemies(legionAt(wave()), members().length, wave(), 1);
        break;
      }
      if (!isQueued() || spawning() || enemyCount() > 0) {
        cleared = false;
        break;
      }
      // **殲滅した合図**（仮。音とチャットだけ）
      if (!cleared) {
        cleared = true;
        // **ゲートを「次の行き先」の色にする**（`20-portal.md` 0-2）
        openGate(nextTarget());
        clearedCue();
      }
      // **敵 0 のうえで、誰かがポータルに着いたら全員が次へ**
      if (!someoneAtPortal()) break;
      toPhase("interlude", now);
      break;
    }

    case "interlude": {
      // **何をするかは 1 つの関数で決まる**（`core/flow.ts`。テストで固めてある）
      const plan = interludePlan(interFrom(), wave());

      // ---- **本当に真っ暗になってから**差し替える（時刻で当てずっぽうにしない）
      if (!swapped && members().every((p) => isDark(p))) {
        swapped = true;
        stopSpawning();
        // **休憩所で作ってあれば、ここは何もしない**（`13-flow.md` 2 章）
        if (plan.rebuild) prepareField(wave() + 1);
      }
      // ---- **置き終わってから運ぶ。** 間に合わなければ締め切りで運ぶ
      const late = members().some((p) => untilOut(p) <= LAST_CALL);
      if (swapped && !moved && (!placing() || late)) {
        moved = true;
        moveAll(plan.dest);
        departCue();
      }
      // ---- **勝手に明るくなるのを待つ**（起こす口は持たない）
      if (!moved) break;
      if (!members().every((p) => isClear(p))) break;
      // **3 択は、明るくなってから次の場所で出す**（`pickStep`）
      pending = plan.picker;
      setQueued(false);
      swapped = false;
      moved = false;
      if (plan.next === "result") end("cleared", now);
      else toPhase(plan.next, now);
      break;
    }

    case "result":
      if (age >= RESULT_TICKS) toPhase("idle", now);
      break;

    default:
      // **非開始・一時停止は、時間では動かない**
      break;
  }
}

export const matchFlow: Feature = {
  name: "match",
  commands,
  tick: {
    // **暗転だけ毎 tick。** 進行の判断は 5 tick に 1 回で足りる
    // **5 tick に 1 回。** 砂時計は時刻で見るので、粗くてもずれない
    every: 5,
    run: tick,
  },
};
