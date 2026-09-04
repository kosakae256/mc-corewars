/**
 * ロールの盤面。
 *
 * 仕様は `docs/spec/24-role.md` 2-1・3 章。
 *
 * ## 並べるだけ
 *
 * **中身は `lib/roles.ts` の一覧そのまま。**
 * ロールを足せば**そのまま並ぶ。**
 */

import { type Player } from "@minecraft/server";

import { ChestFormData } from "../../vendor/chest-ui/forms.js";
import { CHEST_SIZE } from "../shop/index.js";
import {
  KIND_COLOR,
  KIND_NAME,
  type RoleKind,
  ROLES,
  ROLE_ORDER,
  type RoleId,
  hasRole,
  pointsOf,
  roleEnabled,
  roleOf,
  spendPoints,
  unlockRole,
} from "../../lib/roles.js";
import { changeRole } from "./change.js";
import { practicing } from "../../lib/practice.js";
import { BAR, bar } from "../../lib/fx.js";

/**
 * ゲージの目盛りの数。**ガスの表示と同じ字を使う**（`features/grapple`）。
 *
 * **長いほうが差が読み取れる**（2026-08-26。10 → 20）。
 * ガスの表示も 20 本なので、**そちらと同じ長さ**になる。
 */
const SEG = 20;

/** ゲージいっぱいの目安 */
const FULL = {
  /** 射程（マス）。**これ以上は振り切れ** */
  range: 45,
  /** マナ 1 回ぶん */
  mana: 20,
  /** 移動中のマナ（1 tick） */
  drain: 2,
  /** 加速の倍率 */
  speed: 8,
} as const;

/**
 * ゲージを描く。
 *
 * **埋まっている側と空いている側で、同じ字を色だけ変える。**
 * 字を変えると幅が揃わず、**目盛りが伸び縮みして見える**
 *（`docs/spec/15-presentation.md` 7-3-A と同じ考え）。
 */
function gauge(value: number, full: number, color: string): string {
  const filled = Math.max(0, Math.min(SEG, Math.round((value / full) * SEG)));
  return `${color}${"|".repeat(filled)}§8${"|".repeat(SEG - filled)}`;
}

/**
 * 1 行ぶん。**名前・ゲージ・数字。**
 *
 * **名前は必ず 4 文字**（`docs/spec/24-role.md` 4-4）。
 *
 * 空白で幅を合わせない——**全角空白は表示が崩れる**
 *（`docs/spec/15-presentation.md` 4-6）。
 * **同じ字数にすれば、それだけで揃う。**
 */
function row(label: string, value: number, full: number, color: string, unit = ""): string {
  return `§7${label} ${gauge(value, full, color)} §f${value}${unit}`;
}

/**
 * どの区分をどの行に置くか（マス目の番号。2026-08-27 変更）。
 *
 * **区分ごとに行を分ける。** 横に並べば、
 * **同じ区分の中で何が違うのか**を見比べられる。
 *
 * | 行 | 置くもの |
 * | --- | --- |
 * | 上 | **通常と操作性変化**（通常は 1 つしかないので、同じ軸に載せる） |
 * | 下 | **特殊** |
 *
 * 間を 1 行空ける。**続けて並べると、区分の切れ目が見えない。**
 */
const LANE: Readonly<Record<RoleKind, number>> = {
  normal: 10,
  handling: 10,
  special: 28,
};

/** 1 行に並べられる数。**両端を空ける** */
const ROW = 7;

/**
 * ロールの盤面を開く。
 *
 * @param message 前の操作の結果（1 行）
 */
export function showRoles(player: Player, message?: string): void {
  const now = roleOf(player);
  const points = pointsOf(player);

  // **ロビーでは点を出さない。** 払わないので、出しても意味が無い
  const form = new ChestFormData(CHEST_SIZE).title(practicing(player) ? "ロール  §7お試し" : `ロール  §e${points}P`);

  // **区分ごとに、その行の何番目か**を数える
  const used = new Map<number, number>();
  // **どのマスが何か**を覚えておく（並べ方から逆算しない）
  const at = new Map<number, RoleId>();

  ROLE_ORDER.forEach((id, i) => {
    const role = ROLES[id];
    const lane = LANE[role.kind];
    const nth = used.get(lane) ?? 0;
    used.set(lane, nth + 1);
    const owned = hasRole(player, id);
    const here = now.id === id;
    // ---- **運営が止めているロール**（`docs/spec/19-admin-menu.md` 10 章）
    //
    // **押しても `changeRole` が弾く。** ここは見せ方だけ
    const usable = roleEnabled(id);

    // ---- **名前の色は、必ず区分の色**（2026-08-27 修正）
    //
    // 持っていないものを灰色にしていたので、
    // **区分の色が読めないロールがあった**——
    // 特殊はどれも高く、**買うまで灰色のまま**だった。
    //
    // > **色は「何の仲間か」を表すもの。**
    // > **持っているかどうかは、値段が出ているかで分かる。**
    const color = KIND_COLOR[role.kind];
    const label = !usable
      ? `${color}${role.name}  §c使用停止中`
      : here
        ? `${color}${role.name}  §a(いま)`
        : owned
          ? `${color}${role.name}`
          : `${color}${role.name}  §e${role.cost}P`;

    const desc = [
      `${KIND_COLOR[role.kind]}【${KIND_NAME[role.kind]}】`,
      ...role.desc.map((d) => `§7${d}`),
      "§8──────────",
      ...statLines(role),
    ];

    if (!usable) {
      // **止めているなら、買う案内も変える案内も出さない。**
      // 押せないものに手順を書くと、押せると思わせる
      desc.push("§8──────────", "§c運営が使用停止にしています");
    } else if (practicing(player)) {
      if (!here) desc.push("§8──────────", "§aお試し");
    } else if (!owned) {
      desc.push("§8──────────", points >= role.cost ? "§e押すと買う" : `§c${role.cost - points}P 足りない`);
    } else if (!here) {
      desc.push("§8──────────", "§7押すと変わる §8(一度倒れる。持ち物は残る)");
    }
    if (i === 0 && message !== undefined) desc.push(message);

    const slot = lane + Math.floor(nth / ROW) * 9 + (nth % ROW);
    at.set(slot, id);
    form.button(slot, label, desc, role.icon);
  });

  form
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === undefined) return;
      const id = at.get(res.selection);
      if (id === undefined) return;
      pick(player, id);
    })
    .catch(() => {
      /* 画面を出せなかった */
    });
}

