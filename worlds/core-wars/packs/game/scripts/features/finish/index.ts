/**
 * 決着の見せ方。
 *
 * 仕様は `docs/spec/15-presentation.md` 4-3 / 4-4。
 *
 * ## 4 段構え
 *
 * ```
 * コアが 0 になる
 *   ↓  すぐ
 * 勝敗をタイトルで表示・音・大爆発
 *   ↓  3 秒
 * マップ中央へ全員テレポート（散らす）・勝った側から花火
 *      花火の間に、戦績を 1 塊ずつチャットへ流す
 *   ↓  10 秒
 * ロビーへテレポート
 * ```
 *
 * ## 戦績はチャットに出す
 *
 * **タイトルには出さない**（2026-08-25 変更）。
 * 真ん中に順番に出すと**前のものを上書きして消える**ので、
 * 読み逃したら戻れない。チャットなら遡れる。
 *
 * ## なぜ中央へ集めるのか
 *
 * **勝った側と負けた側が同じ場所に立つ。**
 * 拠点に散らばったまま終わると、勝った実感も負けた実感も出ない。
 */

import { GameMode, system, world, type Dimension, type Player, type Vector3 } from "@minecraft/server";

import { ARENAS, type Team } from "../../lib/arena.js";
import { coreLeft, setCelebrating, teamName, teamOf } from "../../lib/match-state.js";
import { lobbyPoint } from "../../lib/lobby.js";
import {
  buildAwards,
  collectStats,
  kd,
  lastResult,
  mvpScore,
  saveAwards,
  saveResult,
  type Stat,
} from "../../lib/stats.js";
import { particle, soundAll, titleAll } from "../../lib/fx.js";
import { resetToLobby } from "../lobby/reset.js";

/** 中央へ集めるまで（tick）。**3 秒** */
const TO_CENTER = 60;

/** 花火を上げる長さ（tick）。**10 秒** */
const SHOW_TICKS = 200;

/** 何 tick ごとに花火を上げるか。**多いほど賑やか** */
const FIREWORK_EVERY = 8;

/** 1 回に上げる数 */
const FIREWORKS_PER_SHOT = 2;

/** 拠点のどれくらいの広さに散らすか（マス） */
const FIREWORK_SPREAD = 24;

/** 打ち上げ始める高さ（コアから何マス上か） */
const LAUNCH_Y = 10;

/** 何マス昇るか。**中央（y 20）から見上げられる高さまで** */
const RISE_HEIGHT = 28;

/** 昇りきるまで（tick）。**1 tick に 1.4 マス** */
const RISE_TICKS = 20;

/** 開いたときに散る粒の数 */
const BURST_COUNT = 36;

/** 開く大きさ（マス） */
const BURST_RADIUS = 3.5;

/** 中央でどれだけ散らすか（マス）。**重なって埋まるのを避ける** */
const SPREAD = 8;

/**
 * 円状に散らす。
 *
 * **人数が分からないので、番号から角度を決める。**
 * 等間隔に並ぶので、重なりようがない。
 */
function spreadAt(center: Vector3, index: number, total: number): Vector3 {
  if (total <= 1) return { x: center.x, y: center.y, z: center.z };
  const a = (index / total) * Math.PI * 2;
  return {
    x: center.x + Math.cos(a) * SPREAD,
    y: center.y,
    z: center.z + Math.sin(a) * SPREAD,
  };
}

function moveTo(player: Player, at: Vector3, facing?: Vector3): void {
  try {
    // **観戦者のまま祝わせない。** 倒れていた人も一緒に立たせる。
    // **サバイバルに戻す。** 遊ぶ人の既定の状態はこれ
    if (player.getGameMode() === GameMode.Spectator) player.setGameMode(GameMode.Survival);
    // ---- **勝った側を向かせる**（2026-08-25 追加）
    //
    // 円状に散らすので、**向きを揃えないと全員がばらばらの方を見ている。**
    // 花火は勝った側の拠点から上がるので、
    // **そちらを向いていれば、振り向かなくても目に入る。**
    player.teleport(at, { dimension: player.dimension, facingLocation: facing });
  } catch {
    /* 読み込まれていない */
  }
}

