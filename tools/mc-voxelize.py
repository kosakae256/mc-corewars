"""3D モデル（OBJ）を、Minecraft のブロックに置き換える。

    python tools/mc-voxelize.py <入力.obj> --height 10 --out <出力名>

仕様は `docs/spec/40-voxelize.md`。

## なぜ OBJ なのか

**テキストだから、追加のライブラリ無しで読める。**
Unity や Blender から書き出すとき、**OBJ を選べば今日から通る**
（FBX / glb は読むのに別のライブラリが要る）。

## やっていること

```
OBJ を読む（頂点・面・マテリアル）
  ↓ 面を三角形に割り、表面を細かく点で刻む
  ↓ その点が入る格子（ブロック）を塗る
  ↓ マテリアル名 → ブロックの対応表を当てる
ブロックの一覧（JSON）＋ 見え方の下絵（PNG）
```

**中身は埋めない**（`--solid` を付けると床から埋める）。
ゲーム用のモデルは**中が空の殻**なので、そのままだと壁 1 枚になる。

## 分かっている限界

| | |
| --- | --- |
| **薄いもの** | 手すり・窓枠は 1 マスに潰れるか消える |
| **地面の板** | 巨大な床は `--drop-floor` で外す |
| **色** | **対応表が最優先。** 無いものは `Kd`（材質の色）から近いブロックを選ぶ |
"""

import argparse
import io
import json
import math
import os
import sys

# ---------------------------------------------------------------- 対応表
#
# **マテリアル名（小文字・部分一致）→ ブロック。**
# **上から順に見て、最初に当たったものを使う。**
#
# ここに無いものは `Kd` の色から選ぶ（`PALETTE`）。

RULES = [
    ("glass", "glass_pane"),
    ("window", "glass_pane"),
    ("brick", "brick_block"),
    ("stone", "cobblestone"),
    ("rock", "cobblestone"),
    ("concrete", "stone"),
    ("plaster", "smooth_quartz"),
    ("tyrolean", "smooth_quartz"),
    ("wall", "smooth_quartz"),
    ("roof", "deepslate_brick_stairs"),
    ("tile", "deepslate_tiles"),
    ("beech", "dark_oak_planks"),
    ("oak", "oak_planks"),
    ("wood", "dark_oak_planks"),
    ("plank", "dark_oak_planks"),
    ("log", "dark_oak_log"),
    ("moss", "moss_block"),
    ("grass", "grass"),
    ("dirt", "dirt"),
    ("metal", "iron_block"),
    ("steel", "iron_block"),
    ("iron", "iron_block"),
    ("clay", "hardened_clay"),
    ("rubber", "black_concrete"),
    ("carbon", "polished_deepslate"),
]

# 色で選ぶときの候補（**RGB は目分量**。ブロックの平均色に近い値）
#
# > ### 名前は Bedrock の id で書く（2026-08-31）
# >
# > `bricks` や `terracotta` は **Java の名前**——Bedrock では
# > `brick_block` / `hardened_clay`。**置けずに黙って消える**ので、
# > **`reference/bedrock-samples/resource_pack/blocks.json` で確かめる。**
PALETTE = [
    ("white_concrete", (207, 213, 214)),
    ("smooth_quartz", (236, 233, 226)),
    ("stone", (125, 125, 125)),
    ("cobblestone", (127, 127, 127)),
    ("deepslate_tiles", (54, 54, 58)),
    ("polished_deepslate", (72, 72, 76)),
    ("brick_block", (150, 97, 83)),
    ("hardened_clay", (152, 94, 67)),
    ("dark_oak_planks", (66, 43, 20)),
    ("oak_planks", (162, 130, 78)),
    ("spruce_planks", (114, 84, 48)),
    ("dirt", (134, 96, 67)),
    ("coarse_dirt", (119, 85, 59)),
    ("grass", (91, 138, 60)),
    ("moss_block", (89, 109, 45)),
    ("iron_block", (220, 220, 220)),
    ("gold_block", (246, 208, 61)),
    ("black_concrete", (8, 10, 15)),
    ("glass_pane", (175, 213, 219)),
]


