/**
 * 運営のコンパスの中身。
 *
 * ```
 * 運営メニュー
 *  ├ 建築モード（入る / 出る）
 *  ├ マップ一覧 ─ 選ぶ ─ 置く / 出す・出さない / 消す
 *  ├ 試合の手当て（敵を消す / ウェーブを終わらせる）
 *  └ 敵を呼ぶ（確認用）
 * ```
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 7 章。
 */

import { system, type Player } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";

import { assignSlot, list, place, setBigJump, setLabel, setOn } from "../../services/mapstore.js";
import { dropStructures, remove, save } from "../../services/mapbake.js";
import { slotOrigin } from "../../core/map-store.js";
import { phase, toPhase, wave } from "../../services/match.js";
import { endWave, killEnemies } from "../../services/force.js";
import { openSummon } from "./summon.js";

function say(player: Player, r: { ok: boolean; message: string }): void {
  player.sendMessage(r.ok ? `§7${r.message}` : `§c${r.message}`);
}

/** 確かめてから壊す */
async function confirm(player: Player, title: string, body: string): Promise<boolean> {
  const res = await new MessageFormData().title(title).body(body).button1("やめる").button2("§cやる").show(player);
  return res.canceled !== true && res.selection === 1;
}

/** 1 枚のマップに対してできること */
async function openMap(player: Player, name: string): Promise<void> {
  const m = list().find((x) => x.name === name);
  if (m === undefined) return;
  const form = new ActionFormData()
    .title(`§l${m.meta.label}`)
    .body(
      `§8名前 §0${m.name}\n§8場所 ${m.meta.slot === undefined ? "§4まだ並べていない" : `§0${m.meta.slot} 番（x ${m.meta.slot * 1000}）`}` +
        `\n§7出るか §f${m.meta.on ? "出る" : "出さない"}\n§7構造物 §f${m.ready ? "そろっている" : "§c欠けている"}`
    )
    .button(m.meta.slot === undefined ? "§2並べる（次の場所へ）" : `${m.meta.slot} 番へ置き直す`)
    .button(m.meta.on ? "出さないようにする" : "出すようにする")
    .button(m.meta.bigJump ? "大ジャンプを切る" : "大ジャンプを入れる")
    .button("表示名を変える")
    .button("§2バックアップを取る" + String.fromCharCode(10) + "§8いまの姿を焼き直す")
    .button(m.ready ? "§6バックアップを消す" + String.fromCharCode(10) + "§8世界が軽くなる" : "§8バックアップは無い")
    .button("§c倉庫から消す");
  const res = await form.show(player);
  if (res.canceled === true || res.selection === undefined) return;

  switch (res.selection) {
    case 0:
      await putIntoSlot(player, name);
      return;
    case 1:
      say(player, setOn(name, !m.meta.on));
      return;
    case 2:
      // **大ジャンプ**（`02-map.md` 5-0-4）。**足場が離れているマップで入れる**
      say(player, setBigJump(name, !m.meta.bigJump));
      return;
    case 3: {
      const modal = new ModalFormData().title("表示名を変える").textField("表示名", m.meta.label, {
        defaultValue: m.meta.label,
      });
      const r = await modal.show(player);
      const v = r.formValues?.[0];
      if (r.canceled !== true && typeof v === "string" && v.trim() !== "") say(player, setLabel(name, v.trim()));
      return;
    }
    case 4: {
      // **いまの姿を焼き直す**（`19-map-store.md` 0-6）。**そのマップの場所から取る**
      if (m.meta.slot !== undefined) {
        try {
          player.teleport({ x: m.meta.slot * 1000, y: 8, z: 0 });
        } catch {
          /* 消えている */
        }
      }
      const label = m.meta.label;
      system.runTimeout(() => say(player, save(name, label)), 40);
      player.sendMessage("§7その場所へ飛んだ。§8焼き終わるまで動かないこと");
      return;
    }
    case 5:
      if (!m.ready) return;
      if (
        await confirm(
          player,
          "バックアップを消す",
          `§7${m.meta.label} の構造物を消す。\n**世界が軽くなるが、直せなくなる。**` +
            `\n§8マップそのものは残り、試合にも出る`
        )
      ) {
        say(player, dropStructures(name));
      }
      return;
    default:
      if (
        await confirm(
          player,
          "倉庫から消す",
          `§7${m.meta.label} を倉庫から消す。\n**構造物と覚え書きが消える。**` +
            `\n§8置いてある地形は残る（試合には出なくなる）`
        )
      ) {
        say(player, remove(name));
      }
  }
}

/**
 * **そのマップを、自分の場所へ置く**（`19-map-store.md` 0-5）。
 *
 * > ### 置くには、そこに居ないといけない
 * >
 * > **読み込まれていない所へは置けない。**
 * > **運営をその場所へ飛ばしてから置く。**
 */
