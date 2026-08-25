/**
 * 観戦。**試合に入らずに見る。**
 *
 * 仕様は `docs/spec/20-spectate.md`。
 *
 * ## 倒れている人の観戦とは別に持つ
 *
 * `features/death` も観戦者にするが、**混ぜてはいけない。**
 * 一緒にすると、**倒れた人まで抜けられてしまう。**
 *
 * こちらは「自分で入った人」だけを覚える。
 *
 * ## 抜け方は「真上を向く」
 *
 * **観戦者は持ち物を使えない。**
 * アイテムやボタンでは抜けられないので、視線と姿勢しか使えない。
 *
 * **しゃがみは使えない**（2026-08-25 変更）。
 * 観戦中のしゃがみは**下に降りる操作**なので、
 * 降りようとするたびに抜けてしまう。
 *
 * **真上を向いたら聞く。** そのまま抜けさせない——
 * 上を見上げただけで戻されるのでは、上が見られない。
 *
 * **抜け方は常に画面へ出す。** 知らない操作は書いていないと分からない。
 *
 * ## `/reload` をまたぐ（2026-08-25 追加）
 *
 * **メモリだけに持っていたので、読み込み直すと観戦者を見失っていた。**
 *
 * ゲームモードはスペクテイターのまま残るのに、こちらは忘れている——
 * **抜け方が効かず、観戦のまま迷子になる。**
 *
 * 人に印を付けて覚えておき、見張りの中で拾い直す
 *（`docs/spec/09-state-management.md` 4 章）。
 */

import { GameMode, system, world, type Player } from "@minecraft/server";
import { MessageFormData } from "@minecraft/server-ui";

import { shouldBeInBattle } from "../../lib/match-state.js";
import { ARENAS } from "../../lib/arena.js";
import { lobbyPoint } from "../../lib/lobby.js";
import { title } from "../../lib/fx.js";
import { giveLoadout } from "../loadout/index.js";

/** 見張る間隔（tick） */
const INTERVAL = 10;

/** 案内を出しておく長さ（tick）。**間隔より長くする**（切れ目を作らない） */
const HINT_TICKS = 30;

/**
 * 入った直後に視線を見ない時間（tick）。
 *
 * **入った瞬間に上を向いていることがある。**
 * そのまま見ると、入った瞬間に聞かれる。
 */
const GRACE = 20;

/**
 * 観戦を始める高さ（中央の島から、マス）。
 *
 * **見渡せる高さに出す。** 地面に置くと、
 * 目の前の壁しか見えないところから始まる。
 */
const WATCH_HEIGHT = 25;

/** 真上とみなす角度（度）。**-90 が真上** */
const LOOK_UP = -80;

/** 「いいえ」のあと、もう一度聞くまで（tick）。**3 秒** */
const ASK_AGAIN = 60;

/** いま聞いている人／断られた時刻。**二重に開かない** */
const asking = new Set<string>();
const declinedAt = new Map<string, number>();

/** 観戦中の印。**`/reload` で消えない** */
const KEY = "cw:watching";

/** いま観戦している人 → 入った tick。**印から拾い直せる** */
const watching = new Map<string, number>();

/** 印を書く／消す */
function mark(player: Player, on: boolean): void {
  try {
    player.setDynamicProperty(KEY, on ? true : undefined);
  } catch {
    /* 消えている */
  }
}

/** その人は観戦中か。**`features/spotting/marker.ts` が使う** */
export function isWatching(playerId: string): boolean {
  return watching.has(playerId);
}

/**
 * 観戦に入る。**入れなかった理由を返す**（入れたら undefined）。
 *
 * **いつでも入れる**（`docs/spec/20-spectate.md` 2 章）。
 * 試合をしていない間は、マップを見て回るのに使う。
 */
export function enterSpectate(player: Player): string | undefined {
  if (watching.has(player.id)) return undefined;
  // ---- **戦っている最中は入れない**（docs/spec/20-spectate.md 2 章）
  //
  // **逃げ道にしない。** 負けそうなときに消えるのが最適手になる。
  //
  // 所属では見ない（2026-08-25 修正）。
  // **所属は試合が終わっても残る**ので、
  // ロビーに居るのに「出ている」と判断していた
  if (shouldBeInBattle(player)) return "§c試合に出ている間は観戦できません";

  try {
    player.setGameMode(GameMode.Spectator);
  } catch {
    return "§c観戦にできませんでした";
  }

  // ---- **戦場へ運ぶ**（2026-08-25 追加）
  //
  // ロビーは戦場の外にある（`docs/spec/15-presentation.md` 1 章）。
  // 観戦者にしただけでは、**見たいものから遠く離れたまま。**
  //
  // 中央の島の上に出す。**そこから自由に動ける**ので、
  // 細かい位置は決めない
  try {
    const at = ARENAS[0].celebration;
    player.teleport({ x: at.x, y: at.y + WATCH_HEIGHT, z: at.z }, { dimension: player.dimension });
  } catch {
    /* 読み込まれていない。観戦そのものは続ける */
  }

  watching.set(player.id, system.currentTick);
  mark(player, true);
  player.sendMessage("§b観戦を始めました §f（真上を向くとロビーに戻れます）");
  return undefined;
}

