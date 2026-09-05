/**
 * 幕間のモーション強化 3 択。**見せ方はまだ仮**（いまはチェスト UI）。
 *
 * > ### **ゲームの中では「エンチャント」と呼ぶ**（2026-09-05）
 * >
 * > **仕組みの名前は「モーション強化」のまま。**
 * > **人に見せる字だけ「エンチャント」**——出す 3 つが、そういうものに見えるため。
 *
 * 仕様は `worlds/pve-v3/docs/spec/13-flow.md` 2 章。
 *
 * > ### **明るくなってから出す**（2026-09-05 変更）
 * >
 * > 暗いまま出していたが、**画面を黒く保ったまま UI を開き続けるのが難しかった。**
 * > **暗転が要るのは、運ぶのとマップの差し替えを隠す間だけ。**
 * >
 * > | | |
 * > | --- | --- |
 * > | **選んでいる間** | **明るい。その場から動けない**（`core/state.ts` の `picking`） |
 * > | **選んだ** | 状態が外れて、動けるようになる |
 * > | **時間切れ** | **敵が湧く 1 秒前に勝手に引いて、UI を閉じる** |
 *
 * > ### **中身はまだ決まっていない**
 * >
 * > `core/motion.ts` の表が空なので、**いまは仮の 3 つを出す。**
 */

import { system, type Player } from "@minecraft/server";
import { uiManager } from "@minecraft/server-ui";

import { PICK_DEADLINE } from "../../core/state.js";
import { draw, ready, type MotionDef } from "../../core/motion.js";
import { phaseAge } from "../../services/match.js";
import { members } from "../../services/presence.js";
import { isPicked, setPicked } from "../../state/pick.js";
// **持ってきた道具**（`worlds/core-wars` から）。型は `forms.d.ts`
import { ChestFormData } from "../../vendor/chest-ui/forms.js";

/** 並べる枠。**真ん中の段に 3 つ** */
const SLOTS = [11, 13, 15] as const;

/**
 * **出し直すまでの間**（tick）。
 *
 * **Esc で閉じられたら、また出す**（`13-flow.md` 2 章）。
 * すぐ出し直すと**開けないまま回り続ける**ことがあるので、少し置く。
 */
const RETRY = 5;

/** 仮の 3 つ。**中身が決まるまでの見本** */
const DUMMY: readonly MotionDef[] = [
  { id: "dummy_a", name: "§b（仮）エンチャント A", text: "中身はまだ決まっていない" },
  { id: "dummy_b", name: "§a（仮）エンチャント B", text: "中身はまだ決まっていない" },
  { id: "dummy_c", name: "§e（仮）エンチャント C", text: "中身はまだ決まっていない" },
];

/** 枠に置く絵 */
const ICONS = ["minecraft:bow", "minecraft:arrow", "minecraft:spectral_arrow"] as const;

/** その人に出した 3 つ。**時間切れのときに、ここから引く** */
const offered = new Map<string, readonly MotionDef[]>();

/**
 * 何回目の 3 択か。
 *
 * **出し直しは待っている間に次の幕間へ進むことがある。**
 * **番号が変わっていたら、その回のぶんは捨てる**（二重に出さない）。
 */
let round = 0;

/**
 * 幕間に入った瞬間に呼ぶ。
 *
 * **状態（`pve3:picked`）を落とすのは `services/match.ts` の入口。**
 * ここは**出した 3 つの覚え書きを捨てるだけ**。
 */
export function resetPicks(): void {
  offered.clear();
  round++;
}

function optionsFor(): readonly MotionDef[] {
  return ready() ? draw(3) : DUMMY;
}

/** 選んだことにする */
function settle(player: Player, got: MotionDef | undefined, auto: boolean): void {
  setPicked(player, true);
  if (got === undefined) {
    player.sendMessage("§8エンチャントを取らなかった");
    return;
  }
  // **効果を付けるのは、中身が決まってから**（`core/motion.ts`）
  player.sendMessage(auto ? `§7時間切れ — §a${got.name}§7 が選ばれた` : `§a${got.name} §7を選んだ`);
}

function build(opts: readonly MotionDef[]): ChestFormData {
  const form = new ChestFormData("27").title("§8エンチャントを 1 つ選ぶ");
  for (const [i, m] of opts.entries()) {
    const slot = SLOTS[i];
    if (slot === undefined) continue;
    form.button(slot, m.name, [`§7${m.text}`], ICONS[i] ?? "minecraft:paper", 1);
  }
  // **「取らない」の枠は置かない**——必ず 1 つ取る（`13-flow.md` 2 章）
  return form;
}

/** 出した 3 つから 1 つ引く */
function draw1(opts: readonly MotionDef[]): MotionDef | undefined {
  return opts.length > 0 ? opts[Math.floor(Math.random() * opts.length)] : undefined;
}

/**
 * **まだ出し直してよいか。**
 *
 * **締め切りを過ぎたら出さない**——敵が湧き始めてから画面を塞がないため
 * （`13-flow.md` 2 章）。
 */
function reopenable(): boolean {
  return phaseAge(system.currentTick) < PICK_DEADLINE;
}

/**
 * **1 人に出す。閉じられたら出し直す。**
 *
 * | 閉じられた時 | どうするか |
 * | --- | --- |
 * | **締め切りより前** | **出し直す**（`RETRY` tick 後） |
 * | **締め切り以降** | **出し直さない。出した 3 つから勝手に引く** |
 */
async function openFor(player: Player): Promise<void> {
  const opts = optionsFor();
  if (opts.length === 0) {
    settle(player, undefined, false);
    return;
  }
  offered.set(player.id, opts);
  const mine = round;

  for (;;) {
    const res = await build(opts).show(player);
    // **締め切りで勝手に決まった**（`forcePicks` が UI を閉じた）／**次の回に進んだ**
    if (isPicked(player) || round !== mine) return;
    if (res.canceled !== true && res.selection !== undefined) {
      const i = SLOTS.indexOf(res.selection as (typeof SLOTS)[number]);
      // **枠以外を押した**ときは選んだことにしない。出し直す
      if (i >= 0) {
        settle(player, opts[i], false);
        return;
      }
    }
    if (!reopenable()) {
      settle(player, draw1(opts), true);
      return;
    }
    await system.waitTicks(RETRY);
    if (isPicked(player) || round !== mine) return;
  }
}

/** 全員に出す */
export function openPickers(): void {
  for (const p of members()) {
    system.run(() => {
      void openFor(p);
    });
  }
}

/**
 * **選ばなかった人のぶんを、勝手に決める。**
 *
 * **UI を閉じて、出した 3 つから引く。** 選ばないことで進行が止まらない。
 */
export function forcePicks(): void {
  for (const p of members()) {
    if (isPicked(p)) continue;
    settle(p, draw1(offered.get(p.id) ?? []), true);
    try {
      uiManager.closeAllForms(p);
    } catch {
      /* 抜けた */
    }
  }
}
