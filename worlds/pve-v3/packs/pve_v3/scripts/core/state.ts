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

/**
 * 世界の状態（**7 つ**）。
 *
 * `build` は**戦場を手直しするための状態**（`17-state.md` 2-9）。
 * **試合の流れからは外れている**——`idle` とだけ行き来する。
 */
export type WorldPhase = "idle" | "prepare" | "rest" | "wave" | "interlude" | "paused" | "result" | "build";

/** 参加のしかた。**これだけを保存する** */
export type Membership = "out" | "member" | "late";

/** 人の状態（**10 個**）。**保存しない。毎回出す** */
export type PlayerPhase =
  | "out"
  | "rest"
  | "field"
  | "dead"
  /** **モーション強化を選んでいる**（幕間。`13-flow.md` 2 章） */
  | "picking"
  | "paused"
  | "result"
  | "lateRest"
  | "lateField"
  | "lateResult";

/** 画面に出す名前 */
export const WORLD_LABEL: Readonly<Record<WorldPhase, string>> = {
  idle: "ゲーム非開始",
  prepare: "ゲーム開始準備",
  rest: "休憩所",
  wave: "wave 進行中",
  paused: "一時停止",
  interlude: "幕間",
  result: "ゲーム終了",
  build: "建築中",
};

export const PLAYER_LABEL: Readonly<Record<PlayerPhase, string>> = {
  out: "非参加中",
  rest: "参加中 — 休憩所",
  field: "参加中 — 戦場",
  dead: "参加中 — 戦場で死亡",
  picking: "参加中 — 強化を選んでいる",
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
  // 開始準備へ進む。**建築へも入れる**（`17-state.md` 2-9）
  idle: ["prepare", "build"],
  // 準備できたら休憩所へ。中止すれば戻る
  prepare: ["rest", "idle"],
  // **出発も幕間を挟む**（暗転してから運ぶ）。止めるか、終わるか
  rest: ["interlude", "paused", "result"],
  // **戦場が終わったら必ず幕間**。全滅と一時停止だけは直に抜ける
  wave: ["interlude", "paused", "result"],
  // **幕間の先は 3 つ**——次の戦場／休憩所／終了（`13-flow.md` 1 章）
  interlude: ["wave", "rest", "result"],
  // 止める前の所へ戻る
  paused: ["rest", "wave", "result"],
  // **リザルトのあとは必ず非開始へ**
  result: ["idle"],
  // **建築からは非開始へ戻るだけ**
  build: ["idle"],
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
export function playerPhase(
  world: WorldPhase,
  membership: Membership,
  dead: boolean,
  /** **強化を選び終わったか。** 幕間だけで見る */
  picked = true
): PlayerPhase {
  if (membership === "out") return "out";
  const late = membership === "late";

  switch (world) {
    case "idle":
    case "build":
      // **非開始と建築中に参加者は居ない。**寄せる側が `out` へ戻す
      return "out";
    case "prepare":
    case "rest":
      return late ? "lateRest" : "rest";
    case "interlude":
      // **選び終わるまでは「選んでいる」。** 終われば戦場に居るものとして扱う
      if (!picked) return "picking";
      if (late) return "lateField";
      return "field";
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

/** **台を殴って強化を買えるか**（`13-flow.md` 3-4）。**休憩所でも戦場でも** */
export function canBuyHere(phase: PlayerPhase): boolean {
  return canShop(phase) || phase === "field";
}

/** **スペクテイターでなければならない**状態か */
export function mustSpectate(phase: PlayerPhase): boolean {
  // **途中参加は戦場に立てない**（`17-state.md` 3-1）
  return phase === "dead" || phase === "lateField";
}

/**
 * その場に留め置く（動かさない）状態か。
 *
 * **強化を選んでいる間は留め置かない**（2026-09-05 変更）——
 * **UI が出るまでの間、動けるのに引き戻されていた。**
 * UI を開けば**それ自体が動きを止める。**
 */
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
    // **建築中に参加者は居ない**が、型を塞ぐために書いておく
    case "build":
      return "lobby";
    case "prepare":
    case "rest":
      return "rest";
    case "wave":
    case "interlude":
      return "field";
    case "paused":
    case "result":
      // **止まっている間は動かさない**——いま居る所に留める
      return "field";
  }
}

/**
 * **休憩所が挟まる間隔**（`13-flow.md` 1 章）。
 *
 * > ### 毎回休憩所へ飛ばすとテンポが悪い
 * >
 * > **戦場 3 連戦。** wave が 3 の倍数を終えたときだけ休憩所へ。
 * > **wave 0 も 3 の倍数**なので、最初は休憩所から始まる。
 */
export const RUN_LENGTH = 3;

/** その wave を終えたら休憩所へ行くか */
export function restsAfter(wave: number): boolean {
  return wave % RUN_LENGTH === 0;
}

/** 幕間の長さ（tick）。**選び終わらなくても、ここで進む** */
export const INTERLUDE_TICKS = 200;

/** 戦場に着いてから、湧き始めるまで（tick）。**10 秒** */
export const SPAWN_DELAY = 200;

/**
 * **強化を選ぶ締め切り**（次の場所に着いてからの tick）。
 *
 * **1 人の手が止まると全員が待たされる**ので、幕間は選ぶのを待たない。
 * **敵が湧く 1 秒前**に、選ばなかった人のぶんを勝手に引く（`13-flow.md` 2 章）。
 */
export const PICK_DEADLINE = SPAWN_DELAY - 20;

/**
 * **明転してから 3 択を出すまで**（次の場所に入ってからの tick）。
 *
 * **暗いまま UI を開き続けるのは難しかった**（`13-flow.md` 2 章）。
 */
export const PICK_OPEN = 10;

// ================================================================ 幕間の判断
//
// > ### ゲームを起動しないと確かめられない所を減らす
// >
// > 「どこへ運ぶか」「マップを差し替えるか」「3 択を出すか」「次はどこか」は
// > **全部この 1 つの関数で決まる。** ここをテストで固めれば、
// > 残るのは**運ぶ・置く・出す**という手続きだけになる。

/** 幕間で何をするか */
export interface InterludePlan {
  /** どこへ運ぶか */
  readonly dest: Home;
  /** **マップを差し替えるか。** 休憩所へ行くときは要らない */
  readonly rebuild: boolean;
  /** **3 択を出すか。** 戦場が終わったときだけ */
  readonly picker: boolean;
  /** 幕間の次 */
  readonly next: WorldPhase;
}

/**
 * 幕間の中身を決める。
 *
 * @param from **どこから幕間へ入ったか**（`wave` なら戦場が終わった）
 * @param wave いま何戦目まで終わったか
 */
export function interludePlan(from: WorldPhase | undefined, wave: number): InterludePlan {
  const fromWave = from === "wave";

  // **休憩所を出るとき**は、行き先は必ず戦場。3 択も出さない
  if (!fromWave) return { dest: "field", rebuild: true, picker: false, next: "wave" };

  // **最終ウェーブを終えたら、そこで終わり**
  if (wave >= LAST_WAVE) return { dest: "rest", rebuild: false, picker: true, next: "result" };

  // **3 の倍数を終えたら休憩所**（`13-flow.md` 1 章）
  if (restsAfter(wave)) return { dest: "rest", rebuild: false, picker: true, next: "rest" };

  return { dest: "field", rebuild: true, picker: true, next: "wave" };
}
