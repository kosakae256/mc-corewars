/**
 * 運営のコンパスの中身。
 *
 * ```
 * 運営メニュー
 *  ├ 建築モード（入る / 出る）
 *  └ マップ一覧 ─ 選ぶ ─ 置く / 出す・出さない / 消す
 * ```
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md` 7 章。
 */

import { system, type Player } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";

import { list, place, remove, save, setLabel, setOn } from "../../services/mapstore.js";
import { phase, toPhase, wave } from "../../services/match.js";
import { endWave, killEnemies } from "../../services/force.js";

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
      `§7名前 §f${m.name}\n§7出るか §f${m.meta.on ? "出る" : "出さない"}\n§7構造物 §f${m.ready ? "4 枚そろっている" : "§c欠けている"}`
    )
    .button("戦場に置く")
    .button(m.meta.on ? "出さないようにする" : "出すようにする")
    .button("表示名を変える")
    .button("§c消す");
  const res = await form.show(player);
  if (res.canceled === true || res.selection === undefined) return;

  switch (res.selection) {
    case 0:
      if (await confirm(player, "戦場に置く", `§7${m.meta.label} を置く。\n**いま 0,0 にあるものは全部消える。**`)) {
        say(player, place(name));
      }
      return;
    case 1:
      say(player, setOn(name, !m.meta.on));
      return;
    case 2: {
      const modal = new ModalFormData().title("表示名を変える").textField("表示名", m.meta.label, {
        defaultValue: m.meta.label,
      });
      const r = await modal.show(player);
      const v = r.formValues?.[0];
      if (r.canceled !== true && typeof v === "string" && v.trim() !== "") say(player, setLabel(name, v.trim()));
      return;
    }
    default:
      if (await confirm(player, "消す", `§7${m.meta.label} を消す。\n**構造物 4 枚と覚え書きが消える。**`)) {
        say(player, remove(name));
      }
  }
}

/** マップ一覧 */
async function openMaps(player: Player): Promise<void> {
  const all = list();
  const form = new ActionFormData().title("§lマップ倉庫");
  if (all.length === 0) form.body("§7倉庫は空。§8下の「いまの戦場を保存」から入れる");
  for (const m of all) {
    const mark = !m.ready ? "§c欠けている" : m.meta.on ? "§a出る" : "§8出さない";
    form.button(`${m.meta.label}\n§8${m.name}  ${mark}`);
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
    .button("試合の手当て\n§8敵を消す／ウェーブを終わらせる");
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
  await openForce(player);
}
