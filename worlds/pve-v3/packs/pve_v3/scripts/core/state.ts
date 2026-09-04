/**
 * 状態と、その遷移。**純粋。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/17-state.md`。
 *
 * ## 人の状態は「持たない」。**世界の状態から出す**
 *
 * ```
 * 世界の状態 ＋ 参加のしかた ＋ 死んでいるか
 *        ↓ playerPhase()
 *   その人がいまあるべき状態
 * ```
 *
 * **9 通りを直接持つと、必ずどこかでずれる**——
 * **持つのは「参加のしかた」と「死んでいるか」の 2 つだけ。**
 */

/** 休憩所の持ち時間（tick）。**30 秒** */
export const REST_TICKS = 600;

/** リザルトの長さ（tick）。**15 秒** */
export const RESULT_TICKS = 300;

/** 開始準備の長さ（tick）。**仮** */
export const PREPARE_TICKS = 100;

/** 何戦で終わるか */
export const LAST_WAVE = 30;

/** 終わり方 */
export type EndReason = "wipe" | "cleared" | "admin";

export const END_LABEL: Readonly<Record<EndReason, string>> = {
  wipe: "全滅",
  cleared: "完走",
  admin: "運営が終了した",
};

/** 世界の状態（6 つ） */
export type WorldPhase = "idle" | "prepare" | "rest" | "wave" | "paused" | "result";

/** 参加のしかた。**これだけを保存する** */
export type Membership = "out" | "member" | "late";

/** 人の状態（9 つ）。**保存しない。毎回出す** */
export type PlayerPhase =
  "out" | "rest" | "field" | "dead" | "paused" | "result" | "lateRest" | "lateField" | "lateResult";

/** 画面に出す名前 */
export const WORLD_LABEL: Readonly<Record<WorldPhase, string>> = {
  idle: "ゲーム非開始",
  prepare: "ゲーム開始準備",
  rest: "休憩所",
  wave: "wave 進行中",
  paused: "一時停止",
  result: "ゲーム終了",
};

export const PLAYER_LABEL: Readonly<Record<PlayerPhase, string>> = {
  out: "非参加中",
  rest: "参加中 — 休憩所",
  field: "参加中 — 戦場",
  dead: "参加中 — 戦場で死亡",
  paused: "参加中 — 一時停止",
  result: "参加中 — ゲーム終了",
  lateRest: "途中参加 — 休憩所",
  lateField: "途中参加 — 戦場",
  lateResult: "途中参加 — ゲーム終了",
};

/**
 * どこからどこへ行けるか。
 *
 * **表に無い遷移は通さない**——「気づいたら変な状態」を型と表で止める。
 */
export const WORLD_NEXT: Readonly<Record<WorldPhase, readonly WorldPhase[]>> = {
  // 開始準備へ進むだけ
  idle: ["prepare"],
  // 準備できたら休憩所へ。中止すれば戻る
  prepare: ["rest", "idle"],
  // 出発するか、止めるか、終わるか
  rest: ["wave", "paused", "result"],
  // クリアで休憩所、全滅・最終ウェーブで終了
  wave: ["rest", "paused", "result"],
  // 止める前の所へ戻る
  paused: ["rest", "wave", "result"],
  // **リザルトのあとは必ず非開始へ**
  result: ["idle"],
};

/** その遷移は許されているか */
export function canEnter(from: WorldPhase, to: WorldPhase): boolean {
  return WORLD_NEXT[from].includes(to);
}

/** 一時停止から戻れる先か */
export function isResumable(phase: WorldPhase): phase is "rest" | "wave" {
  return phase === "rest" || phase === "wave";
}

/** ゲームが動いているか（非開始・準備以外） */
export function isRunning(phase: WorldPhase): boolean {
  return phase !== "idle" && phase !== "prepare";
}

/**
 * その人がいまあるべき状態。
 *
 * **`membership` が `out` なら、世界が何であれ「非参加中」。**
 */
export function playerPhase(world: WorldPhase, membership: Membership, dead: boolean): PlayerPhase {
  if (membership === "out") return "out";
  const late = membership === "late";

  switch (world) {
    case "idle":
      // **非開始に参加者は居ない。**寄せる側が `out` へ戻す
      return "out";
    case "prepare":
    case "rest":
      return late ? "lateRest" : "rest";
    case "wave":
      if (late) return "lateField";
      return dead ? "dead" : "field";
    case "paused":
      // **「途中参加 — 一時停止」は作らない**（`17-state.md` 3 章の 9 つに無い）
      return "paused";
    case "result":
      return late ? "lateResult" : "result";
  }
}

/** その状態で戦えるか */
export function canFight(phase: PlayerPhase): boolean {
  return phase === "field";
}

/** その状態で買えるか */
export function canShop(phase: PlayerPhase): boolean {
  return phase === "rest" || phase === "lateRest";
}

/** **スペクテイターでなければならない**状態か */
export function mustSpectate(phase: PlayerPhase): boolean {
  // **途中参加は戦場に立てない**（`17-state.md` 3-1）
  return phase === "dead" || phase === "lateField";
}

/** その場に留め置く（動かさない）状態か */
export function mustFreeze(phase: PlayerPhase): boolean {
  return phase === "paused" || phase === "result" || phase === "lateResult";
}

/** どの場所に居るべきか */
export type Home = "lobby" | "rest" | "field";

/** その状態の居場所。**世界の状態から決まる** */
export function homeOf(world: WorldPhase, membership: Membership): Home {
  if (membership === "out") return "lobby";
  switch (world) {
    case "idle":
      return "lobby";
    case "prepare":
    case "rest":
      return "rest";
    case "wave":
      return "field";
    case "paused":
    case "result":
      // **止まっている間は動かさない**——いま居る所に留める
      return "field";
  }
}
