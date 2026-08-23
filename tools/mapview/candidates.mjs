/**
 * 候補を複数作って並べる。
 *
 * **形の好みは、見比べないと決まらない。**
 * 1つずつ作って見せるより、並べた方が判断が速い。
 *
 * 使い方: node candidates.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { encodePng } from "./png.mjs";
import { renderIso } from "./render.mjs";
import { buildBase } from "./designs/base.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });

/**
 * 候補の一覧。
 *
 * **狙いを変えたものを並べる。** 数値を少しずつ変えても違いが読めない。
 */
const CANDIDATES = [
  { name: "A 標準",   desc: "今の基準",                 opts: {} },
  { name: "B 細く高い", desc: "塔のように細く、高く",     opts: { keep: 4, keepExtra: 18, wallH: 7, seed: 11 } },
  { name: "C 太く低い", desc: "どっしり構える",           opts: { keep: 8, keepExtra: 5, wallH: 5, seed: 5 } },
  { name: "D かなり高い", desc: "遠くからコアが見える",     opts: { keep: 5, keepExtra: 24, wallH: 8, seed: 21 } },
  { name: "E 大きい島", desc: "島を広く、櫓は小さく",     opts: { size: 48, keep: 5, keepExtra: 10, seed: 33 } },
  { name: "F 小さい島", desc: "島を狭く、密度を上げる",   opts: { size: 32, keep: 5, keepExtra: 12, seed: 42 } },
];

/** 複数の画像を横に並べて1枚にする */
function tile(images, cols, gap = 8, bg = [24, 26, 30, 255]) {
  const cw = Math.max(...images.map((i) => i.w));
  const ch = Math.max(...images.map((i) => i.h));
  const rows = Math.ceil(images.length / cols);
  const W = cols * cw + (cols + 1) * gap;
  const H = rows * ch + (rows + 1) * gap;

  const px = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = 255;
  }

  images.forEach((img, i) => {
    const cx = gap + (i % cols) * (cw + gap) + Math.floor((cw - img.w) / 2);
    const cy = gap + Math.floor(i / cols) * (ch + gap) + (ch - img.h);  // 下端をそろえる
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const s = (y * img.w + x) * 4;
        const d = ((cy + y) * W + (cx + x)) * 4;
        px[d] = img.px[s]; px[d + 1] = img.px[s + 1]; px[d + 2] = img.px[s + 2]; px[d + 3] = 255;
      }
    }
  });

  return { w: W, h: H, px };
}

const views = [];
for (const c of CANDIDATES) {
  const v = buildBase(c.opts);
  views.push(renderIso(v, { scale: 5, tilt: 0.22 }));
  console.log(`${c.name.padEnd(12)} ${c.desc.padEnd(20)} ${v.sx}x${v.sy}x${v.sz}  ${v.count()} ブロック`);
}

const sheet = tile(views, 3);
writeFileSync(join(out, "candidates.png"), encodePng(sheet.w, sheet.h, sheet.px));
console.log(`\n比較画像: out/candidates.png  ${sheet.w}x${sheet.h}`);
console.log("並び: 左上から A B C / D E F");
