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

import { StructureSaveMode, system, world, type Dimension } from "@minecraft/server";

import { GRID, idsOf, nameOk, OLD_GRID, parseBook, piecesOf, type MapBook, type MapMeta } from "../core/map-store.js";

/** 覚え書きの置き場 */
const BOOK = "pve_v3:maps";

function dim(): Dimension {
  return world.getDimension("overworld");
}

/** 覚え書きを読む */
export function book(): MapBook {
  const raw = world.getDynamicProperty(BOOK);
  return parseBook(typeof raw === "string" ? raw : undefined);
}

function writeBook(next: MapBook): void {
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

/** 試合に出せるもの */
export function playable(): readonly string[] {
  return list()
    .filter((m) => m.meta.on && m.ready)
    .map((m) => m.name);
}

/**
 * **いまの ±50 を、いまの割り方（16 枚）に分けて保存する。**
 *
 * 同じ名前があれば**上書き**——直したものをそのまま焼き直せる。
 * **焼き直した時点で、そのマップの割り方も新しくなる。**
 */
export function save(name: string, label?: string): { ok: boolean; message: string } {
  if (!nameOk(name)) return { ok: false, message: "名前は英小文字・数字・_ だけ（24 字まで）" };
  const d = dim();
  const ids = idsOf(name, GRID);
  try {
    for (const [i, p] of piecesOf(GRID).entries()) {
      const id = ids[i];
      if (id === undefined) continue;
      // **上書きするので、先に消す**
      world.structureManager.delete(id);
      world.structureManager.createFromWorld(id, d, p.from, p.to, {
        includeBlocks: true,
        // **敵や落ちている物まで焼かない**
        includeEntities: false,
        saveMode: StructureSaveMode.World,
      });
    }
  } catch (err) {
    return { ok: false, message: `保存できなかった §8${String(err)}` };
  }
  const now = book();
  const was = now[name];
  writeBook({ ...now, [name]: { label: label ?? was?.label ?? name, on: was?.on ?? false, grid: GRID } });
  return { ok: true, message: `${name} を保存した（${ids.length} 枚）` };
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
function* placeJob(name: string, then?: () => void): Generator<void, void, void> {
  const d = dim();
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
      world.structureManager.place(id, d, p.from);
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

/**
 * 消す。**構造物と覚え書き。**
 *
 * **割り方を変える前に焼いた枚も落とす**ので、いちばん多い枚数で回す。
 */
export function remove(name: string): { ok: boolean; message: string } {
  let gone = 0;
  for (const id of idsOf(name, Math.max(GRID, gridOf(name)))) {
    try {
      if (world.structureManager.delete(id)) gone++;
    } catch {
      /* パック同梱のものは消せない */
    }
  }
  const now = { ...book() };
  delete now[name];
  writeBook(now);
  return { ok: true, message: `${name} を消した（構造物 ${gone} 枚）` };
}

/** 出るかどうかを切り替える */
export function setOn(name: string, on: boolean): { ok: boolean; message: string } {
  const now = book();
  const meta = now[name];
  if (meta === undefined) return { ok: false, message: `${name} は倉庫に無い` };
  writeBook({ ...now, [name]: { ...meta, on } });
  return { ok: true, message: `${name} を${on ? "出す" : "出さない"}ようにした` };
}

/** 表示名を変える */
export function setLabel(name: string, label: string): { ok: boolean; message: string } {
  const now = book();
  const meta = now[name];
  if (meta === undefined) return { ok: false, message: `${name} は倉庫に無い` };
  writeBook({ ...now, [name]: { ...meta, label } });
  return { ok: true, message: `${name} の表示名を「${label}」にした` };
}
