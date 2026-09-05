/**
 * 暗転。**2 秒を 1 回だけ掛けて、あとは時計を見るだけ。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 2 章。
 *
 * ```
 * blackout(player)
 *   0 ──6──────────────────34───40
 *   暗転中│      暗転       │明転中│ 元どおり
 * ```
 *
 * > ### 掛け直さない（2026-09-05 変更）
 * >
 * > **黒を長く保つために毎 tick 掛け直していた**が、
 * > **届かない tick があると、そこで一瞬明るくなる。**
 * > 原因を詰め切れなかったので、**1 回で足りる長さに作業のほうを収める**に変えた。
 * >
 * > | | |
 * > | --- | --- |
 * > | **掛け方** | **1 回だけ**（`holdTime` で黒を保つ） |
 * > | **明転** | **時間で勝手に明ける。** 起こす口は持たない |
 * > | **止まったとき** | **切れない**——クライアントが自分で数えている |
 * > | **引き換え** | **2 秒で終わらない作業は隠せない** |
 *
 * > ### 段は「掛けてから何 tick 目か」から出す
 * >
 * > `camera fade` に**いまの状態を訊く口は無い。**
 * > **こちらで同じ時計を持つ**——掛けた時刻さえ合っていれば、画面と一致する。
 */

import { system, world, type Player } from "@minecraft/server";

/** 暗転の色。**真っ黒** */
const BLACK = { red: 0, green: 0, blue: 0 };

/**
 * 刻み（秒）。**合計 2 秒。**
 *
 * **`holdTime` が「真っ黒のまま保つ時間」。**
 * 1 つの値につき 10 秒まで、合計 0.5 秒以上
 * （`CameraCommandIntroduction.md`「Limitations on fades」）。
 */
export const FADE = { in: 0.3, hold: 1.4, out: 0.3 } as const;

const sec = (v: number): number => Math.round(v * 20);

/** 真っ暗になる tick／明転が始まる tick／元どおりになる tick */
const DARK_AT = sec(FADE.in);
const OUT_AT = DARK_AT + sec(FADE.hold);
const CLEAR_AT = OUT_AT + sec(FADE.out);

/** 段 */
export type DarkPhase = "in" | "dark" | "out" | "clear";

/** 掛けた時刻（tick） */
const started = new Map<string, number>();

function ageOf(player: Player): number | undefined {
  const from = started.get(player.id);
  return from === undefined ? undefined : system.currentTick - from;
}

/** その人の段 */
export function phaseOf(player: Player): DarkPhase {
  const age = ageOf(player);
  if (age === undefined || age >= CLEAR_AT) return "clear";
  if (age < DARK_AT) return "in";
  if (age < OUT_AT) return "dark";
  return "out";
}

/** **真っ黒になっているか**（暗転中はまだ false） */
export function isDark(player: Player): boolean {
  return phaseOf(player) === "dark";
}

/** 何かしら暗い側にいるか（暗転中も含む） */
export function isDarkening(player: Player): boolean {
  const p = phaseOf(player);
  return p === "in" || p === "dark";
}

/** **明転が終わったか。** 掛けていない人も true */
export function isClear(player: Player): boolean {
  return phaseOf(player) === "clear";
}

/**
 * **明転が始まるまでに、あと何 tick あるか。**
 *
 * **飛ばすのは、これが尽きる前に済ませる**（`13-flow.md` 2 章）。
 */
export function untilOut(player: Player): number {
  const age = ageOf(player);
  return age === undefined ? 0 : Math.max(0, OUT_AT - age);
}

/**
 * **暗転を 1 回掛ける。** すでに暗い人には掛け直さない。
 *
 * 明るくなるのは**掛けてから 2 秒後**。**起こす口は無い。**
 */
export function blackout(player: Player): void {
  if (isDarkening(player)) return;
  started.set(player.id, system.currentTick);
  try {
    player.camera.fade({
      fadeColor: BLACK,
      fadeTime: { fadeInTime: FADE.in, holdTime: FADE.hold, fadeOutTime: FADE.out },
    });
  } catch {
    /* 抜けた */
  }
}

/**
 * **覚えているぶんを捨てる**（試合が止まったときの後始末）。
 *
 * **画面は 2 秒で勝手に明るくなる**ので、ここで消せるのは覚え書きだけ。
 */
export function forgetAll(): void {
  started.clear();
}

/** 毎 tick。**終わった人を落とすだけ**（掛け直しはしない） */
export function tick(): void {
  if (started.size === 0) return;
  for (const p of world.getAllPlayers()) if (isClear(p)) started.delete(p.id);
}
