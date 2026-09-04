"""場面（`scene.json`）を**写真として撮る。**

    python tools/mc-render.py scene.json --from 900,140,420 --at 1254,40,700 --out shot.png
    python tools/mc-render.py scene.json --ring 8 --radius 340 --height 150 --out shots/ring

## 何のためか

> ### 平面図では、色合いと起伏の違和感が分からない
>
> 上から見た図は「どこに何があるか」しか教えてくれない。
> **山が唐突か、色が濁っていないか、遠景が眠くないか**は、
> **その場に立って見た絵**でしか分からない。

**任意の位置・任意の向きから撮れる。** 真上からでも、地面すれすれからでもよい。
`--from`／`--at` の y に `~` を付けると、**その場の地面からの高さ**になる
（`--from 1246,~2,800` ＝ 道の上に立った目線）。

## どう描いているか

**画素ごとに光線を飛ばし、地面（柱の高さ）に当たった所の色を塗る。**
斜め投影と違って**画角・向きの制限が無い**（真下も向ける）。

| | |
| --- | --- |
| 明るさ | 傾きから作る（北西からの光）。**崖は暗く** |
| 遠さ | 遠いほど空の色へ溶かす（**遠景が板に見えないように**） |
| 空 | 上ほど濃い青。地平線側は白っぽく |

色は目分量（`COLORS`）——**形と色合いの当たりを見るためのもので、最終確認ではない。**
"""

import argparse
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image