def parse_mtl(path):
    """マテリアル名 → 色（0〜255）"""
    colors = {}
    name = None
    if not os.path.exists(path):
        return colors
    for line in io.open(path, encoding="utf-8", errors="ignore"):
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "newmtl":
            name = line.split(None, 1)[1].strip()
        elif parts[0] == "Kd" and name is not None:
            rgb = [float(v) for v in parts[1:4]]
            colors[name] = tuple(int(max(0, min(1, c)) * 255) for c in rgb)
    return colors


def block_for(mat, colors):
    """マテリアル 1 つに、ブロックを 1 つ決める"""
    low = (mat or "").lower()
    for key, block in RULES:
        if key in low:
            return block
    rgb = colors.get(mat)
    if rgb is None:
        return "stone"
    best, dist = "stone", 1e18
    for block, c in PALETTE:
        d = sum((rgb[i] - c[i]) ** 2 for i in range(3))
        if d < dist:
            best, dist = block, d
    return best


def read_obj(path):
    """頂点と、（三角形, マテリアル）の一覧"""
    verts = []
    tris = []
    mat = "(null)"
    for line in io.open(path, encoding="utf-8", errors="ignore"):
        if line.startswith("v "):
            p = line.split()
            verts.append((float(p[1]), float(p[2]), float(p[3])))
        elif line.startswith("usemtl"):
            mat = line.split(None, 1)[1].strip() if len(line.split(None, 1)) > 1 else "(null)"
        elif line.startswith("f "):
            idx = []
            for tok in line.split()[1:]:
                v = tok.split("/")[0]
                if not v:
                    continue
                i = int(v)
                idx.append(i - 1 if i > 0 else len(verts) + i)
            # 多角形は扇状に割る
            for k in range(1, len(idx) - 1):
                tris.append((idx[0], idx[k], idx[k + 1], mat))
    return verts, tris


def voxelize(verts, tris, scale, drop_floor):
    """三角形の表面を点で刻んで、格子を塗る"""
    grid = {}
    # **巨大な床を外す**（家より広い水平な面）
    xs = [v[0] for v in verts]
    zs = [v[2] for v in verts]
    span = max(max(xs) - min(xs), max(zs) - min(zs))

    for a, b, c, mat in tris:
        va, vb, vc = verts[a], verts[b], verts[c]
        if drop_floor:
            flat = abs(va[1] - vb[1]) < 1e-3 and abs(va[1] - vc[1]) < 1e-3
            big = max(abs(va[0] - vb[0]), abs(va[2] - vb[2])) > span * 0.4
            if flat and big:
                continue
        # 三角形の大きさから刻みを決める（**1 ブロックより細かく**）
        e1 = math.dist(va, vb) * scale
        e2 = math.dist(va, vc) * scale
        n = max(2, min(64, int(max(e1, e2) * 1.5) + 2))
        for i in range(n + 1):
            for j in range(n + 1 - i):
                u = i / n
                v = j / n
                w = 1 - u - v
                x = va[0] * w + vb[0] * u + vc[0] * v
                y = va[1] * w + vb[1] * u + vc[1] * v
                z = va[2] * w + vb[2] * u + vc[2] * v
                key = (int(math.floor(x * scale)), int(math.floor(y * scale)), int(math.floor(z * scale)))
                grid.setdefault(key, mat)
    return grid