async function putIntoSlot(player: Player, name: string): Promise<void> {
  const a = assignSlot(name);
  if (!a.ok) {
    player.sendMessage(`§c${a.message}`);
    return;
  }
  const at = slotOrigin(a.slot);
  const ok = await confirm(
    player,
    `${a.slot} 番へ置く`,
    `§7x ${at.x} へ置く。\n**そこにあるものは全部消える。**\n§8置き終わるまで、その場から動かないこと`
  );
  if (!ok) return;
  try {
    player.teleport({ x: at.x, y: 8, z: 0 });
  } catch {
    /* 消えている */
  }
  // **飛んでから置く**——読み込みが追いつくよう、少し待つ
  system.runTimeout(() => {
    // **置き終わったら知らせる**——**次の 1 枚は、それを見てから**
    // （置いている途中でもう 1 枚始めると、前のものが止まる）
    const r = place(name, () => {
      player.sendMessage(`§a${a.slot} 番（x ${at.x}）に置き終わった §8次の 1 枚へ`);
      try {
        player.playSound("random.levelup", { volume: 0.6, pitch: 1.4 });
      } catch {
        /* 消えている */
      }
    });
    player.sendMessage(r.ok ? `§7${a.slot} 番（x ${at.x}）に置き始めた… §8動かないこと` : `§c${r.message}`);
  }, 40);
}

/** マップ一覧 */
async function openMaps(player: Player): Promise<void> {
  const all = list();
  const form = new ActionFormData().title("§lマップ倉庫");
  if (all.length === 0) form.body("§7倉庫は空。§8下の「いまの戦場を保存」から入れる");
  for (const m of all) {
    // > ### 明るい色は、画面に溶ける（2026-09-07）
    // >
    // > **フォームの下地は白っぽい。** **§7 や §f はほとんど読めない。**
    // > **濃い色を使う**——緑・赤・青・橙。
    const out = m.meta.on ? "§2出る" : "§4出さない";
    const back = m.ready ? "§1バックアップ有り" : "§6バックアップ無し";
    const where = m.meta.slot === undefined ? "§4未配置" : `§8x ${m.meta.slot * 1000}`;
    form.button(`${m.meta.label}\n§8${m.name}  ${out} §8/ ${back} §8/ ${where}`);
  }
  form.button("§2いまの戦場を保存");
  const res = await form.show(player);
  if (res.canceled === true || res.selection === undefined) return;

  if (res.selection >= all.length) {
    const modal = new ModalFormData()
      .title("いまの戦場を保存")
      .textField("名前（英小文字・数字・_）", "basin")
      .textField("表示名", "宙の窪地");
    const r = await modal.show(player);
    if (r.canceled === true) return;
    const name = r.formValues?.[0];
    const label = r.formValues?.[1];
    if (typeof name !== "string" || name.trim() === "") return;
    say(player, save(name.trim().toLowerCase(), typeof label === "string" ? label.trim() : undefined));
    return;
  }
  const picked = all[res.selection];
  if (picked !== undefined) await openMap(player, picked.name);
}

/**
 * 試合の手当て（`19-map-store.md` 7-0）。
 *
 * **戦場に居るときだけ効く。**
 */
async function openForce(player: Player): Promise<void> {
  const inWave = phase() === "wave";
  const form = new ActionFormData()
    .title("§l試合の手当て")
    .body(inWave ? `§7いま §fwave ${wave()}§7 の最中` : `§8戦場に居ないと効かない §7(${phase()})`)
    .button("敵を全滅させる\n§8殲滅の合図とゲートは普通に出る")
    .button("ウェーブを終わらせる\n§8ポータルまで歩くのを飛ばす")
    .button("§8戻る");
  const res = await form.show(player);
  if (res.canceled === true || res.selection === undefined) return;

  if (res.selection === 2) {
    await openAdmin(player);
    return;
  }
  if (!inWave) {
    player.sendMessage("§c戦場の最中ではない");
    return;
  }
  if (res.selection === 0) {
    const n = killEnemies();
    player.sendMessage(`§7敵を §f${n}§7 体消した`);
    return;
  }
  const ok = endWave(system.currentTick);
  player.sendMessage(ok ? "§7ウェーブを終わらせた" : "§c終わらせられなかった");
}

/** 入口 */
export async function openAdmin(player: Player): Promise<void> {
  const building = phase() === "build";
  const form = new ActionFormData()
    .title("§l運営メニュー")
    .body(`§7いまの状態 §f${building ? "建築中" : phase()}`)
    .button(building ? "建築モードを出る" : "建築モードに入る")
    .button("マップ倉庫")
    .button("試合の手当て\n§8敵を消す／ウェーブを終わらせる")
    .button("敵を呼ぶ\n§8見ている所に出す（確認用）");
  const res = await form.show(player);
  if (res.canceled === true || res.selection === undefined) return;

  if (res.selection === 0) {
    const to = building ? "idle" : "build";
    const ok = toPhase(to, system.currentTick);
    player.sendMessage(ok ? (building ? "§7建築モードを出た" : "§7建築モードに入った") : "§c試合中は入れない");
    return;
  }
  if (res.selection === 1) {
    await openMaps(player);
    return;
  }
  if (res.selection === 2) {
    await openForce(player);
    return;
  }
  await openSummon(player);
}
