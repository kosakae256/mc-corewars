/**
 * 頭上に出す名前と残量。
 *
 * 仕様は `docs/spec/15-presentation.md` 7-3-A。
 *
 * ## 誰に見せるかで決まる
 *
 * **表示そのものは全員ぶん常に作る。誰に見せるかだけを切り替える。**
 *
 * | 相手 | いつ見えるか |
 * | --- | --- |
 * | 味方 | **常に**（`docs/spec/15-presentation.md` 7-3-C） |
 * | 敵 | **見つけている間だけ**（0.5 秒の視認） |
 * | 本人 | **見せない。** 自分のは要らない |
 *
 * `DebugShape.visibleTo` に見せる相手を並べれば、これがそのまま書ける。
 * **2 つの機能ではなく、1 つの表示の見せ先の違い。**
 *
 * ## なぜ名札ではないのか
 *
 * 名札（`nameTag`）は**しゃがむと消える。**
 * 隠れている相手ほど見えなくなるのでは逆。
 * **見せ先も選べない**（全員に出るか、誰にも出ないか）。
 *
 * `@minecraft/debug-utilities` の `DebugText` なら
 *
 * | | |
 * | --- | --- |
 * | `depthTest = false` | **壁越しに描く**（既定でこちら） |
 * | `attachedTo` | **相手に貼り付く。** 位置を追いかけなくてよい |
 * | `visibleTo` | **見せる相手を選べる** |
 * | しゃがみ | **無関係。** 名札ではないので隠されない |
 *
 * > **beta モジュール**（`@minecraft/debug-utilities`）。
 * > ジェネレータの案内（`features/generator`）で既に使っている。
 */

import { world, type Player, type RGBA } from "@minecraft/server";
import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import { teamOf, type Team } from "../../lib/match-state.js";
import { GAS_MAX, gasOf } from "../grapple/gas.js";
import { absorbOf } from "../../lib/absorb.js";
import { isSpectating } from "../death/index.js";
import { isWatching } from "../spectate/index.js";
import { isFlyingDrone } from "../drone/index.js";

/** 頭上どれだけ上に出すか（マス） */
const HEIGHT = 2.5;

/**
 * 目盛りの数。**15。**
 *
 * 10 では短くて、**残りの差が読み取りづらかった**（2026-08-25 変更）。
 * 1.5 倍にすると、体力（0〜99）でも目盛り 1 つが 7 弱になり、
 * **一目盛り減ったことが分かる。**
 */
const SEGMENTS = 15;

/**
 * 目盛り 1 つぶんの字。
 *
 * **細い字を使う**（2026-08-25 変更）。
 * `▌` は太くて、10 本並べると塊にしか見えなかった。
 */
const SEG = "|";

/** どこまで見えるか（マス）。**画面が文字だらけにならないように** */
const RENDER_DISTANCE = 128;

/** チームの色（表示の地の色） */
const COLOR: Readonly<Record<Team, RGBA>> = {
  red: { red: 1, green: 0.25, blue: 0.25, alpha: 1 },
  blue: { red: 0.35, green: 0.55, blue: 1, alpha: 1 },
};

/** チームの色記号 */
const TAG: Readonly<Record<Team, string>> = { red: "§c", blue: "§9" };

/** ガスの色。**水色** */
const GAS_COLOR = "§b";

/** 出している表示。**メモリだけ。** `/reload` で消えてよい */
interface Mark {
  shape: DebugText;
  text: string;
  /** 見せている相手の id。**変わったら貼り直す** */
  audience: string;
}
const marks = new Map<string, Mark>();

/**
 * 体力の色。
 *
 * **数字を読まなくても危ないと分かる**ようにする。
 * 追い込んだかどうかは、一瞬で判断できる必要がある。
 */
function healthColor(ratio: number): string {
  if (ratio > 0.6) return "§a";
  if (ratio > 0.3) return "§e";
  return "§c";
}

/**
 * 目盛りを組む。
 *
 * **埋まっている側と空いている側で同じ字を使い、色だけ変える。**
 * 字を変えると幅が揃わず、**目盛りが伸び縮みして見える。**
 *
 * **0 でないなら必ず 1 本残す。** 残り 1 と 0 が同じ見た目では困る。
 */