# ブロック → 色（**目分量**）
COLORS = {
    "air": (20, 22, 28),
    "grass": (95, 141, 62), "moss_block": (89, 109, 45), "podzol": (91, 62, 30),
    "dirt": (134, 96, 67), "coarse_dirt": (119, 85, 59), "gravel": (131, 127, 126),
    "stone": (125, 125, 125), "andesite": (136, 136, 136), "cobblestone": (127, 127, 127),
    "smooth_stone": (158, 158, 158), "diorite": (188, 188, 190), "polished_diorite": (192, 193, 195),
    "polished_andesite": (132, 135, 133), "light_gray_concrete_powder": (154, 155, 146),
    "white_concrete_powder": (225, 227, 228), "light_gray_concrete": (125, 125, 115),
    "clay": (160, 166, 179), "tuff": (108, 109, 102), "mud": (60, 55, 52),
    "stone_bricks": (122, 122, 122), "cracked_stone_bricks": (112, 111, 108),
    "mossy_stone_bricks": (106, 117, 99), "chiseled_stone_bricks": (119, 119, 119),
    "stone_brick_slab": (128, 128, 128), "stone_brick_wall": (120, 120, 120),
    "stone_brick_stairs": (124, 124, 124),
    "blackstone": (42, 35, 41), "polished_blackstone": (53, 47, 55),
    "polished_blackstone_bricks": (48, 42, 49), "cracked_polished_blackstone_bricks": (44, 38, 45),
    "chiseled_polished_blackstone": (50, 44, 51), "gilded_blackstone": (60, 45, 38),
    "basalt": (73, 72, 78), "polished_basalt": (99, 98, 103), "smooth_basalt": (58, 58, 66),
    "deepslate": (77, 77, 80), "cobbled_deepslate": (77, 77, 82), "deepslate_bricks": (71, 71, 74),
    "cracked_deepslate_bricks": (68, 68, 71), "deepslate_tiles": (54, 54, 58),
    "cracked_deepslate_tiles": (51, 51, 54), "chiseled_deepslate": (55, 55, 58),
    "polished_deepslate": (72, 72, 76), "reinforced_deepslate": (86, 92, 84),
    "coal_ore": (72, 72, 72), "coal_block": (17, 17, 17), "deepslate_coal_ore": (65, 65, 68),
    "deepslate_copper_ore": (92, 108, 96), "deepslate_iron_ore": (106, 100, 94),
    "deepslate_diamond_ore": (78, 104, 108), "copper_ore": (124, 128, 108), "iron_ore": (136, 124, 112),
    "black_wool": (20, 21, 25), "gray_wool": (62, 68, 71), "light_gray_wool": (142, 142, 134),
    "black_concrete": (8, 10, 15), "black_concrete_powder": (25, 26, 31),
    "gray_concrete": (54, 57, 61), "gray_concrete_powder": (76, 80, 84),
    "black_terracotta": (37, 22, 16), "cyan_terracotta": (86, 91, 91),
    "gray_glazed_terracotta": (86, 92, 95), "obsidian": (20, 18, 30), "netherite_block": (66, 60, 62),
    "nether_bricks": (44, 21, 26), "cracked_nether_bricks": (48, 24, 28), "sculk": (14, 22, 28),
    "oak_log": (109, 85, 51), "birch_log": (215, 210, 197), "oak_leaves": (72, 118, 48),
    "birch_leaves": (110, 140, 66), "acacia_log": (104, 98, 89), "acacia_wood": (150, 88, 53),
    "birch_wood": (196, 178, 123), "mushroom_stem": (203, 196, 185),
    "dark_oak_planks": (66, 43, 20), "dark_oak_log": (60, 45, 26), "dark_oak_stairs": (70, 46, 22),
    "stripped_dark_oak_log": (95, 70, 40), "dark_oak_door": (80, 55, 28),
    "glass_pane": (185, 220, 226), "glowstone": (248, 224, 150), "iron_bars": (150, 150, 156),
    "chain": (120, 120, 128), "lantern": (240, 200, 120), "torch": (240, 210, 130),
    "campfire": (230, 150, 60), "red_wool": (170, 60, 60), "barrel": (110, 80, 45),
    "brick_block": (150, 97, 83), "hardened_clay": (152, 94, 67), "smooth_quartz": (236, 233, 226),
    "iron_block": (220, 220, 220), "bedrock": (85, 85, 85), "lodestone": (140, 142, 148),
    "smithing_table": (55, 56, 66), "warped_nylium": (43, 105, 99),
    "dead_horn_coral_block": (131, 124, 119), "dead_brain_coral_block": (127, 120, 116),
    "short_grass": (98, 140, 64), "water": (60, 90, 170),
    "gray_terracotta": (58,42,36),
    "brown_terracotta": (77,51,36),
    "chiseled_tuff": (100,101,95),
    "tuff_bricks": (104,105,98),
    "polished_tuff": (112,113,106),
    "mossy_cobblestone": (110,122,100),
    "dark_oak_fence": (70,46,22),
    "grass_path": (148,124,70),
    "packed_mud": (142,109,80),
    "dripstone_block": (134,107,92),
    "calcite": (223,224,220),
    "polished_granite": (154,106,88),
    "granite": (149,103,85),
    "spruce_log": (88,66,40),
    "oak_fence": (150,120,72),
    "spruce_planks": (114,84,48),
    "oak_planks": (162,130,78),
}
FALLBACK = (200, 60, 200)  # **色を決めていないブロック**（紫で目立たせる）

SKY_TOP = np.array([92, 128, 190], dtype=np.float32)
SKY_LOW = np.array([196, 212, 228], dtype=np.float32)


def load(path):
    with io.open(path, encoding="utf-8") as f:
        d = json.load(f)
    w, l = d["w"], d["l"]
    h = np.array(d["h"], dtype=np.float32).reshape(l, w)
    b = np.array(d["b"], dtype=np.int32).reshape(l, w)
    pal = np.array([COLORS.get(n, FALLBACK) for n in d["palette"]], dtype=np.float32)
    unknown = sorted({n for n in d["palette"] if n not in COLORS})
    if unknown:
        print("色を決めていないブロック（紫で出る）:", ", ".join(unknown[:20]))
    return d, h, b, pal


