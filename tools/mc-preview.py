"""マップの設計図を絵にする。**ゲームに入らずに形を見る。**

    python tools/mc-preview.py <ops.json> --out preview.png

## なぜ要るか

**建てて、入って、歩いて見る**——これを 1 往復するだけで数分かかる。
**設計図（`plan.ts`）は決まりきった手順**なので、**同じ結果をこちらで描ける。**

```
plan.ts  ──tsc──▶  plan.mjs  ──node──▶  ops.json  ──ここ──▶  preview.png
```

**斜め上から見た絵**と**真上から見た絵**を並べて出す。
色は目分量（`COLORS`）——**形と配置を見るためのもので、見た目の最終確認ではない。**
"""

import argparse
import io
import json
import sys

from PIL import Image

# ブロック → 色（**目分量**。近いものは同じ色でよい）
COLORS = {
    "air": None,
    "stone": (125, 125, 125),
    "cobblestone": (127, 127, 127),
    "mossy_cobblestone": (110, 122, 100),
    "andesite": (136, 136, 136),
    "gravel": (131, 127, 126),
    "dirt": (134, 96, 67),
    "coarse_dirt": (119, 85, 59),
    "podzol": (91, 62, 30),
    "grass": (91, 138, 60),
    "moss_block": (89, 109, 45),
    "short_grass": (98, 140, 64),
    "red_flower": (170, 60, 60),
    "yellow_flower": (200, 190, 70),
    "oak_log": (109, 85, 51),
    "birch_log": (215, 210, 197),
    "oak_leaves": (72, 118, 48),
    "birch_leaves": (110, 140, 66),
    "stone_bricks": (122, 122, 122),
    "cracked_stone_bricks": (112, 111, 108),
    "mossy_stone_bricks": (106, 117, 99),
    "stone_brick_slab": (128, 128, 128),
    "stone_brick_wall": (120, 120, 120),
    "stone_brick_stairs": (124, 124, 124),
    "deepslate_tiles": (54, 54, 58),
    "polished_deepslate": (72, 72, 76),
    "deepslate_brick_stairs": (58, 58, 62),
    "dark_oak_planks": (66, 43, 20),
    "dark_oak_log": (60, 45, 26),
    "stripped_dark_oak_log": (95, 70, 40),
    "dark_oak_stairs": (70, 46, 22),
    "dark_oak_door": (80, 55, 28),
    "glass_pane": (185, 220, 226),
    "glowstone": (248, 224, 150),
    "iron_bars": (150, 150, 156),
    "chain": (120, 120, 128),
    "lantern": (240, 200, 120),
    "torch": (240, 210, 130),
    "campfire": (230, 150, 60),
    "red_wool": (170, 60, 60),
    "barrel": (110, 80, 45),
    "brick_block": (150, 97, 83),
    "hardened_clay": (152, 94, 67),
    "smooth_quartz": (236, 233, 226),
    "iron_block": (220, 220, 220),
    "black_concrete": (8, 10, 15),
    # ---- `.schem` から来るもの（黒い石・鉱石・羊毛など）
    "blackstone": (42, 35, 41),
    "polished_blackstone": (53, 47, 55),
    "polished_blackstone_bricks": (48, 42, 49),
    "cracked_polished_blackstone_bricks": (44, 38, 45),
    "chiseled_polished_blackstone": (50, 44, 51),
    "gilded_blackstone": (60, 45, 38),
    "basalt": (73, 72, 78),
    "polished_basalt": (99, 98, 103),
    "smooth_basalt": (58, 58, 66),
    "deepslate": (77, 77, 80),
    "cobbled_deepslate": (77, 77, 82),
    "deepslate_bricks": (71, 71, 74),
    "cracked_deepslate_bricks": (68, 68, 71),
    "cracked_deepslate_tiles": (51, 51, 54),
    "chiseled_deepslate": (55, 55, 58),
    "reinforced_deepslate": (86, 92, 84),
    "coal_ore": (72, 72, 72),
    "coal_block": (17, 17, 17),
    "deepslate_coal_ore": (65, 65, 68),
    "deepslate_copper_ore": (92, 108, 96),
    "deepslate_iron_ore": (106, 100, 94),
    "deepslate_diamond_ore": (78, 104, 108),
    "copper_ore": (124, 128, 108),
    "iron_ore": (136, 124, 112),
    "black_wool": (20, 21, 25),
    "gray_wool": (62, 68, 71),
    "light_gray_wool": (142, 142, 134),
    "black_concrete": (8, 10, 15),
    "black_concrete_powder": (25, 26, 31),
    "gray_concrete": (54, 57, 61),
    "gray_concrete_powder": (76, 80, 84),
    "light_gray_concrete": (125, 125, 115),
    "light_gray_concrete_powder": (154, 155, 146),
    "white_concrete_powder": (225, 227, 228),
    "black_terracotta": (37, 22, 16),
    "cyan_terracotta": (86, 91, 91),
    "gray_glazed_terracotta": (86, 92, 95),
    "obsidian": (20, 18, 30),
    "netherite_block": (66, 60, 62),
    "nether_bricks": (44, 21, 26),
    "cracked_nether_bricks": (48, 24, 28),
    "sculk": (14, 22, 28),
    "mud": (60, 55, 52),
    "clay": (160, 166, 179),
    "tuff": (108, 109, 102),
    "diorite": (188, 188, 190),
    "polished_diorite": (192, 193, 195),
    "polished_andesite": (132, 135, 133),
    "smooth_stone": (158, 158, 158),
    "bedrock": (85, 85, 85),
    "acacia_log": (104, 98, 89),
    "acacia_wood": (150, 88, 53),
    "birch_wood": (196, 178, 123),
    "mushroom_stem": (203, 196, 185),
    "warped_nylium": (43, 105, 99),
    "lodestone": (140, 142, 148),
    "smithing_table": (55, 56, 66),
    "dead_horn_coral_block": (131, 124, 119),
    "dead_brain_coral_block": (127, 120, 116),
    "chiseled_stone_bricks": (119, 119, 119),
}