/**
 * 花火を上げる。
 *
 * **勝った側の頭上から。** 誰が勝ったかを文字を読まずに分かるようにする。
 */
function fireworks(winner: Team): void {
  const dim = world.getDimension("overworld");
  // **勝った側の拠点から上げる**（2026-08-25 変更）。
  //
  // プレイヤーの足元から上げていたが、
  // **中央に集めた直後なので、両チームが混ざって誰の花火か分からない。**
  //
  // 拠点なら**場所そのものが持ち主を表す。**
  const base = ARENAS[0].cores[winner];
  const x = base.x + (Math.random() - 0.5) * FIREWORK_SPREAD;
  const z = base.z + (Math.random() - 0.5) * FIREWORK_SPREAD;
  const from = base.y + LAUNCH_Y;

  soundAll("firework.launch", 1, 0.4);

  // **昇っていく筋を描き、上りきったところで開く**
  //
  // **煙は使わない**（2026-08-25 変更）。
  // 焚き火の煙を尾に敷いていたが、**灰色の塊が浮いているだけ**に見えた。
  //
  // 火花（`sparkler_emitter`）と光の粒（`glow_particle`）を重ねる。
  // どちらも**明るく、すぐ消える。** 尾として残らないので、
  // 「昇っている」ことだけが伝わる
  for (let t = 1; t <= RISE_TICKS; t++) {
    system.runTimeout(() => {
      const y = from + (RISE_HEIGHT * t) / RISE_TICKS;
      particle({ x, y, z }, "minecraft:sparkler_emitter", dim);
      particle({ x, y: y - 0.4, z }, "minecraft:glow_particle", dim);
      if (t === RISE_TICKS) burstAt(dim, { x, y, z }, winner);
    }, t);
  }
}

/**
 * 花火が開く。
 *
 * **チームの色で開く。** 誰が勝ったかを、文字を読まずに分かるようにする。
 */
function burstAt(dim: Dimension, at: Vector3, winner: Team): void {
  const flame = winner === "blue" ? "minecraft:blue_flame_particle" : "minecraft:basic_flame_particle";
  for (let i = 0; i < BURST_COUNT; i++) {
    // **球の上に散らす。** 一方向に偏らせない
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = BURST_RADIUS * (0.6 + Math.random() * 0.4);
    const spot = {
      x: at.x + r * Math.sin(phi) * Math.cos(theta),
      y: at.y + r * Math.cos(phi),
      z: at.z + r * Math.sin(phi) * Math.sin(theta),
    };
    // **色の粒と光る粒を混ぜる。** 色だけだと暗くて遠くから見えない
    particle(spot, i % 3 === 0 ? flame : "minecraft:totem_particle", dim);
  }
  soundAll("firework.large_blast", 1, 0.5);
  soundAll("firework.twinkle", 1, 0.35);
}

/** 上から何位までを出すか。**多いと読めない** */
const TOP_N = 3;

function rank(stats: readonly Stat[], by: (s: Stat) => number): Stat[] {
  return [...stats]
    .filter((s) => by(s) > 0)
    .sort((a, b) => by(b) - by(a))
    .slice(0, TOP_N);
}

/** 左端の縦線。**1 続きの塊に見せる** */
const BAR = "§8│";

/** 順位の印。**4 位以下は出さない** */
const MARKS = ["§6▌", "§7▌", "§8▌"] as const;

/**
 * 順位の塊を 1 つ作る。
 *
 * ```
 * §8│ §6◆ §fコア破壊
 * §8│ §6▌ §fzerda256py §8·  §f12 回
 * ```
 */
