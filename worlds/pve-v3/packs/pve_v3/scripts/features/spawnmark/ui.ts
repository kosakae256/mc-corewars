/**
 * 湧き点の杖のメニュー。
 *
 * 仕様は `worlds/pve-v3/docs/spec/21-spawn-mark.md` 1-2。
 */

import type { Player } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

import { clearMarks, count, pruneMarks, showMarks } from "../../services/spawnmark.js";
import { list, originXOf } from "../../services/mapstore.js";
import { editing, setEditing } from "../../state/spawnmark.js";

/** そのマップがどこにあるか。**点が見えないときの手掛かり** */
function whereIs(map: string): string {
  const x = originXOf(map);
  return `${map} は x ${x} にある（いまそこに居るか確かめる）`;
}

/** どのマップの点を編集するか選ぶ */
async function pickMap(player: Player): Promise<void> {
  const all = list();
  const form = new ActionFormData().title("§lどのマップの点か").body("§7倉庫にあるマップから選ぶ");
  for (const m of all) form.button(`${m.meta.label}\n§8${m.name}  ${count(m.name)} 点`);
  form.button("§8戻る");
  const res = await form.show(player);
  if (res.canceled === true || res.selection === undefined) return;
  const picked = all[res.selection];
  if (picked === undefined) {
    await openWand(player);
    return;
  }
  setEditing(picked.name);
  player.sendMessage(`§7これから §f${picked.name}§7 の点を触る`);
}

/** 入口 */
export async function openWand(player: Player): Promise<void> {
  const map = editing();
  const n = map === undefined ? 0 : count(map);
  const form = new ActionFormData()
    .title("§l湧き点の杖")
    .body(map === undefined ? "§cどのマップか決まっていない" : `§7いま §f${map}§7 ／ §f${n}§7 点`)
    .button("どのマップの点か選ぶ")
    .button("近くの点を見る\n§8粒で出す")
    .button("§cこのマップの点を全部消す");
  const res = await form.show(player);
  if (res.canceled === true || res.selection === undefined) return;

  if (res.selection === 0) {
    await pickMap(player);
    return;
  }
  if (map === undefined) {
    player.sendMessage("§c先にマップを選ぶ");
    return;
  }
  if (res.selection === 1) {
    const shown = showMarks(player, map);
    player.sendMessage(shown > 0 ? `§7近くの §f${shown}§7 点を出した` : `§7ここには点が無い §8${whereIs(map)}`);
    return;
  }
  if (res.selection === 2) {
    const r = pruneMarks(map);
    player.sendMessage(
      r.dropped === 0
        ? `§7全部まだ立てる §8（${r.left} 点）`
        : `§7埋まっていた §f${r.dropped}§7 点を捨てた §8（残り ${r.left}）`
    );
    return;
  }
  const ok = await new MessageFormData()
    .title("全部消す")
    .body(`§c${map} の ${n} 点を捨てる。戻せない`)
    .button1("やめる")
    .button2("§cやる")
    .show(player);
  if (ok.selection !== 1) return;
  clearMarks(map);
  player.sendMessage(`§7${map} の点を全部消した`);
}