FALLBACK = (200, 60, 200)  # **色を決めていないブロック**（目立つ紫で出す）


def load(path):
    """命令の一覧を、`(x, y, z) -> ブロック` に畳む。**後の命令が勝つ**"""
    with io.open(path, encoding="utf-8") as f:
        ops = json.load(f)
    world = {}
    for op in ops:
        if op["kind"] == "fill":
            x1, x2 = sorted((op["x1"], op["x2"]))
            y1, y2 = sorted((op["y1"], op["y2"]))
            z1, z2 = sorted((op["z1"], op["z2"]))
            # **広すぎる箱は畳まない**（土台や空。描いても意味が無い）
            if (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1) > 400000:
                if op["block"] == "air":
                    world.clear()
                continue
            for x in range(x1, x2 + 1):
                for y in range(y1, y2 + 1):
                    for z in range(z1, z2 + 1):
                        if op["block"] == "air":
                            world.pop((x, y, z), None)
                        else:
                            world[(x, y, z)] = op["block"]
        else:
            if op["block"] == "air":
                world.pop((op["x"], op["y"], op["z"]), None)
            else:
                world[(op["x"], op["y"], op["z"])] = op["block"]
    return world


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def turn(world, k):
    """**90 度ずつ回す。** 4 方向から見るため"""
    if k % 4 == 0:
        return world
    out = {}
    for (x, y, z), b in world.items():
        for _ in range(k % 4):
            x, z = -z, x
        out[(x, y, z)] = b
    return out


def iso(world, path, cell=4):
    """斜め上から見た絵。**手前から奥へ塗る**（奥のものが隠れる）"""
    xs = [p[0] for p in world]
    ys = [p[1] for p in world]
    zs = [p[2] for p in world]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    minz, maxz = min(zs), max(zs)

    w = (maxx - minx + maxz - minz + 2) * cell + 8
    h = (maxx - minx + maxz - minz + 2) * cell // 2 + (maxy - miny + 2) * cell + 8
    img = Image.new("RGB", (w, h), (18, 20, 26))
    px = img.load()

    def key(item):
        p = item[0]
        return (p[0] - minx) + (p[2] - minz) + (p[1] - miny) * 0.001

    for (x, y, z), block in sorted(world.items(), key=key):
        col = COLORS.get(block, FALLBACK)
        if col is None:
            continue
        sx = (x - minx - (z - minz)) * cell + w // 2
        sy = (x - minx + (z - minz)) * cell // 2 - (y - miny) * cell + h // 3
        top = shade(col, 1.0)
        left = shade(col, 0.78)
        right = shade(col, 0.6)
        for dy in range(cell):
            for dx in range(cell * 2):
                ax, ay = sx + dx - cell, sy + dy
                if 0 <= ax < w and 0 <= ay < h:
                    px[ax, ay] = top
        for dy in range(cell):
            for dx in range(cell):
                ax, ay = sx - cell + dx, sy + cell + dy
                if 0 <= ax < w and 0 <= ay < h:
                    px[ax, ay] = left
                ax2 = sx + dx
                if 0 <= ax2 < w and 0 <= ay < h:
                    px[ax2, ay] = right
    img.save(path)
    return img.size


def top(world, path, cell=3):
    """真上から見た絵。**いちばん高いブロックの色**"""
    xs = [p[0] for p in world]
    zs = [p[2] for p in world]
    minx, maxx = min(xs), max(xs)
    minz, maxz = min(zs), max(zs)
    best = {}
    for (x, y, z), block in world.items():
        cur = best.get((x, z))
        if cur is None or y > cur[0]:
            best[(x, z)] = (y, block)
    img = Image.new("RGB", ((maxx - minx + 1) * cell, (maxz - minz + 1) * cell), (18, 20, 26))
    px = img.load()
    for (x, z), (y, block) in best.items():
        col = COLORS.get(block, FALLBACK)
        if col is None:
            continue
        col = shade(col, 0.75 + min(0.5, y * 0.02))
        for dy in range(cell):
            for dx in range(cell):
                px[(x - minx) * cell + dx, (z - minz) * cell + dy] = col
    img.save(path)
    return img.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ops")
    ap.add_argument("--out", default="preview")
    ap.add_argument("--cell", type=int, default=4)
    args = ap.parse_args()

    world = load(args.ops)
    print(f"ブロック {len(world)} 個")
    unknown = sorted({b for b in world.values() if b not in COLORS})
    if unknown:
        print("色を決めていないブロック（紫で出る）:", unknown)
    # **4 方向から見る**——1 方向だと、裏側の破綻に気づけない
    shots = []
    for k in range(4):
        path = f"{args.out}-iso{k}.png"
        iso(turn(world, k), path, args.cell)
        shots.append(path)
    # 1 枚に並べる（**まとめて見比べる**ため）
    imgs = [Image.open(p2) for p2 in shots]
    w = max(i.width for i in imgs)
    h = max(i.height for i in imgs)
    sheet = Image.new("RGB", (w * 2 + 12, h * 2 + 12), (10, 11, 14))
    for i, im in enumerate(imgs):
        sheet.paste(im, ((i % 2) * (w + 12), (i // 2) * (h + 12)))
    sheet.save(f"{args.out}-4.png")
    print("4 方向:", f"{args.out}-4.png", sheet.size)
    print("真上:", top(world, f"{args.out}-top.png"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