/** 観戦をやめて、ロビーへ戻す */
export function leaveSpectate(player: Player): void {
  // **印は先に消す。** 覚えていなくても、印が残っていれば拾い直してしまう
  mark(player, false);
  if (!watching.delete(player.id)) return;
  asking.delete(player.id);
  declinedAt.delete(player.id);
  try {
    player.setGameMode(GameMode.Survival);
    player.teleport(lobbyPoint(), { dimension: player.dimension });
  } catch {
    /* 読み込まれていない。次の機会に */
  }

  // ---- **戻った瞬間に支給品を配る**（2026-08-25 追加）
  //
  // ロビーの見張りも 5 秒ごとに配り直すが、
  // **戻った直後に手ぶらなのは「壊れている」ように見える。**
  //
  // 観戦者は持ち物を使えないので、
  // **戻ってすぐ試せること**が観戦をやめる理由そのもの
  giveLoadout(player);

  player.sendMessage("§7観戦をやめました");
}

/**
 * 真上を向いていたら、戻るか聞く。
 *
 * **そのまま抜けさせない。**
 * 上を見上げただけで戻されるのでは、上が見られない。
 */
function askIfLookingUp(player: Player, now: number): void {
  if (asking.has(player.id)) return;
  const declined = declinedAt.get(player.id);
  if (declined !== undefined && now - declined < ASK_AGAIN) return;

  let pitch = 0;
  try {
    // **`x` が上下の角度。** -90 が真上
    pitch = player.getRotation().x;
  } catch {
    return;
  }
  if (pitch > LOOK_UP) return;

  asking.add(player.id);
  new MessageFormData()
    .title("観戦")
    .body("§fロビーに戻りますか？")
    .button1("§a戻る")
    .button2("§e観戦を続ける")
    .show(player)
    .then((res) => {
      asking.delete(player.id);
      // **閉じられたら続ける扱い。** 勝手に戻さない
      if (res.canceled || res.selection !== 0) {
        declinedAt.set(player.id, system.currentTick);
        return;
      }
      leaveSpectate(player);
    })
    .catch(() => {
      asking.delete(player.id);
    });
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function startSpectate(): void {
  system.runInterval(() => {
    // ---- **`/reload` で消えた分を拾い直す**（2026-08-25 追加）
    //
    // 印だけが頼り。**ここを通さないと、観戦のまま抜けられない**
    for (const player of world.getAllPlayers()) {
      if (watching.has(player.id)) continue;
      let marked = false;
      try {
        marked = player.getDynamicProperty(KEY) === true;
      } catch {
        continue;
      }
      // **入った時刻は今にする。** 拾い直した直後に聞かれないように
      if (marked) watching.set(player.id, system.currentTick);
    }

    if (watching.size === 0) return;
    const now = system.currentTick;

    for (const player of world.getAllPlayers()) {
      const since = watching.get(player.id);
      if (since === undefined) continue;

      // ---- 真上を向いたら聞く
      if (now - since >= GRACE) askIfLookingUp(player, now);

      // ---- **抜け方を常に出す**（一度出して消すと、後から入った人が困る）
      //
      // **聞いている間は出さない。** 画面が二重になる
      if (!asking.has(player.id)) {
        title(player, "", "§b観戦中  §f真上を向くと ロビーに戻ります", HINT_TICKS);
      }

      // **観戦者から外れていたら戻す。** 他の処理と押し合わないように
      try {
        if (player.getGameMode() !== GameMode.Spectator) player.setGameMode(GameMode.Spectator);
      } catch {
        /* 消えている */
      }
    }

    // **居なくなった人を残さない**
    for (const id of [...watching.keys()]) {
      if (!world.getAllPlayers().some((p) => p.id === id)) watching.delete(id);
    }
  }, INTERVAL);
}