function line(label: string, list: readonly Stat[], value: (s: Stat) => string): string[] {
  if (list.length === 0) return [];
  const out = [`${BAR} §6◆ §f§l${label}`];
  list.forEach((s, i) => {
    const mark = MARKS[i] ?? "§8▌";
    out.push(`${BAR} ${mark} §f${s.name} §8·  §f${value(s)}`);
  });
  return out;
}

/**
 * 戦績を**塊ごとに**作る。
 *
 * **一度に全部出さない**（2026-08-25 変更）。
 * まとめて流すと 15 行が一気に流れ、**誰も読まない。**
 *
 * 塊の単位で 1 つずつ出すために、行ではなく**塊の配列**を返す。
 * 見返す用（`/game:result`）には、これを平らにして渡す。
 */
function resultBlocks(winner: Team, loser: Team): string[][] {
  const stats = collectStats();
  const a = ARENAS[0];
  const blocks: string[][] = [];

  // ---- 表題と勝敗
  blocks.push([
    "§6§l━━━━━━━━━  戦 績  ━━━━━━━━━§r",
    `${BAR} §6§l勝利  §r${teamName(winner)}`,
    `${BAR} §7コア残り  ${teamName(winner)} §f${coreLeft(a.id, winner)}§7  /  ${teamName(loser)} §f${coreLeft(a.id, loser)}`,
    BAR,
  ]);

  const core = line(
    "コア破壊",
    rank(stats, (s) => s.core),
    (s) => `${s.core} 回`
  );
  if (core.length > 0) blocks.push([...core, BAR]);

  const kill = line(
    "キル",
    rank(stats, (s) => s.kill),
    (s) => `${s.kill} §7/ §f${s.death}`
  );
  if (kill.length > 0) blocks.push([...kill, BAR]);

  const ratio = line(
    "K/D",
    // **1 回も死んでいない人を上に出すため、キルが 0 の人は外す**
    [...stats]
      .filter((s) => s.kill > 0)
      .sort((x, y) => kd(y) - kd(x))
      .slice(0, TOP_N),
    (s) => kd(s).toFixed(2)
  );
  if (ratio.length > 0) blocks.push([...ratio, BAR]);

  // ---- 締めは MVP。**最後に置いて、いちばん盛り上げる**
  const mvp = [...stats].sort((x, y) => mvpScore(y) - mvpScore(x))[0];
  const tail: string[] = [];
  if (mvp !== undefined && mvpScore(mvp) > 0) {
    tail.push(`${BAR} §e§l★ MVP  §r§e§l${mvp.name}`);
    tail.push(`${BAR} §7   コア §f${mvp.core}§7 ・ キル §f${mvp.kill}§7 ・ デス §f${mvp.death}`);
  }
  tail.push("§6§l━━━━━━━━━━━━━━━━━━━━━━§r");
  blocks.push(tail);

  return blocks;
}

/** 見返す用に、塊を平らにする */
function flatten(blocks: readonly string[][]): string[] {
  const out: string[] = [];
  for (const b of blocks) out.push(...b);
  return out;
}

/** 戦績を出し始めるまで（tick）。**花火が上がってから少し置く** */
/**
 * 見上げる高さ（マス）。
 *
 * **拠点そのものではなく、少し上を向かせる。**
 * 拠点は 100 マス以上先にあるので、真っ直ぐ向くとほぼ水平——
 * **花火が上がる高さが画面の外に出る。**
 */
const LOOK_UP = 24;

const REVEAL_START = 30;

/** 塊と塊の間（tick）。**1.5 秒。** 読む間を作る */
const REVEAL_EVERY = 30;

/**
 * 戦績を**塊ごとに 1 つずつ**チャットへ流す。
 *
 * **タイトルは使わない**（2026-08-25 変更）。
 * 画面の真ん中に出すと**前のものを上書きして消える**ので、
 * 読み逃すと戻れない。チャットなら後から遡れる。
 *
 * 音を添えるのは、**次が来たことに気づかせるため。**
 * 最後（MVP と締め）だけ、盛り上がる音に変える。
 */
