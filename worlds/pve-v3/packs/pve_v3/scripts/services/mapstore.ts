/**
 * マップ倉庫。**保存・設置・削除・出るかどうか。**
 *
 * 仕様は `worlds/pve-v3/docs/spec/19-map-store.md`。
 *
 * > ### 置くのは「保存されたものだけ」
 * >
 * > 生成器がその場で作る形だと、**何が出るのかを人が確かめられない。**
 * > **保存した地形だけが出る**——それなら、出るものは全部見たものになる。
 *
 * > ### なぜワールドに保存するのか
 * >
 * > **スクリプトはパックにファイルを書けない。**
 * > ワールド保存なら、**追加・削除・書き換えが全部スクリプトからできる。**
 */

import { BlockVolume, StructureSaveMode, system, world, type Dimension } from "@minecraft/server";

import { GRID, idsOf, nameOk, OLD_GRID, parseBook, piecesOf, type MapBook, type MapMeta } from "../core/map-store.js";
import { FIELD } from "../core/places.js";
import { nextSlot, slotOrigin } from "../core/map-store.js";

/** 覚え書きの置き場 */
const BOOK = "pve_v3:maps";

export function dim(): Dimension {
  return world.getDimension("overworld");
}

/** 覚え書きを読む */
export function book(): MapBook {
  const raw = world.getDynamicProperty(BOOK);
  return parseBook(typeof raw === "string" ? raw : undefined);
}

export function writeBook(next: MapBook): void {
  world.setDynamicProperty(BOOK, JSON.stringify(next));
}

/**
 * **そのマップを焼いたときの割り方。**
 *
 * **覚え書きに無ければ 2**——4 × 4 にする前のマップも置ける（`19-map-store.md` 3 章）。
 */
export function gridOf(name: string): number {
  return book()[name]?.grid ?? OLD_GRID;
}

/** そのマップの構造物が、割り方のぶんだけ揃っているか */
export function complete(name: string): boolean {
  return idsOf(name, gridOf(name)).every((id) => world.structureManager.get(id) !== undefined);
}