/**
 * 性能の行を組む。
 *
 * **数字はロールの定義から作る**（`lib/roles.ts`）。
 * ロールを足しても、ここは書き足さなくてよい。
 */
function statLines(role: (typeof ROLES)[keyof typeof ROLES]): string[] {
  const w = role.wire;
  const out: string[] = [];

  if (w.range <= 0) {
    out.push("§cワイヤーを使えない");
  } else {
    out.push(row("射程距離", w.range, FULL.range, "§b", "m"));
    out.push(row("切断距離", w.cut, FULL.range, "§9", "m"));
    out.push(row("射出消費", w.attach, FULL.mana, "§c"));
    out.push(row("引寄消費", w.pull, FULL.mana, "§c"));
    out.push(row("移動消費", w.move, FULL.drain, "§c", "/tick"));
    out.push(row("キル回復", w.kill, FULL.mana * 5, "§a", w.regen ? "  §7自動回復" : "  §cキルのみ"));
    out.push(row("加速倍率", w.speed, FULL.speed, "§6", "倍"));
    out.push(`§7挙動 ${w.mode === "glide" ? "§d低速で近づく" : "§f通常"}`);
    if (w.air) out.push("§d空気にも刺さる");
  }

  // ---- **小数点は使わない**（2026-08-27 修正）
  //
  // `×1.5` が**「1 5」に見えていた**——点が読めない。
  // **増減で出す。** 整数だけなら読み違えようが無く、
  // **どれだけ得なのか**もそのまま読める
  if (role.damage !== 1) {
    const diff = Math.round((role.damage - 1) * 100);
    out.push(`§6攻撃力 §f${diff > 0 ? "+" : ""}${diff}%`);
  }
  if (!role.canAttack) out.push("§c敵を殴れない");
  if (role.ignoreCoreLock) out.push("§a飛び込んだ直後でもコアを削れる");
  if (role.haste > 0) out.push(`§a採掘が速い §8(採掘 ${role.haste})`);
  if (role.drone) out.push("§aドローンを使える");
  return out;
}

/** 押されたときの動き。**持っていなければ買う、持っていれば変える** */
function pick(player: Player, id: (typeof ROLE_ORDER)[number]): void {
  const role = ROLES[id];

  // ---- **止めてあるなら、買わせもしない**（`docs/spec/19-admin-menu.md` 10 章）
  //
  // `changeRole` も弾くが、**そこまで行くと点を払った後**になる。
  // 使えないものに払わせない
  if (!roleEnabled(id)) {
    showRoles(player, `§c${role.name} は運営が使用停止にしています`);
    return;
  }

  // ---- **ロビーでは点を払わずに試せる**（`docs/spec/25-practice.md` 3 章）
  //
  // **買った印は付けない。** 試したものがそのまま手に入っては、
  // 点を貯める意味が消える。
  //
  // **押した瞬間に見る**——開いたまま試合が始まっても効かないように
  if (practicing(player)) {
    const why = changeRole(player, id);
    showRoles(player, why ?? `§b${role.name} §7で試している`);
    return;
  }

  if (!hasRole(player, id)) {
    if (!spendPoints(player, role.cost)) {
      showRoles(player, `§c${role.name} を買うには ${role.cost}P 要る`);
      return;
    }
    unlockRole(player, id);
    bar(player, `§a${role.name} を手に入れた`, BAR.important, 60);
    showRoles(player, `§a${role.name} を買った`);
    return;
  }

  const why = changeRole(player, id);
  if (why !== undefined) {
    showRoles(player, why);
    return;
  }
  // **変えたら閉じる。** 倒れた直後に盤面が残っていると邪魔
}
