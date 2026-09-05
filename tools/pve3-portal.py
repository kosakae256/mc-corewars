"""**ポータルのテクスチャを 6 色ぶん描く。**

    python tools/pve3-portal.py

仕様は `worlds/pve-v3/docs/spec/20-portal.md` 2 章。

## 何を作るか

| | |
| --- | --- |
| `textures/blocks/pve3_portal_<1〜6>.png` | **16 × 128。** 1 コマ 16 × 16 を 8 枚縦に並べたもの |
| `textures/terrain_texture.json` | 6 つの短い名前 → 画像の場所 |
| `textures/flipbook_textures.json` | **2 tick ごとに 1 コマ**送る |

> ### **バニラのポータルの絵は使わない**
>
> **第三者のアセットを取り込まない**（`CLAUDE.md`）。**ここで作る。**
>
> 渦は**極座標のうねり**で描く。`hash` の格子から作った値を、
> **中心からの角度と距離でずらしながら**足し合わせている。
> **コマを送ると角度がずれる**ので、渦が回って見える。
"""

import io
import json
import math
import os
import random

from PIL import Image

ROOT = os.path.join("worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
OUT = os.path.join(ROOT, "textures", "blocks")

SIZE = 16
FRAMES = 8

# ★1 から★6 へ。**紫 → 赤 → 赤黒**。最後の 1 つは**休憩所**（水色）
COLORS = [
    ("1", (0x8B, 0x3F, 0xD9)),
    ("2", (0xA6, 0x33, 0xC6)),
    ("3", (0xC0, 0x2E, 0x9E)),
    ("4", (0xD4, 0x3A, 0x63)),
    ("5", (0xE0, 0x3A, 0x2E)),
    ("6", (0x6E, 0x0C, 0x10)),
    ("rest", (0x62, 0xD8, 0xD0)),
]

# **暗いほうの色。** 明るい渦の下に敷く
DARK = 0.18


def noise_grid(seed, n=8):
    """n × n の格子に、0〜1 の値を置く"""
    r = random.Random(seed)
    return [[r.random() for _ in range(n)] for _ in range(n)]


def sample(grid, u, v):
    """格子を**なめらかに**読む（周りと繋がるように折り返す）"""
    n = len(grid)
    x, y = u * n, v * n
    x0, y0 = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - x0, y - y0
    # なめらかに（3t² − 2t³）
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = grid[y0 % n][x0 % n]
    b = grid[y0 % n][(x0 + 1) % n]
    c = grid[(y0 + 1) % n][x0 % n]
    d = grid[(y0 + 1) % n][(x0 + 1) % n]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def swirl(grids, px, py, turn):
    """その点の明るさ（0〜1）。**中心からの角度と距離でうねらせる**"""
    cx = cy = (SIZE - 1) / 2
    dx, dy = (px - cx) / cx, (py - cy) / cy
    dist = min(1.0, math.hypot(dx, dy) / math.sqrt(2))
    ang = math.atan2(dy, dx) / (math.pi * 2)
    v = 0.0
    weight = 0.0
    for i, g in enumerate(grids):
        # **層ごとに回る速さを変える**——重なると渦らしく見える
        a = (ang + turn * (1 + i * 0.6) + dist * (0.8 + i * 0.5)) % 1.0
        w = 1.0 / (i + 1)
        v += sample(g, a, (dist * (1.2 + i * 0.4)) % 1.0) * w
        weight += w
    v /= weight
    # **縁を落として、中心を濃く**
    return max(0.0, min(1.0, (v - 0.28) * 1.9)) * (1.0 - dist * 0.55)


def sheet(color, seed):
    """1 色ぶんの 16 × 128"""
    grids = [noise_grid(seed + i, 8) for i in range(3)]
    img = Image.new("RGBA", (SIZE, SIZE * FRAMES), (0, 0, 0, 0))
    px = img.load()
    r, g, b = color
    for f in range(FRAMES):
        turn = f / FRAMES
        for y in range(SIZE):
            for x in range(SIZE):
                v = swirl(grids, x, y, turn)
                # **暗い地の上に、明るい渦**
                m = DARK + v * (1.0 - DARK)
                a = int(90 + v * 165)
                px[x, f * SIZE + y] = (int(r * m), int(g * m), int(b * m), min(255, a))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    terrain = {}
    flip = []
    for i, (tag, color) in enumerate(COLORS, start=1):
        name = f"pve3_portal_{tag}"
        path = f"textures/blocks/{name}"
        sheet(color, 1000 + i * 17).save(os.path.join(OUT, f"{name}.png"))
        terrain[name] = {"textures": path}
        flip.append({"flipbook_texture": path, "atlas_tile": name, "ticks_per_frame": 2})
        print("kaita:", os.path.join(OUT, f"{name}.png"))

    j = os.path.join(ROOT, "textures", "terrain_texture.json")
    io.open(j, "w", encoding="utf-8", newline="\n").write(
        json.dumps(
            {
                "resource_pack_name": "pve_v3",
                "texture_name": "atlas.terrain",
                "padding": 8,
                "num_mip_levels": 4,
                "texture_data": terrain,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print("kaita:", j)

    j = os.path.join(ROOT, "textures", "flipbook_textures.json")
    io.open(j, "w", encoding="utf-8", newline="\n").write(json.dumps(flip, ensure_ascii=False, indent=2) + "\n")
    print("kaita:", j)


if __name__ == "__main__":
    main()