/** 一覧。**覚え書きに有り、構造物も揃っているものだけ** */
export function list(): readonly { name: string; meta: MapMeta; ready: boolean }[] {
  return Object.entries(book())
    .map(([name, meta]) => ({ name, meta, ready: complete(name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * **そのマップの原点の x**（`19-map-store.md` 0-1）。
 *
 * **番号が無ければ 0**——**作業台**。そこで作り、直し、焼く。
 */
export function originXOf(name: string): number {
  return slotOrigin(book()[name]?.slot ?? 0).x;
}

/**
 * **番号を振って、その場所へ置く**（2026-09-07 追加）。
 *
 * **すでに番号があれば、そこへ置き直すだけ。**
 */
export function assignSlot(name: string): { ok: boolean; slot: number; message: string } {
  const b = book();
  const meta = b[name];
  if (meta === undefined) return { ok: false, slot: 0, message: `${name} は倉庫に無い` };
  if (meta.slot !== undefined) return { ok: true, slot: meta.slot, message: `${name} は ${meta.slot} 番` };
  const slot = nextSlot(b);
  writeBook({ ...b, [name]: { ...meta, slot } });
  return { ok: true, slot, message: `${name} を ${slot} 番にした` };
}

/** 試合に出せるもの */
export function playable(): readonly string[] {
  // > ### **場所があれば遊べる**（2026-09-07・`19-map-store.md` 0-6）
  // >
  // > **マップは常設**なので、**構造物は要らない。**
  // > 構造物は**バックアップ**——**消しても、試合には出続ける。**
  return list()
    .filter((m) => m.meta.on && m.meta.slot !== undefined)
    .map((m) => m.name);
}

/** いま置いている仕事。**`system.runJob` が進める** */
let job: number | undefined;

/** まだ置き終わっていないか */
export function placing(): boolean {
  return job !== undefined;
}

/**
 * 置く手順。**1 枚ごとに `yield` して、エンジンに時間を返す。**
 *
 * > ### 自分で毎 tick 刻まない
 * >
 * > `system.runJob` は**ジェネレータに毎 tick の時間枠を配ってくれる。**
 * > **`yield` するまで進めて、そこで返す**——刻み幅をこちらで決めなくてよい。
 */
/**
 * **置く前に、まるごと消す高さ**（`19-map-store.md` 3 章）。
 *
 * > ### 構造物は y −34〜+29 しか持っていない（2026-09-06）
 * >
 * > **その下に前のマップの残りがある**と、新しい島の下にぶら下がって見える。
 *
 * > ### **水・溶岩は、半端に消すと湧き直す**
 * >
 * > 途中まで消すと、**残りが流れ込んで無限水源になる。**
 * > **範囲を丸ごと空気で埋めてから置く**——半端に消さない。
 * >
 * > **上から下へ消す。** 下から消すと、
 * > **上に残した水が、消したばかりの所へ落ちてくる。**
 */
const WIPE_LOW = -64;
const WIPE_HIGH = 40;

/** 一度に置ける上限（`services/builder.ts` と同じ理由） */
const MAX_FILL = 32768;

/** 範囲をまるごと空気にする。**上から下へ、厚さを上限に収めて少しずつ** */
function* wipeAll(d: Dimension, ox: number): Generator<void, void, void> {
  const h = FIELD.half;
  const wide = (h * 2 + 1) * (h * 2 + 1);
  const step = Math.max(1, Math.floor(MAX_FILL / wide));
  for (let top = WIPE_HIGH; top >= WIPE_LOW; top -= step) {
    const y = Math.max(WIPE_LOW, top - step + 1);
    try {
      d.fillBlocks(new BlockVolume({ x: ox - h, y, z: -h }, { x: ox + h, y: top, z: h }), "air");
    } catch {
      /* 読み込まれていない */
    }
    yield;
  }
}

function* placeJob(name: string, then?: () => void): Generator<void, void, void> {
  const d = dim();
  // **そのマップの原点へ置く**（`19-map-store.md` 0-1）。**番号が無ければ作業台（0）**
  const ox = originXOf(name);
  // **まず範囲をまるごと空気にする**（水を残すと無限水源になる。下も消える）
  yield* wipeAll(d, ox);
  const grid = gridOf(name);
  const ids = idsOf(name, grid);
  for (const [i, p] of piecesOf(grid).entries()) {
    const id = ids[i];
    if (id === undefined) continue;
    // > ### 1 枚ぶんでも、置いている間はサーバーが止まる
    // >
    // > **暗転は 2 秒ぶん先に掛けてある**（`services/dark.ts`）ので、
    // > 止まっても黒は切れない。**2 秒に収まる大きさに割る**（`14-map-build.md` 2-2）。
    try {
      world.structureManager.place(id, d, { x: p.from.x + ox, y: p.from.y, z: p.from.z });
    } catch {
      /* 読み込まれていない */
    }
    yield;
  }
  job = undefined;
  // **置き終わってからでないとできないこと**（ゲートの塗り替えなど）
  if (then !== undefined) {
    try {
      then();
    } catch (err) {
      console.warn(`[mapstore] ${String(err)}`);
    }
  }
}

/**
 * **倉庫から置く。** そこにあったものは消える。
 *
 * > ### 一度に全部置かない
 * >
 * > **65 万ブロックを 1 tick で置くと、サーバーがその間止まる。**
 * > 止まると**暗転の掛け直しが届かず、走り切って明るくなる。**
 */
export function place(name: string, then?: () => void): { ok: boolean; message: string } {
  if (!complete(name)) return { ok: false, message: `${name} は倉庫に揃っていない` };
  if (job !== undefined) system.clearJob(job);
  job = system.runJob(placeJob(name, then));
  const n = gridOf(name) ** 2;
  return { ok: true, message: `${name} を置き始めた（${n} 枚）` };
}

/** 出るかどうかを切り替える */
export function setOn(name: string, on: boolean): { ok: boolean; message: string } {
  const now = book();
  const meta = now[name];
  if (meta === undefined) return { ok: false, message: `${name} は倉庫に無い` };
  writeBook({ ...now, [name]: { ...meta, on } });
  return { ok: true, message: `${name} を${on ? "出す" : "出さない"}ようにした` };
}

/**
 * **大ジャンプの入切**（`02-map.md` 5-0-4）。
 *
 * **足場が離れているマップ**（雲海など）で入れる。
 */
export function setBigJump(name: string, on: boolean): { ok: boolean; message: string } {
  const now = book();
  const meta = now[name];
  if (meta === undefined) return { ok: false, message: `${name} は倉庫に無い` };
  writeBook({ ...now, [name]: { ...meta, bigJump: on } });
  return { ok: true, message: `${name} の大ジャンプを${on ? "入れた" : "切った"}` };
}

/** そのマップは大ジャンプか */
export function bigJumpOf(name: string | undefined): boolean {
  return name === undefined ? false : (book()[name]?.bigJump ?? false);
}

/** 表示名を変える */
export function setLabel(name: string, label: string): { ok: boolean; message: string } {
  const now = book();
  const meta = now[name];
  if (meta === undefined) return { ok: false, message: `${name} は倉庫に無い` };
  writeBook({ ...now, [name]: { ...meta, label } });
  return { ok: true, message: `${name} の表示名を「${label}」にした` };
}
