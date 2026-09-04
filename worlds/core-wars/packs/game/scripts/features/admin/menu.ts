/**
 * 設定メニュー。**運営の道具はここに集める。**
 *
 * 仕様は `docs/spec/19-admin-menu.md`。
 *
 * ## なぜ 1 つにまとめるのか
 *
 * **ロビーが道具まみれで邪魔だった。**
 * 開始・建築・掃除・状態・値段・移動で**枠を 6 つ占めていた**ので、
 * 遊ぶ人と同じ状態で試すのに持ち物が埋まっていた。
 *
 * **機能を足すほど邪魔になる**作りでもあった。
 *
 * ## 進行そのものは持たない
 *
 * **`features/match` を呼ぶだけ。**
 * 同じ処理を 2 か所に置くと必ず食い違う。
 */

import { GameMode, world, type Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

import {
  coreLeft,
  coreStart,
  forceCore,
  isRunning,
  matchState,
  matchStateName,
  setCoreStart,
  teamName,
  teamOf,
  type Team,
} from "../../lib/match-state.js";
import { ARENAS } from "../../lib/arena.js";
import { bar } from "../../lib/fx.js";
import { autoStart, manualTeams, setAutoStart, setManualTeams } from "../../lib/settings.js";
import { showRules as showRuleSettings } from "./rules.js";
import { showRoleAdmin } from "./roles.js";
import {
  KIND_COLOR,
  ROLES,
  ROLE_ORDER,
  disabledRoles,
  pointsOf,
  roleEnabled,
  roleOf,
  unlockRole,
} from "../../lib/roles.js";
import { changeRole } from "../role/change.js";
import { showPoints } from "./points.js";
import { isRookie } from "../../lib/first.js";
import { isOp } from "../../lib/op.js";
import { beginFromMenu, clearTeam, forceTeam, runAdminCommand } from "../match/index.js";
import { resetToLobby } from "../lobby/reset.js";
import { clearTimeoutOf, isTimedOut, setTimeout, timeoutLeftMinutes } from "../../lib/timeout.js";
import { autoStartLeft } from "./autostart.js";
import { enterSpectate } from "../spectate/index.js";
import { phase, phase1LeftSeconds } from "../../lib/phase.js";
import { setPhase } from "../phase/index.js";

/**
 * 入り／切りを同じ形で出す。
 *
 * **灰色（`§7` / `§8`）は使わない**（2026-08-25 変更）。
 * 画面の地の色と重なって**読めない。**
 * 切は赤にする。色だけで入切が分かるほうが速い。
 */
function onOff(on: boolean): string {
  return on ? "§a入" : "§c切";
}

/** 説明の色。**地に沈まない明るさにする** */
const DIM = "§f";

/**
 * 止めているロールの数。**開かずに分かるようにする**
 *（`docs/spec/19-admin-menu.md` 10 章）。
 *
 * 止めたことを忘れたまま「なぜか選べない」と言われるのを避ける。
 */
function roleOffLabel(): string {
  const n = disabledRoles().size;
  return n === 0 ? "" : `  §c${n} 個 停止中`;
}

/**
 * 設定を開く。
 *
 * **オペレーターだけ**（`docs/spec/19-admin-menu.md` 3 章）。
 * 名前では決めない。
 */
export function showSettings(player: Player): void {
  if (!isOp(player)) return;

  const state = matchState();
  const left = autoStartLeft();

  const form = new ActionFormData().title("設定").body(
    `${DIM}状態  §e${matchStateName(state)}\n` +
      `${DIM}チーム分け  §e${manualTeams() ? "手動" : "自動"}\n` +
      `${DIM}自動開始  ${onOff(autoStart())}${left > 0 ? ` §e(あと ${left} 秒)` : ""}
` +
      `${DIM}フェーズ  ${phaseLabel()}`
  );

  // **並びは固定。** 押す場所が毎回変わると、覚えられない
  const items: { label: string; icon?: string; run: (p: Player) => void }[] = [
    {
      label: isRunning() ? "§c試合を強制終了" : "§a試合を開始",
      icon: isRunning() ? "textures/items/barrier" : "textures/items/emerald",
      run: (p) => {
        if (isRunning()) runAdminCommand(p, "abort");
        else p.sendMessage(beginFromMenu(p));
      },
    },
    {
      label: `§f自動開始  ${onOff(autoStart())}`,
      icon: "textures/items/clock_item",
      run: (p) => {
        setAutoStart(!autoStart());
        p.sendMessage(autoStart() ? "§a自動開始を入にした" : "§c自動開始を切にした");
        showSettings(p);
      },
    },
    {
      label: `§fチーム分け  §e${manualTeams() ? "手動" : "自動"}`,
      icon: "textures/items/banner_pattern",
      run: (p) => {
        setManualTeams(!manualTeams());
        p.sendMessage(manualTeams() ? "§eチーム分けを手動にした" : "§aチーム分けを自動にした");
        showSettings(p);
      },
    },
    { label: "§fコアの数", icon: "textures/items/diamond_block", run: (p) => showCore(p) },
    {
      label: `§fフェーズ  ${phaseLabel()}`,
      icon: "textures/items/clock_item",
      run: (p) => showPhase(p),
    },
    {
      label: "§fルール調整",
      icon: "textures/items/book_writable",
      run: (p) => showRuleSettings(p, (q) => showSettings(q)),
    },
    {
      // **止めているものがあるなら、開かなくても分かるようにする**
      label: `§fロール管理${roleOffLabel()}`,
      icon: "textures/items/game_role_swift",
      run: (p) => showRoleAdmin(p, (q) => showSettings(q)),
    },
    { label: "§fプレイヤー管理", icon: "textures/items/name_tag", run: (p) => showPlayers(p) },
    {
      label: "§fポイントを配る  §7全員",
      icon: "textures/items/experience_bottle",
      run: (p) => showPoints(p, undefined, (q) => showSettings(q)),
    },
    { label: "§f建築モード 切替", icon: "textures/items/brick", run: (p) => runAdminCommand(p, "build") },
    { label: "§f後片付け", icon: "textures/items/sponge", run: (p) => runAdminCommand(p, "clean") },
    { label: "§f状態を見る", icon: "textures/items/book_normal", run: (p) => runAdminCommand(p, "status") },
    { label: "§f値段を編集", icon: "textures/items/gold_ingot", run: (p) => runAdminCommand(p, "price") },
    { label: "§fマップ移動", icon: "textures/items/compass_item", run: (p) => runAdminCommand(p, "warp") },
    { label: "§fモード切替", icon: "textures/items/diamond", run: (p) => toggleMode(p) },
  ];

  for (const it of items) form.button(it.label, it.icon);

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      items[res.selection]?.run(player);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * いまのフェーズ。**残り秒も添える。**
 *
 * 押す前に、いまどちらなのかが分からないと選べない。
 */
function phaseLabel(): string {
  if (phase() === 2) return "§62";
  return `§b1 §e(あと ${phase1LeftSeconds()} 秒)`;
}

/**
 * フェーズを指定する。
 *
 * 仕様は `docs/spec/19-admin-menu.md` 5-A。
 *
 * **切り替えではなく、直接指定にする。**
 * 押すたびに入れ替わる作りだと、**いまどちらなのかを覚えていないと押せない。**
 */
function showPhase(player: Player): void {
  if (!isOp(player)) return;

  const form = new ActionFormData()
    .title("フェーズ")
    .body(`${DIM}いま  ${phaseLabel()}\n${DIM}状態  §e${matchStateName(matchState())}`)
    .button("§bフェーズ 1 にする\n§f5 分に戻る・コアを削れない", "textures/items/shield")
    .button("§6フェーズ 2 にする\n§fすぐコアを削れる", "textures/items/diamond_pickaxe")
    .button("§e戻る", "textures/items/arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection === 2) {
        showSettings(player);
        return;
      }
      setPhase(res.selection === 0 ? 1 : 2);
      showSettings(player);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * コアの数を直す。
 *
 * 仕様は `docs/spec/19-admin-menu.md` 7 章。
 *
 * | | いつ効くか |
 * | --- | --- |
 * | **開始時の数** | **次の試合から** |
 * | **いまの残り** | **その場で**（試合中だけ意味がある） |
 *
 * **2 つを 1 つの画面に出す。**
 * 「開始時を変えたのに減らない」「残りを変えたのに次で戻る」は、
 * **分けて置くと必ず起きる。**
 */
function showCore(player: Player): void {
  const a = ARENAS[0];
  const red = coreLeft(a.id, "red");
  const blue = coreLeft(a.id, "blue");
  const start = coreStart();

  new ModalFormData()
    .title("コアの数")
    .textField(
      `開始時のコア（次の試合から）
${DIM}いま ${start}`,
      `${start}`,
      { defaultValue: `${start}` }
    )
    .textField(
      `${teamName("red")}§r の残り
${DIM}いま ${red}`,
      `${red}`,
      { defaultValue: `${red}` }
    )
    .textField(
      `${teamName("blue")}§r の残り
${DIM}いま ${blue}`,
      `${blue}`,
      { defaultValue: `${blue}` }
    )
    .show(player)
    .then((res) => {
      if (res.canceled || res.formValues === undefined) {
        showSettings(player);
        return;
      }
      const said: string[] = [];

      const s = Number(String(res.formValues[0] ?? "").trim());
      if (s !== start) {
        if (setCoreStart(s)) said.push(`§7開始時  §f${coreStart()}`);
        else said.push("§c開始時は 1 以上の数");
      }

      const pairs: [number, Team, number][] = [
        [1, "red", red],
        [2, "blue", blue],
      ];
      for (const [i, team, was] of pairs) {
        const v = Number(String(res.formValues[i] ?? "").trim());
        if (v === was) continue;
        if (forceCore(a.id, team, v)) said.push(`${teamName(team)}§r§7  §f${coreLeft(a.id, team)}`);
        else said.push(`§c${teamName(team)}§c の数が読めない`);
      }

      showSettings(player);
      bar(player, said.length === 0 ? "§7変えなかった" : `§aコアを直した §7${said.join("§7 / ")}`);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** サバイバルとクリエイティブの往復 */
function toggleMode(player: Player): void {
  try {
    const now = player.getGameMode();
    const next = now === GameMode.Creative ? GameMode.Survival : GameMode.Creative;
    player.setGameMode(next);
    player.sendMessage(next === GameMode.Creative ? "§dクリエイティブ" : "§aサバイバル");
  } catch {
    /* 消えている */
  }
}

// ---------------------------------------------------------------- プレイヤー管理
/** いまの所属を短く出す */
function teamLabel(player: Player): string {
  const t = teamOf(player);
  const team = t === undefined ? "§e所属なし" : teamName(t);
  const left = timeoutLeftMinutes(player);
  return left > 0 ? `${team}  §cタイムアウト ${left} 分` : team;
}

/**
 * 一覧から 1 人選ぶ。
 *
 * **所属も出す**（`docs/spec/19-admin-menu.md` 6 章）。
 * 一覧を見ただけで、どちらが何人か分かるようにする。
 */
export function showPlayers(player: Player): void {
  if (!isOp(player)) return;
  const all = world.getAllPlayers();

  const form = new ActionFormData().title("プレイヤー管理").body(`${DIM}${all.length} 人`);
  // **初参加の人には印を出す**（`docs/spec/24-role.md` 3-2-B）。
  // **説明する相手が要る**ので、一覧で分かるようにする
  for (const p of all) {
    form.button(`§f${p.name}${isRookie(p) ? " §e[初]" : ""}\n${teamLabel(p)}`, "textures/items/name_tag");
  }
  form.button("§e戻る", "textures/items/arrow");

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection >= all.length) {
        showSettings(player);
        return;
      }
      showOnePlayer(player, all[res.selection].id);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/** 名前は変わりうるので、id で引き直す */
function byId(id: string): Player | undefined {
  return world.getAllPlayers().find((p) => p.id === id);
}

/** 1 人に対してできること */
function showOnePlayer(admin: Player, targetId: string): void {
  const target = byId(targetId);
  if (target === undefined) {
    admin.sendMessage("§cその人はもう居ません");
    showPlayers(admin);
    return;
  }

  /**
   * 一覧に並べる操作。
   *
   * `own` は「**この操作が自分で次の画面を出す**」という印。
   * 立てておかないと、**押した先の画面とプレイヤー一覧が二重に開く**
   *（2026-08-26 修正）。
   */
  const actions: { label: string; run: () => void; own?: boolean }[] = [
    {
      label: "§c赤へ",
      run: () => {
        forceTeam(target, "red");
        admin.sendMessage(`§f${target.name} を ${teamName("red")}§f にした`);
        target.sendMessage(`§f運営により ${teamName("red")}§f になりました`);
      },
    },
    {
      label: "§9青へ",
      run: () => {
        forceTeam(target, "blue");
        admin.sendMessage(`§f${target.name} を ${teamName("blue")}§f にした`);
        target.sendMessage(`§f運営により ${teamName("blue")}§f になりました`);
      },
    },
    {
      label: "§e所属を外す",
      run: () => {
        clearTeam(target);
        admin.sendMessage(`§f${target.name} の所属を外した`);
        target.sendMessage("§e運営により試合から外れました");
      },
    },
    {
      label: "§eロビーへ戻す",
      run: () => {
        resetToLobby(target, true);
        admin.sendMessage(`§f${target.name} をロビーへ戻した`);
      },
    },
    {
      label: isTimedOut(target) ? "§aタイムアウトを解く" : "§6タイムアウト（1 時間）",
      run: () => {
        if (isTimedOut(target)) {
          clearTimeoutOf(target);
          admin.sendMessage(`§a${target.name} のタイムアウトを解いた`);
          target.sendMessage("§aタイムアウトが解けました");
          return;
        }
        // **所属も外す。** 入れないのに試合に居るのはおかしい
        setTimeout(target);
        clearTeam(target);
        admin.sendMessage(`§6${target.name} を 1 時間タイムアウトにした`);
        target.sendMessage("§cタイムアウトになりました §e1 時間、試合に参加できません");
      },
    },
    {
      label: "§b観戦にする",
      run: () => {
        const why = enterSpectate(target);
        if (why !== undefined) admin.sendMessage(why);
        else admin.sendMessage(`§f${target.name} を観戦にした`);
      },
    },
    {
      label: `§fロールを変える  §b${roleOf(target).name}`,
      run: () => showRolePick(admin, targetId),
      own: true,
    },
    {
      label: `§fポイント  §e${pointsOf(target)}P`,
      run: () => showPoints(admin, targetId, (p) => showOnePlayer(p, targetId)),
      own: true,
    },
    { label: "§c§lキック", run: () => askKick(admin, targetId), own: true },
  ];

  const form = new ActionFormData()
    .title(target.name)
    .body(`${DIM}いまの所属  ${teamLabel(target)}\n${DIM}状態  §e${matchStateName(matchState())}`);
  for (const a of actions) form.button(a.label);
  form.button("§e戻る", "textures/items/arrow");

  form
    .show(admin)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection >= actions.length) {
        showPlayers(admin);
        return;
      }
      const action = actions[res.selection];
      if (action === undefined) return;
      action.run();
      // **自分で次の画面を出す操作は、ここで戻さない。** 二重に開く
      if (action.own !== true) showPlayers(admin);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * その人のロールを選び直す。**運営の道具**（`docs/spec/24-role.md` 3 章）。
 *
 * ## 買っていなくても選べる
 *
 * **試すためのもの。** 点を貯めないと触れないのでは、確かめようが無い。
 *
 * 選んだロールは**その人のものとして記録する**（買った扱い）。
 * 運営が試したあと、本人が盤面から戻せなくなるのを避ける。
 */
function showRolePick(admin: Player, targetId: string): void {
  const target = world.getAllPlayers().find((p) => p.id === targetId);
  if (target === undefined) {
    admin.sendMessage("§7その人はもう居ません");
    showPlayers(admin);
    return;
  }

  const now = roleOf(target);
  const form = new ActionFormData().title(`${target.name} のロール`).body(`${DIM}いま  §b${now.name}
${DIM}選ぶと、その場で一度倒れます（持ち物は残る）`);

  for (const id of ROLE_ORDER) {
    const role = ROLES[id];
    const here = role.id === now.id;
    // **止めてあるロールは、押しても `changeRole` が弾く。**
    // ここは見せ方だけ——押す前に分かるようにする
    const off = !roleEnabled(id) ? "  §c使用停止" : "";
    form.button(`${here ? "§a" : KIND_COLOR[role.kind]}${role.name}${here ? "  §7(いま)" : ""}${off}`, role.icon);
  }
  form.button("§e戻る", "textures/items/arrow");

  form
    .show(admin)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      if (res.selection >= ROLE_ORDER.length) {
        showOnePlayer(admin, targetId);
        return;
      }
      const id = ROLE_ORDER[res.selection];
      if (id === undefined) return;

      // **買った扱いにする。** 本人が盤面から戻せるように
      unlockRole(target, id);
      const why = changeRole(target, id);
      admin.sendMessage(why ?? `§f${target.name} を §b${ROLES[id].name}§f にした`);
      showOnePlayer(admin, targetId);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * キックの確認。
 *
 * **理由を添える**（`docs/spec/19-admin-menu.md` 6 章）。
 * 追い出された側に何も伝わらないのが一番困る。
 */
function askKick(admin: Player, targetId: string): void {
  const target = byId(targetId);
  if (target === undefined) return;
  const name = target.name;

  new ModalFormData()
    .title(`${name} をキック`)
    .textField("§f理由", "書かなくてもよい")
    .submitButton("キックする")
    .show(admin)
    .then((res) => {
      if (res.canceled || res.formValues === undefined) return;
      const reason = String(res.formValues[0] ?? "").trim();
      kick(admin, name, reason);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * 追い出す。
 *
 * **Script API に手立てが無い**ので `/kick` を通す。
 * 単独プレイなど使えない環境があるので、**失敗したら失敗したと伝える。**
 * 黙って何も起きないのが一番困る。
 */
function kick(admin: Player, name: string, reason: string): void {
  try {
    const arg = reason === "" ? "" : ` ${reason}`;
    world.getDimension("overworld").runCommand(`kick "${name}"${arg}`);
    admin.sendMessage(`§a${name} をキックした${reason === "" ? "" : ` §e(${reason})`}`);
  } catch {
    admin.sendMessage(`§c${name} をキックできませんでした §e(この環境では /kick が使えません)`);
  }
}