function streamResult(blocks: readonly string[][]): void {
  blocks.forEach((block, i) => {
    system.runTimeout(
      () => {
        for (const l of block) world.sendMessage(l);
        const last = i === blocks.length - 1;
        soundAll(last ? "random.levelup" : "random.toast", last ? 1 : 1.2, 0.8);
      },
      REVEAL_START + i * REVEAL_EVERY
    );
  });
}

/**
 * 決着の演出を始める。
 *
 * `features/match` の `finishMatch` から呼ぶ。
 *
 * **状態はもう「非開始」になっている。**
 * ここでやるのは見せることと、集めることだけ。
 */
export function celebrate(winner: Team, loser: Team): void {
  // **演出が終わるまで、戦場に居ることにする**
  //（docs/spec/15-presentation.md 4-3）。
  // これが無いと、コアが 0 になった瞬間に境界がロビーへ送ってしまう
  setCelebrating(true);

  // ---- 1 段目: 勝敗を出す
  for (const p of world.getAllPlayers()) {
    const won = teamOf(p) === winner;
    try {
      p.onScreenDisplay.setTitle(won ? "§6§lVICTORY" : "§c§lDEFEAT", {
        subtitle: `${teamName(winner)}§7 の勝ち`,
        fadeInDuration: 4,
        stayDuration: 50,
        fadeOutDuration: 10,
      });
      p.playSound(won ? "random.levelup" : "mob.wither.death", { location: p.location, pitch: won ? 1 : 0.7 });
    } catch {
      /* 消えている */
    }
  }
  soundAll("ui.toast.challenge_complete", 1, 1);

  // ---- 2 段目: 中央へ集めて花火。**その間に見どころを 1 つずつ出す**
  system.runTimeout(() => {
    const center = ARENAS[0].celebration;
    const all = world.getAllPlayers();
    // **勝った側の拠点のほう**を向かせる。花火が上がるのもそこ
    const core = ARENAS[0].cores[winner];
    const look = { x: core.x, y: core.y + LOOK_UP, z: core.z };
    all.forEach((p, i) => moveTo(p, spreadAt(center, i, all.length), look));
    titleAll("", `${teamName(winner)}§7 の勝利`, 40);

    for (let t = 0; t < SHOW_TICKS; t += FIREWORK_EVERY) {
      system.runTimeout(() => fireworks(winner), t);
    }

    // ---- **戦績はここで作って、花火の間に流す**
    //
    // 状態を降ろす前に作る。降ろすと所属が読めなくなる
    const blocks = resultBlocks(winner, loser);
    saveResult(flatten(blocks));

    // **掲示板のぶんも、ここで控える**（docs/spec/15-presentation.md 4-6）。
    // 次の試合が始まると個人の戦績は 0 に戻るので、
    // **この瞬間に残しておかないと、始まった瞬間に掲示板が空になる**
    saveAwards(buildAwards(collectStats()));

    streamResult(blocks);
  }, TO_CENTER);

  // ---- 3 段目: ロビーへ戻す
  system.runTimeout(() => {
    const at = lobbyPoint();
    for (const p of world.getAllPlayers()) {
      // **ロビーの人に戻す**（features/lobby/reset.ts に集約）
      resetToLobby(p, false);
      moveTo(p, at);
    }
    // **戦績はもう流してある。** ここで出し直すと二重になる
    world.sendMessage("§7戦績は §f/game:result§7 で見返せます");

    // ---- **ここで「試合していない状態」に戻る**
    //
    // 移し終わってから降ろす。
    // 先に降ろすと、移す途中で境界が割り込む
    setCelebrating(false);
  }, TO_CENTER + SHOW_TICKS);
}

/** 前の試合の戦績を、頼まれたら出す */
export function showLastResult(player: Player): void {
  const lines = lastResult();
  if (lines.length === 0) {
    player.sendMessage("§7まだ試合の記録がありません");
    return;
  }
  for (const l of lines) player.sendMessage(l);
}