def shading(h):
    """傾きから明るさを作る。**北西からの光**"""
    hx = np.zeros_like(h)
    hz = np.zeros_like(h)
    hx[:, 1:-1] = h[:, 2:] - h[:, :-2]
    hz[1:-1, :] = h[2:, :] - h[:-2, :]
    lit = 0.86 + 0.085 * (-hx) + 0.055 * (-hz)
    # **崖は暗く**（急なほど落ちる）
    steep = np.sqrt(hx * hx + hz * hz)
    lit -= np.clip(steep * 0.02, 0, 0.28)
    lit = np.clip(lit, 0.34, 1.16)
    # **日陰は落とす**（色は少し青く——空の光しか当たらないから）
    dark = shadows(h)
    lit = np.where(dark, lit * 0.62, lit)
    return lit.astype(np.float32), dark


def shadows(h, sun=(-0.5, 0.66, -0.56), reach=260):
    """**日陰**を作る。太陽へ向かって光線を伸ばし、途中に地面があれば陰。

    立体感は影で決まる。**影が無いと、山が板に見えて判断できない。**
    """
    l, w = h.shape
    zz, xx = np.meshgrid(np.arange(l, dtype=np.float32), np.arange(w, dtype=np.float32), indexing="ij")
    y = h.copy() + 0.6
    x = xx.copy()
    z = zz.copy()
    dark = np.zeros_like(h, dtype=bool)
    step = 1.6
    for _ in range(int(reach / step)):
        x += sun[0] * step
        y += sun[1] * step
        z += sun[2] * step
        xi = np.clip(x.astype(np.int64), 0, w - 1)
        zi = np.clip(z.astype(np.int64), 0, l - 1)
        inside = (x >= 0) & (x < w) & (z >= 0) & (z < l)
        dark |= inside & (h[zi, xi] > y) & (h[zi, xi] > -900)
    return dark


def norm(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v) if n > 0 else (0.0, 0.0, 1.0)


def render(d, h, b, pal, lit, dark, cam, look, fov, size, far, out):
    W, Hp = size
    x0, z0 = d["x0"], d["z0"]
    gw, gl = d["w"], d["l"]

    fwd = norm((look[0] - cam[0], look[1] - cam[1], look[2] - cam[2]))
    # 右と上（**傾けない**——水平は水平のまま）。
    # right = fwd × 上、up = right × fwd。**この順を逆にすると絵が上下反転する**
    flat = (-fwd[2], 0.0, fwd[0])
    right = norm(flat) if abs(fwd[0]) + abs(fwd[2]) > 1e-6 else (1.0, 0.0, 0.0)
    up = norm((
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
    ))

    ar = W / Hp
    tan = math.tan(math.radians(fov) / 2)
    px = (np.arange(W, dtype=np.float32) + 0.5) / W * 2 - 1
    py = 1 - (np.arange(Hp, dtype=np.float32) + 0.5) / Hp * 2
    U, V = np.meshgrid(px * tan * ar, py * tan)

    dx = fwd[0] + right[0] * U + up[0] * V
    dy = fwd[1] + right[1] * U + up[1] * V
    dz = fwd[2] + right[2] * U + up[2] * V
    ln = np.sqrt(dx * dx + dy * dy + dz * dz)
    dx = dx / ln
    dy = dy / ln
    dz = dz / ln

    hit = np.zeros((Hp, W), dtype=bool)
    ht = np.zeros((Hp, W), dtype=np.float32)
    hi = np.zeros((Hp, W), dtype=np.int64)
    hj = np.zeros((Hp, W), dtype=np.int64)

    t = np.full((Hp, W), 0.5, dtype=np.float32)
    for _ in range(1200):
        wx = cam[0] + dx * t
        wy = cam[1] + dy * t
        wz = cam[2] + dz * t
        xi = np.clip((wx - x0).astype(np.int64), 0, gw - 1)
        zi = np.clip((wz - z0).astype(np.int64), 0, gl - 1)
        inside = (wx >= x0) & (wx < x0 + gw) & (wz >= z0) & (wz < z0 + gl)
        gh = h[zi, xi]
        now = (~hit) & inside & (gh > -900) & (wy <= gh)
        if now.any():
            hit = hit | now
            ht = np.where(now, t, ht)
            hi = np.where(now, xi, hi)
            hj = np.where(now, zi, hj)
        # **遠いほど大きく進む**（近くは細かく、遠くは粗く）
        t = np.where(hit, t, t + np.maximum(0.55, t * 0.012))
        if (hit | (t > far)).all():
            break

    # ---- 空
    up_amt = np.clip((dy + 0.25) / 1.25, 0, 1)[..., None]
    img = SKY_LOW * (1 - up_amt) + SKY_TOP * up_amt

    # ---- 地面
    col = pal[np.clip(b[hj, hi], 0, len(pal) - 1)]
    col = col * lit[hj, hi][..., None]
    # 日陰は空の色を少し混ぜる（**真っ黒にしない**）
    shade = dark[hj, hi][..., None]
    col = np.where(shade, col * 0.88 + np.array([26, 34, 52], dtype=np.float32), col)
    # **霧は控えめに。** 濃いと全部白くなって、色合いの判断ができなくなる
    fog = np.clip((ht / far) ** 1.7, 0, 0.62)[..., None]
    col = col * (1 - fog) + SKY_LOW * fog
    img = np.where(hit[..., None], col, img)

    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(out)
    return out


