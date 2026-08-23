/**
 * 構造物を「版つきの名前」で配る。
 *
 * ## なぜ要るか
 *
 * **Minecraft は構造物を名前でキャッシュする。**
 * 同じ名前のまま `.mcstructure` を差し替えても、
 * ゲーム側は古い中身を読み続ける。エラーは出ない。黙って古いものが出る。
 *
 * これは非常に見つけにくい。
 * 「直したはずなのに変わらない」→「直し方が悪いのか」と実装を疑ってしまう。
 * 実際に一度これで時間を溶かした（[docs/spec/08-map-authoring.md]）。
 *
 * ## どうするか
 *
 * **名前に版番号を付け、中身が変わったときだけ上げる。**
 *
 *   mid_nw_v1  →（設計を直す）→  mid_nw_v2
 *
 * 中身が変わっていなければ版は据え置き。
 * 意味もなく番号が増えて、打ち込むコマンドが変わり続けるのを避けるため。
 *
 * 判定は内容のハッシュで行う。**人が「変えたつもり」かどうかに依存させない。**
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";

/**
 * 版の記録。**道具の側に置く。**
 * パックの中身ではないので、配布物には同梱しない
 */
function ledgerPath(here) {
  return join(here, "versions.json");
}

function loadLedger(here) {
  const p = ledgerPath(here);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

function saveLedger(here, led) {
  const p = ledgerPath(here);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(led, null, 2) + "\n");
}

const hashOf = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

/**
 * 構造物を配る。
 *
 * @param {string} here            呼び出し元の絶対パス（`dirname(fileURLToPath(import.meta.url))`）
 * @param {string[]} dirs          配り先
 * @param {{base: string, buffer: Buffer}[]} items  版なしの名前と中身
 * @returns {{base: string, name: string, version: number, changed: boolean}[]}
 */
export function publish(here, dirs, items, group = false) {
  const led = loadLedger(here);
  const out = [];

  // **4分割のような一組は、版番号を揃える。**
  // バラバラだと `under_nw_v3` は新しいのに `under_ne_v3` は古い、
  // という状態になり、どれを打てばいいのか分からなくなる。実際に混乱した
  let groupVersion = null;
  if (group) {
    const prevMax = Math.max(0, ...items.map(({ base }) => led[base]?.version ?? 0));
    const anyChanged = items.some(({ base, buffer }) => led[base]?.hash !== hashOf(buffer));
    groupVersion = anyChanged ? prevMax + 1 : prevMax;
  }

  for (const d of dirs) {
    try {
      mkdirSync(d, { recursive: true });
    } catch {
      /* 配れない先は飛ばす */
    }
  }

  for (const { base, buffer } of items) {
    const h = hashOf(buffer);
    const prev = led[base];
    const changed = !prev || prev.hash !== h;
    const version = groupVersion ?? (prev ? (changed ? prev.version + 1 : prev.version) : 1);
    const name = `${base}_v${version}`;

    for (const d of dirs) {
      try {
        writeFileSync(join(d, `${name}.mcstructure`), buffer);
      } catch {
        /* 配れない先は飛ばす */
      }
    }

    // **古い版は消す。** 残しても読まれないうえ、
    // どれが最新か分からなくなって、また同じ事故を起こす
    if (prev && prev.name !== name) {
      for (const d of dirs) {
        try {
          rmSync(join(d, `${prev.name}.mcstructure`), { force: true });
        } catch {
          /* 消せなくても困らない */
        }
      }
    }

    led[base] = { version, name, hash: h };
    out.push({ base, name, version, changed, removed: prev && prev.name !== name ? prev.name : null });
  }

  saveLedger(here, led);
  return out;
}