function bar(ratio: number, color: string): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = clamped <= 0 ? 0 : Math.max(1, Math.round(clamped * SEGMENTS));
  return color + SEG.repeat(filled) + "§8" + SEG.repeat(SEGMENTS - filled);
}

/**
 * いまの体力。**読めなければ undefined。**
 *
 * `now` は**吸収を含んだ値。** 上限を超えることがある。
 */
function healthOf(player: Player): { now: number; max: number } | undefined {
  try {
    const h = player.getComponent("minecraft:health");
    if (h === undefined) return undefined;
    return { now: Math.max(0, Math.ceil(h.currentValue)), max: Math.max(1, h.effectiveMax) };
  } catch {
    return undefined;
  }
}

/** 吸収の色。**ピンク** */
const ABSORB_COLOR = "§d";

/**
 * 増えている分（吸収）の出し方。
 *
 * **API から読めない。**
 * 吸収の部品は無く、`minecraft:health` の実値にも入っておらず、
 * 効果の段は**食べるたびに積み上がっても I のまま。**
 *
 * **食べた分を足し、受けた分を引いて数える**（`lib/absorb.ts`）。
 */
/**
 * 実際の値を並べて返す。**確認用**（`command.ts`）。
 *
 * 出ている数が合わないとき、
 * **どこがずれているのか**を推測で追うと時間だけが溶ける。
 */
export function readout(player: Player): string {
  const hp = healthOf(player);
  let effects = "";
  try {
    effects = player
      .getEffects()
      .map((e) => `${e.typeId}:${e.amplifier}`)
      .join(" ");
  } catch {
    effects = "読めない";
  }
  return (
    `§7体力 ${hp === undefined ? "読めない" : `${hp.now}/${hp.max}`}` +
    ` §7増えている分 ${absorbOf(player)}` +
    ` §7ガス ${Math.round(gasOf(player))}
§8効果: ${effects === "" ? "なし" : effects}`
  );
}

/**
 * 体力の目盛り。**吸収がある分だけ左がピンクになる。**
 *
 * ```
 *   ||||||||||||||| 020     ふつう
 *   ||||||||||||||| 028     金のリンゴ（左の 4 本がピンク）
 *   └ 吸収
 * ```
 *
 * **全体を「体力 + 吸収」で割り直す。**
 * 体力の目盛りを削ってピンクを置くと、
 * **増えたのに減ったように見える。**
 */
function healthBar(now: number, max: number, absorb: number): string {
  // **割るのは上限。** 「体力 + 吸収」で割ると、
  // 増えるほど**目盛りの 1 本が表す量が変わってしまう。**
  //
  // 上限 20 で吸収 16 なら、ピンクは **16/20 = 8 割**。
  // 目盛り 1 本の重みは、増えていても増えていなくても同じになる
  const denom = Math.max(1, max);

  const pink = absorb <= 0 ? 0 : Math.min(SEGMENTS, Math.max(1, Math.round((absorb / denom) * SEGMENTS)));
  const filled = now <= 0 ? 0 : Math.max(1, Math.round((now / denom) * SEGMENTS));
  // **はみ出させない。** 丸めで 1 本増えることがある
  const body = Math.min(filled, SEGMENTS - pink);
  const empty = SEGMENTS - pink - body;

  return (
    ABSORB_COLOR + SEG.repeat(pink) + healthColor(now / max) + SEG.repeat(body) + "§8" + SEG.repeat(Math.max(0, empty))
  );
}

/**
 * 数の桁数。**3 桁。**
 *
 * | | 取りうる値 | 桁 |
 * | --- | --- | --- |
 * | ガス | 0〜100 | **3** |
 * | 体力 | 0〜99（金のリンゴで増えうる） | 2 |
 *
 * **多いほうに合わせる。** 足りない桁は 0 で埋める。
 *
 * 空白で埋めても揃わない——**Minecraft の字は等幅ではなく、
 * 空白と数字で幅が違う。** 0 なら数字なので必ず同じ幅になる。
 *
 * 埋めた 0 は暗くして、値と読み違えないようにする。
 */