def ground(h, d, x, z):
    xi = int(np.clip(x - d["x0"], 0, d["w"] - 1))
    zi = int(np.clip(z - d["z0"], 0, d["l"] - 1))
    v = float(h[zi, xi])
    return 15.0 if v < -900 else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scene")
    ap.add_argument("--from", dest="cam", help="カメラの位置 x,y,z（**y に ~ を付けると地面からの高さ**）")
    ap.add_argument("--at", dest="look", help="見る先 x,y,z（同じく ~ が使える）")
    ap.add_argument("--fov", type=float, default=65)
    ap.add_argument("--size", default="1000x560")
    ap.add_argument("--far", type=float, default=900)
    ap.add_argument("--out", default="shot.png")
    ap.add_argument("--ring", type=int, help="周回して N 枚撮る")
    ap.add_argument("--radius", type=float, default=330)
    ap.add_argument("--height", type=float, default=150)
    args = ap.parse_args()

    d, h, b, pal = load(args.scene)
    lit, dark = shading(h)
    W, Hp = (int(v) for v in args.size.lower().split("x"))
    f = d["field"]
    cx = (f["x1"] + f["x2"]) / 2
    cz = (f["z1"] + f["z2"]) / 2

    def place(text, fallback):
        if text is None:
            return fallback
        parts = text.split(",")
        x = float(parts[0])
        z = float(parts[2])
        y = parts[1].strip()
        if y.startswith("~"):
            return (x, ground(h, d, x, z) + float(y[1:] or 0), z)
        return (x, float(y), z)

    if args.ring:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        for i in range(args.ring):
            a = i / args.ring * math.tau
            cam = (cx + math.cos(a) * args.radius, args.height, cz + math.sin(a) * args.radius)
            out = "%s-%d.png" % (args.out, i)
            render(d, h, b, pal, lit, dark, cam, (cx, 40, cz), args.fov, (W, Hp), args.far, out)
            print("撮った:", out, "から", tuple(round(v) for v in cam))
        return 0

    cam = place(args.cam, (cx - 330, 150, cz + 330))
    look = place(args.look, (cx, 40, cz))
    render(d, h, b, pal, lit, dark, cam, look, args.fov, (W, Hp), args.far, args.out)
    print("撮った:", args.out, "から", tuple(round(v) for v in cam), "→", tuple(round(v) for v in look))
    return 0


if __name__ == "__main__":
    sys.exit(main())