def preview(grid, blocks, path):
    """真横と真上から見た下絵（**当たりを付けるためだけ**）"""
    try:
        from PIL import Image
    except ImportError:
        return None
    xs = [k[0] for k in grid]
    ys = [k[1] for k in grid]
    zs = [k[2] for k in grid]
    w, h, d = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, max(zs) - min(zs) + 1
    color = {b: c for b, c in PALETTE}

    side = Image.new("RGB", (w, h), (24, 26, 32))
    top = Image.new("RGB", (w, d), (24, 26, 32))
    ps, pt = side.load(), top.load()
    for (x, y, z), mat in grid.items():
        c = color.get(blocks.get(mat, "stone"), (160, 160, 160))
        ps[x - min(xs), h - 1 - (y - min(ys))] = c
        pt[x - min(xs), z - min(zs)] = c
    out = Image.new("RGB", (w * 2 + 8, max(h, d)), (12, 12, 16))
    out.paste(side, (0, 0))
    out.paste(top, (w + 8, 0))
    k = max(1, 512 // max(w * 2, max(h, d)))
    out.resize((out.width * k, out.height * k), Image.NEAREST).save(path)
    return (w, h, d)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("obj")
    ap.add_argument("--height", type=float, default=10, help="出来上がりの高さ（ブロック）")
    ap.add_argument("--out", default="voxel")
    ap.add_argument("--drop-floor", action="store_true", help="巨大な床の板を外す")
    ap.add_argument("--ts", help="パックへ持っていく TypeScript を書き出す先")
    args = ap.parse_args()

    verts, tris = read_obj(args.obj)
    colors = parse_mtl(os.path.splitext(args.obj)[0] + ".mtl")
    mats = sorted({t[3] for t in tris})
    blocks = {m: block_for(m, colors) for m in mats}

    # **高さから縮尺を決める**（`--height` ブロックに収まるように）
    ys = [v[1] for v in verts]
    tall = max(ys) - min(ys)
    scale = args.height / tall if tall > 0 else 1

    grid = voxelize(verts, tris, scale, args.drop_floor)
    print(f"三角形 {len(tris)} / ブロック {len(grid)} / 縮尺 1 単位 = {scale:.2f} ブロック")
    print("マテリアルの割り当て:")
    for m in mats:
        print(f"  {m:44s} -> {blocks[m]}")

    size = preview(grid, blocks, f"{args.out}.png")
    if size:
        print(f"下絵: {args.out}.png（{size[0]} x {size[1]} x {size[2]}）")

    xs = [k[0] for k in grid]
    ys2 = [k[1] for k in grid]
    zs = [k[2] for k in grid]
    data = [
        {"x": k[0] - min(xs), "y": k[1] - min(ys2), "z": k[2] - min(zs), "b": blocks[v]} for k, v in grid.items()
    ]
    with io.open(f"{args.out}.json", "w", encoding="utf-8") as f:
        json.dump({"size": [max(xs) - min(xs) + 1, max(ys2) - min(ys2) + 1, max(zs) - min(zs) + 1], "blocks": data}, f)
    print(f"書き出し: {args.out}.json")

    # ---- パックへ持っていく形（**TypeScript のデータ**）
    #
    # **JSON をゲーム内から読む手段が無い**ので、**モジュールとして埋め込む。**
    # ブロック名は 1 度だけ書き、**位置は番号で指す**（短くなる）。
    if args.ts:
        names = sorted({b["b"] for b in data})
        idx = {n: i for i, n in enumerate(names)}
        rows = ",".join("[%d,%d,%d,%d]" % (b["x"], b["y"], b["z"], idx[b["b"]]) for b in data)
        name = os.path.splitext(os.path.basename(args.ts))[0]
        sx = max(b["x"] for b in data) + 1
        sy = max(b["y"] for b in data) + 1
        sz = max(b["z"] for b in data) + 1
        lines = [
            "/**",
            " * %s。**3D モデルから焼いたブロックの並び。**" % name,
            " *",
            " * `tools/mc-voxelize.py` が書き出す。**手で直さない**——",
            " * **元のモデルを差し替えて、焼き直す。**",
            " */",
            "",
            "export interface VoxelModel {",
            "  /** 大きさ（x, y, z） */",
            "  readonly size: readonly [number, number, number];",
            "  /** 使うブロック */",
            "  readonly palette: readonly string[];",
            "  /** `[x, y, z, palette の番号]` */",
            "  readonly blocks: ReadonlyArray<readonly [number, number, number, number]>;",
            "}",
            "",
            "export const %s: VoxelModel = {" % name,
            "  size: [%d, %d, %d]," % (sx, sy, sz),
            "  palette: %s," % json.dumps(names),
            "  blocks: [%s]," % rows,
            "};",
            "",
        ]
        with io.open(args.ts, "w", encoding="utf-8") as f:
            f.write(chr(10).join(lines))
        print("書き出し: %s" % args.ts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