const DIGITS = 3;

/** 読めなかったときに出す字。**幅は数と同じにする** */
const UNKNOWN = "?".repeat(DIGITS);

/**
 * 目盛りと数を 1 行にする。
 *
 * **どの行も同じ幅になる。**
 * 幅が変わると、行が中央でそろわず**がたつく。**
 *
 * **数も目盛りと同じ色にする。** 別の色にすると、
 * どの数がどの目盛りのものか**目で追う必要が出る。**
 */
function row(ratio: number, value: number, color: string): string {
  return bar(ratio, color) + " " + number(value, color);
}

/** 数だけを、桁をそろえて組む */
function number(value: number, color: string): string {
  const digits = String(Math.max(0, Math.round(value)));
  const pad = "0".repeat(Math.max(0, DIGITS - digits.length));
  return "§8" + pad + color + digits;
}

/**
 * 体力の 1 行。**吸収がある分だけ左がピンクになる。**
 *
 * **数は「体力 + 吸収」。**
 * 目盛りが伸びているのに数が 20 のままでは、何が増えたのか分からない。
 * 増えている間は数もピンクにして、**ふつうの体力と見分けられる**ようにする。
 */
function healthRow(now: number, max: number, absorb: number): string {
  const color = absorb > 0 ? ABSORB_COLOR : healthColor(now / max);
  return healthBar(now, max, absorb) + " " + number(now + absorb, color);
}

/**
 * 出す文字を組む。
 *
 * ```
 *   名前               ← チームの色
 *   |||||||||| 016     ← 体力
 *   |||||||||| 100     ← ガス（水色）
 * ```
 *
 * **体力とガスは行を分ける。**
 * 横に並べると、どちらの目盛りを読んでいるのか分からない。
 *
 * **桁は 0 で埋めて幅をそろえる**（`DIGITS`）。
 * そろっていないと行ががたつく。
 */
function textFor(player: Player, team: Team): string {
  const hp = healthOf(player);
  const gas = Math.round(gasOf(player));

  // **並びは 名前 → 体力 → ガス で固定する。**
  //
  // 読めなかったときに行ごと落とすと、**並びが変わって見える。**
  // 読めないなら「読めない」と出す。**行は落とさない**
  const health = hp === undefined ? bar(0, "§8") + " §8" + UNKNOWN : healthRow(hp.now, hp.max, absorbOf(player));

  // ---- **ドローンを飛ばしている人には、その印を出す**（2026-08-25 追加）
  //
  // 仕様は `docs/spec/23-drone.md` 3 章。
  //
  // 飛ばしている間、その人は**立っているだけで何もできない。**
  // 味方から見て**守るべき相手**だと分かる必要がある
  const name = TAG[team] + player.name + (isFlyingDrone(player.id) ? " §b[操縦中]" : "");
  return [name, health, row(gas / GAS_MAX, gas, GAS_COLOR)].join("\n");
}

/**
 * 誰に見せるか。
 *
 * **本人には見せない**（`docs/spec/15-presentation.md` 7-3-A）。
 * 上を向いたときに自分のが見えても意味が無い。
 */
function audienceFor(player: Player, team: Team, spotters: ReadonlySet<string>, all: Player[]): Player[] {
  // ---- **透明なら敵には出さない**（2026-08-25 追加）
  //
  // 姿を消しているのに**頭上の名前で位置が割れる**のでは、
  // 透明になる意味が無い。
  //
  // **味方には出す。** 味方から隠れたいわけではない
  const hidden = invisible(player);

  const out: Player[] = [];
  for (const viewer of all) {
    if (viewer.id === player.id) continue;
    // ---- **観戦者には全員見せる**（docs/spec/20-spectate.md 1 章）
    //
    // 見るために入っているので、隠す理由が無い。
    // **倒れて観戦している人は別**（そちらは `isWatching` に入らない）
    if (isWatching(viewer.id)) {
      out.push(viewer);
      continue;
    }
    const theirs = teamOf(viewer);
    if (theirs === team) {
      // **味方には常に**
      out.push(viewer);
      continue;
    }
    // ---- **敵は、自分で見つけている人にだけ**（2026-08-25 変更）
    //
    // 「誰か 1 人でも見つけていれば敵全員に見える」にしていたので、
    // **壁の裏に居る自分にも、味方が見つけた相手が見えていた。**
    //
    // 見えているかは**見る人ごとに違う。** 見せ先も人ごとに決める
    if (!hidden && spotters.has(viewer.id)) out.push(viewer);
  }
  return out;
}

