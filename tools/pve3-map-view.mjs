/**
 * 戦場を**絵にして見る。**
 *
 *     node tools/pve3-map-view.mjs basin
 *     node tools/pve3-map-view.mjs basin --ring 4
 *     node tools/pve3-map-view.mjs crypt --slice 6      天井を外して中を見る
 *     node tools/pve3-map-view.mjs netherspan --under   下から見る（橋の裏・張り出し）
 *     node tools/pve3-map-view.mjs aqueduct --inside --from 0,4,-40 --at 0,4,10   中に立って見る
 *
 * 決まりは `worlds/pve-v3/docs/spec/14-map-build.md` 0-8-1。
 *
 * ## なぜ要るのか
 *
 * > ### 数の検査（0-9）は「壊れていないか」しか見ない
 * >
 * > **見て面白いかは、絵にしないと分からない。**
 *
 * ## どうやっているか
 *
 * 1. `scripts/core/maps.ts` を **esbuild で束ねて**読む（`.ts` のままでは辿れない）
 * 2. 手順（`BuildOp`）を**柱の高さと表面の材**に畳む
 * 3. `tools/mc-render.py` に渡して描く（**影のある光線描画**）
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACK = path.resolve("worlds/pve-v3/packs/pve_v3");
const OUT = path.resolve("worlds/pve-v3/preview");
const HALF = 50;
const MARGIN = 6;

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) ?? "basin";
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};

// ---- 束ねて読む
const dir = mkdtempSync(path.join(tmpdir(), "mapview-"));
const bundle = path.join(dir, "maps.mjs");
execFileSync(
  process.execPath,
  [
    path.join(PACK, "node_modules", "esbuild", "bin", "esbuild"),
    path.join(PACK, "scripts/core/maps.ts"),
    "--bundle",
    "--format=esm",
    `--outfile=${bundle}`,
  ],
  { cwd: PACK, stdio: "pipe" }
);
const { MAPS } = await import(pathToFileURL(bundle).href);
rmSync(dir, { recursive: true, force: true });

const def = MAPS[id];
if (def === undefined) {
  console.error(`知らないマップ: ${id}\nあるのは ${Object.keys(MAPS).join(" / ")}`);
  process.exit(1);
}
const ops = def.ops();
console.log(`${id}（${def.name}）  手順 ${ops.length}`);

// ---- 立体に積む。**上だけでなく、全部の高さを持つ**
//
// > ### 柱の一番上だけだと、裏が見えない
// >
// > **橋の下のアーチ、屋内の中、張り出しの裏**が写らない（2026-09-06 に気づいた）。
// > **`--slice` で天井を外し、`--under` で下から見る**ために、いったん全部持つ。
const W = (HALF + MARGIN) * 2 + 1;
const off = HALF + MARGIN;
const Y0 = -60;
const Y1 = 150;
const YS = Y1 - Y0 + 1;
const vox = new Uint8Array(W * W * YS);
const palette = ["air"];
const index = new Map([["air", 0]]);
const idOf = (block) => {
  let i = index.get(block);
  if (i === undefined) {
    i = palette.length;
    palette.push(block);
    index.set(block, i);
  }
  return i;
};

let placed = 0;
for (const op of ops) {
  // **`set` は 1 マスの `fill` として扱う**（`core/build.ts`）
  const a = op.kind === "set" ? op.at : op.from;
  const b = op.kind === "set" ? op.at : op.to;
  const x1 = Math.max(-off, Math.min(a.x, b.x));
  const x2 = Math.min(off, Math.max(a.x, b.x));
  const y1 = Math.max(Y0, Math.min(a.y, b.y));
  const y2 = Math.min(Y1, Math.max(a.y, b.y));
  const z1 = Math.max(-off, Math.min(a.z, b.z));
  const z2 = Math.min(off, Math.max(a.z, b.z));
  const bi = op.block === "air" ? 0 : idOf(op.block);
  if (bi !== 0) placed += Math.max(0, (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1));
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      const col = ((z + off) * W + (x + off)) * YS;
      for (let y = y1; y <= y2; y++) vox[col + (y - Y0)] = bi;
    }
  }
}
console.log(`置いたブロック ${placed.toLocaleString()} ／ 材 ${palette.length - 1} 種`);

/**
 * 表面に畳む。
 *
 * @param limit  **この高さより上は無いことにする**（天井を外す）
 * @param under  **下から見る**（柱のいちばん下を拾う）
 */
function surfaceOf(limit, under) {
  const top = new Float32Array(W * W).fill(-999);
  const surf = new Int32Array(W * W).fill(0);
  const hi = Math.min(Y1, limit);
  for (let k = 0; k < W * W; k++) {
    const col = k * YS;
    if (under) {
      for (let y = Y0; y <= hi; y++) {
        const v = vox[col + (y - Y0)];
        if (v !== 0) {
          // **下から見るので、上下をひっくり返して高さにする**
          top[k] = -y;
          surf[k] = v;
          break;
        }
      }
    } else {
      for (let y = hi; y >= Y0; y--) {
        const v = vox[col + (y - Y0)];
        if (v !== 0) {
          top[k] = y;
          surf[k] = v;
          break;
        }
      }
    }
  }
  return { top, surf };
}

const limit = Number(flag("slice", String(Y1)));
const under = args.includes("--under");
const { top, surf } = surfaceOf(limit, under);
if (limit < Y1) console.log(`  y ${limit} より上を外して描く`);
if (under) console.log("  下から見る");

// ---- 絵にする
mkdirSync(OUT, { recursive: true });
const scene = path.join(OUT, `${id}.json`);
writeFileSync(
  scene,
  JSON.stringify({
    w: W,
    l: W,
    x0: -off,
    z0: -off,
    field: { x1: -HALF, z1: -HALF, x2: HALF, z2: HALF },
    h: Array.from(top, (v) => (v < -900 ? -60 : v)),
    b: Array.from(surf),
    palette,
  })
);

// ---- **中から見る**（屋内マップ。`tools/pve3-inside.py`）
if (args.includes("--inside")) {
  const opsFile = path.join(OUT, `${id}-ops.json`);
  writeFileSync(opsFile, JSON.stringify(ops));
  execFileSync(
    "python",
    [
      "tools/pve3-inside.py",
      opsFile,
      "--from",
      flag("from", "0,4,-44"),
      "--at",
      flag("at", "0,4,10"),
      "--out",
      path.join(OUT, `${id}-inside.png`),
      "--size",
      flag("size", "1100x620"),
    ],
    { stdio: "inherit" }
  );
  process.exit(0);
}

const ring = flag("ring", undefined);
const out = path.join(OUT, `${id}.png`);
const py = ["tools/mc-render.py", scene, "--out", out, "--size", flag("size", "1100x620")];
if (ring !== undefined) py.push("--ring", ring);
else py.push("--from", flag("from", "0,52,-92"), "--at", flag("at", "0,2,6"));
execFileSync("python", py, { stdio: "inherit" });