/** 透明になっているか */
function invisible(player: Player): boolean {
  try {
    return player.getEffect("invisibility") !== undefined;
  } catch {
    return false;
  }
}

/** 見せる相手を 1 つの文字にする。**変わったかを比べるため** */
function keyOf(audience: readonly Player[]): string {
  return audience
    .map((p) => p.id)
    .sort()
    .join(",");
}

/** 表示を消す */
export function hideMark(playerId: string): void {
  const now = marks.get(playerId);
  if (now === undefined) return;
  marks.delete(playerId);
  try {
    debugDrawer.removeShape(now.shape);
  } catch {
    /* 既に消えている */
  }
}

/** 全部消す。**試合が終わったとき** */
export function clearMarks(): void {
  for (const id of [...marks.keys()]) hideMark(id);
}

/**
 * 出し直す。**見張りの周期から呼ぶ。**
 *
 * 体力もガスも殴られるたびに変わるので、
 * 出したときのままでは古くなる。
 *
 * @param spotters その人を**見つけている敵の id**
 */
export function refreshMarks(spotters: (player: Player) => ReadonlySet<string>): void {
  const all = world.getAllPlayers();
  const live = new Set<string>();

  for (const player of all) {
    const team = teamOf(player);
    // **試合に入っていない人には出さない**（ロビーで文字が浮かぶ）
    if (team === undefined) continue;
    // ---- **観戦中は出さない**（2026-08-25 追加）
    //
    // 倒れて復活を待っている 5 秒間は観戦者になる
    //（`docs/spec/14-death.md`）。
    // **そこに居ない人の体力が浮いていても、読めるのは嘘だけ。**
    if (isSpectating(player)) {
      hideMark(player.id);
      continue;
    }
    live.add(player.id);

    const audience = audienceFor(player, team, spotters(player), all);
    const key = keyOf(audience);

    // ---- 誰にも見せないなら、出しておく理由が無い
    if (audience.length === 0) {
      hideMark(player.id);
      continue;
    }

    const text = textFor(player, team);
    const now = marks.get(player.id);

    // ---- 見せる相手だけが変わったなら、貼り直さずに差し替える
    //
    // **作り直すと一瞬消える。** それがちらつきの正体
    //（`features/generator` で分かったこと）
    if (now !== undefined && now.text === text) {
      if (now.audience !== key) {
        try {
          now.shape.visibleTo = audience;
          now.audience = key;
        } catch {
          /* 消えている */
        }
      }
      continue;
    }

    try {
      // ---- **先に新しいものを出してから、古いものを消す**
      const shape = new DebugText({ x: 0, y: HEIGHT, z: 0 }, text);
      // **相手に貼り付ける。** 位置は毎 tick 追いかけなくてよい
      shape.attachedTo = player;
      // **壁越しに描く。** 既定でこちらだが、意図として書いておく
      shape.depthTest = false;
      shape.color = COLOR[team];
      shape.visibleTo = audience;
      shape.maximumRenderDistance = RENDER_DISTANCE;
      debugDrawer.addShape(shape, player.dimension);

      if (now !== undefined) {
        try {
          debugDrawer.removeShape(now.shape);
        } catch {
          /* 既に消えている */
        }
      }
      marks.set(player.id, { shape, text, audience: key });
    } catch {
      /* 出せなかった。次の機会に */
    }
  }

  // **居なくなった人の表示を残さない**
  for (const id of [...marks.keys()]) if (!live.has(id)) hideMark(id);
}
