"""飛竜（ボス用）のモデルと絵を書き出す。

    python tools/pve3-wyvern.py

仕様は `worlds/pve-v3/docs/spec/18-boss-wyvern.md`。

## なぜコードから出すのか

**数字を直して出し直せる。** 目の位置を 1 マス下げる、尻尾を 1 節伸ばす——
**手で JSON を編集すると、UV がずれて絵が破綻する。**
**形と絵を同時に出せば、必ず合う。**

確かめ方:

```
python tools/pve3-wyvern.py
python tools/mc-geo-view.py <geo> <png> --yaw 34 --out out/wyvern/side.png
```

## 書き方の決まり

| | |
| --- | --- |
| **骨** | `bone(名前, 親, 中心, 既定の角度)` |
| **箱** | `cube(骨, 中心からの相対, 大きさ, 色)` |
| **前** | **−z**（Minecraft の実体モデルの決まり） |
| **足元** | **y ＝ 0**。頭の天辺が **y ＝ 64**（＝ 4 マス） |

**箱は必ず「その骨の中心からの相対」で書く。**
そうすると、骨を回したときにどう動くかが読める。
"""

import io
import json
import math
import os

try:
    from PIL import Image
except ImportError:
    Image = None

RP = os.path.join("worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
GEO_OUT = os.path.join(RP, "models", "entity", "wyvern.geo.json")
TEX_OUT = os.path.join(RP, "textures", "entity", "pve3_wyvern.png")

TEX_W, TEX_H = 256, 256

# ---------------------------------------------------------------- 色
PALETTE = {
    "hide": (128, 40, 36),
    "hide_dark": (92, 28, 28),
    "scute": (72, 24, 26),      # 背の板
    "belly": (204, 186, 152),
    "membrane": (158, 70, 64),
    "horn": (46, 42, 46),
    "claw": (32, 30, 32),
    "tooth": (226, 219, 200),
    "eye": (214, 152, 40),
    "pupil": (18, 14, 12),
    "maw": (86, 34, 40),        # 口の中
}

BONES = []      # (name, parent, pivot, rot)
CUBES = []      # (bone, rel_origin, size, skin)


def bone(name, parent, pivot, rot=(0, 0, 0)):
    BONES.append((name, parent, tuple(pivot), tuple(rot)))
    return name


def cube(b, rel, size, skin, feature=None):
    """箱を 1 つ置く。

    `feature` は**絵の描き方の指定**。`"eye_side"` なら、
    その箱の東西の面に**目を描く**（箱で出っ張らせない）。
    """
    CUBES.append({"bone": b, "rel": list(rel), "size": list(size), "skin": skin, "feature": feature})


# ================================================================ 骨組み
#
#  root
#  └ body ─ chest ─ neck1 ─ neck2 ─ neck3 ─ head ─ jaw / horn_l / horn_r
#     │        ├ wing_l ─ wing_l_fore ─ wing_l_tip
#     │        └ wing_r ─ wing_r_fore ─ wing_r_tip
#     ├ leg_l ─ shin_l ─ foot_l
#     ├ leg_r ─ shin_r ─ foot_r
#     └ tail1 ─ tail2 ─ tail3 ─ tail4 ─ tail5

HIP_Y = 38

bone("root", None, (0, 0, 0))
bone("body", "root", (0, HIP_Y, 6))
bone("chest", "body", (0, HIP_Y + 4, -8), (-8, 0, 0))

# ---- 首は 3 節。**既定の角度で S 字にする**
bone("neck1", "chest", (0, 50, -16), (46, 0, 0))
bone("neck2", "neck1", (0, 50, -28), (-26, 0, 0))
bone("neck3", "neck2", (0, 50, -38), (-26, 0, 0))
bone("head", "neck3", (0, 50, -46), (-6, 0, 0))
bone("jaw", "head", (0, 45.4, -59), (0, 0, 0))
bone("horn_l", "head", (-5, 57, -44), (-14, -30, -16))
bone("horn_r", "head", (5, 57, -44), (-14, 30, 16))
# **目は骨にしない。頭蓋の側面に描く**（`docs/spec/18-boss-wyvern.md` 4-2）

# ---- 翼は 3 節。**半開き**（畳むと膜が見えず、広げると邪魔になる）
for side, sx in (("l", -1), ("r", 1)):
    # **大きく広げる**（2026-09-05）。畳むと背中に貼り付いて見えた
    bone(f"wing_{side}", "chest", (sx * 11, 52, -10), (0, -sx * 10, sx * 20))
    bone(f"wing_{side}_fore", f"wing_{side}", (sx * 29, 52, -10), (0, -sx * 22, -sx * 14))
    bone(f"wing_{side}_tip", f"wing_{side}_fore", (sx * 49, 52, -10), (0, -sx * 16, -sx * 10))

# ---- 後脚は 3 節。**趾行**（かかとが浮いた形）
for side, sx in (("l", -1), ("r", 1)):
    bone(f"leg_{side}", "body", (sx * 10, HIP_Y, 4), (18, 0, 0))
    bone(f"shin_{side}", f"leg_{side}", (sx * 10, HIP_Y - 18, 4), (-38, 0, 0))
    bone(f"foot_{side}", f"shin_{side}", (sx * 10, HIP_Y - 36, 4), (20, 0, 0))

# ---- 尾は 5 節。**根元ほど太く、先に棘**
bone("tail1", "body", (0, HIP_Y + 1, 16), (-7, 0, 0))
bone("tail2", "tail1", (0, HIP_Y + 1, 30), (-1, 0, 0))
bone("tail3", "tail2", (0, HIP_Y + 1, 43), (5, 0, 0))
bone("tail4", "tail3", (0, HIP_Y + 1, 55), (8, 0, 0))
bone("tail5", "tail4", (0, HIP_Y + 1, 66), (9, 0, 0))

# ================================================================ 肉付け

# ---- 胴（腰 → 胸）。**太くする**（細いと蛇に見える）
cube("body", (-13, -9, -6), (26, 19, 15), "hide")          # 腰
cube("body", (-12.5, -8, -19), (25, 20, 14), "hide")       # 胴
cube("body", (-9.5, -10.4, -18), (19, 2.4, 26), "belly")   # 腹板（下面だけ）
cube("chest", (-13.5, -10, -13), (27, 22, 17), "hide")     # 胸
cube("chest", (-10, -11.4, -11), (20, 2.4, 14), "belly")
cube("chest", (-12, -11, -4), (24, 8, 8), "hide")          # 肩の張り

# ---- 背の板。**横から見たときの輪郭を作る**
for i, (z, h, w) in enumerate(((-16, 6, 3.5), (-8, 7, 3.5), (0, 6, 3), (8, 5, 2.5))):
    cube("body", (-w / 2, 9.5, z), (w, h, 5), "scute")
cube("chest", (-2, 11.5, -12), (4, 6, 8), "scute")

# ---- 首。**節ごとに細くするが、根元は太く**
cube("neck1", (-7.5, -7.5, -15), (15, 16, 17), "hide")
cube("neck1", (-2, 7.5, -13), (4, 5, 13), "scute")
cube("neck2", (-6.8, -7, -14), (13.6, 15, 16), "hide")
cube("neck2", (-1.8, 7, -12), (3.6, 4.5, 12), "scute")
cube("neck3", (-6, -6.4, -14), (12, 13.5, 17), "hide")
cube("neck3", (-4.2, -7.4, -12), (8.4, 2, 13), "belly")

# ---- 頭。**バニラの竜の作りに倣う**（`docs/spec/18-boss-wyvern.md` 3 章）
#
#   頭蓋（大きい塊） ─ 鼻面（**平たくて広い**） ─ 下あご（鼻面と同じ幅）
#
# **鼻面を高くすると、竜ではなく蜥蜴になる。** 段差で顔を作る。
cube("head", (-6.5, -5, -14), (13, 14, 16), "hide", feature="eye_side")   # 頭蓋
cube("head", (-7, -4, -5), (14, 11, 9), "hide")                            # 頬
cube("head", (-5, -4.6, -29), (10, 4.4, 16), "hide")                       # 鼻面（平たい）
cube("head", (-5.6, -4.8, -17), (11.2, 7.5, 6), "hide")                    # 鼻面の付け根（段差を埋める）
cube("head", (-3.2, -0.9, -29), (6.4, 1.2, 14), "hide_dark")               # 鼻梁
cube("head", (-4.4, -4.8, -28), (8.8, 1.2, 15), "maw")                     # 口の中（上）

for sx in (-1, 1):
    # **鼻孔の膨らみ**。先端の上に小さく
    cube("head", (sx * 3.4 - (2.2 if sx > 0 else 0), -0.4, -28), (2.2, 1.8, 4.5), "horn")
    # **眉の板**。**頭蓋の上に載せる**——側面に出すと、描いた目を隠す
    cube("head", (sx * 6.4 - (3.4 if sx > 0 else 0), 8.2, -16), (3.4, 2.6, 13), "horn")
    cube("head", (sx * 6.4 - (3.4 if sx > 0 else 0), 6.4, -17), (3.4, 2, 7), "hide_dark")
    # **頬の棘**
    cube("head", (sx * 6.4 - (2.6 if sx > 0 else 0), -2.5, -1), (2.6, 2.6, 8), "horn")
    # **顎の関節**
    cube("head", (sx * 6.2 - (2.4 if sx > 0 else 0), -4.4, -3), (2.4, 4.5, 6), "hide")

# ---- 冠。**後頭部に立てる板**（バニラの角より大きく、こちらの意匠）
for x0, w, h, z in (
    (-2.0, 4.0, 9, -6),
    (-6.2, 3.4, 7, -5),
    (2.8, 3.4, 7, -5),
    (-9.6, 2.8, 5, -3.5),
    (6.8, 2.8, 5, -3.5),
):
    cube("head", (x0, 8.5, z), (w, h, 3.2), "horn")

# ---- 牙は置かない（2026-09-05 決定）
#
# > **箱で並べると、横から潰れて「白い板」に見えた。**
# > **エンダードラゴンにも牙は 1 本も無い**——口は、鼻面と顎の隙間の線で見せる。

# ---- 下あご。**厚くする**
cube("jaw", (-4.8, -3.6, -14), (9.6, 3.6, 14), "hide")
cube("jaw", (-4.2, -1.0, -13.5), (8.4, 1.1, 13), "maw")
cube("jaw", (-4.1, -4, -13), (8.2, 1, 12), "belly")
# 顎の下の房
cube("jaw", (-2.2, -5.2, -12), (4.4, 1.8, 9), "horn")

# ---- 角。**後ろへ払う 2 本 ＋ 小角**
for name in ("horn_l", "horn_r"):
    cube(name, (-2.1, -2.1, 0), (4.2, 4.2, 12), "horn")
    cube(name, (-1.5, -1.5, 11), (3.0, 3.0, 10), "horn")
    cube(name, (-0.9, -0.9, 20), (1.8, 1.8, 7), "claw")

# ---- 翼。**節ごとに骨 ＋ 後ろへ大きく張る膜**
for side, sx in (("l", -1), ("r", 1)):
    for seg, (length, thick, web, tag) in enumerate(
        (
            (20, 5.0, 28, ""),
            (24, 3.6, 36, "_fore"),
            (26, 2.6, 28, "_tip"),
        )
    ):
        b = f"wing_{side}{tag}"
        x0 = 0 if sx > 0 else -length
        # 腕（前の縁）
        cube(b, (x0, -thick / 2, -3), (length, thick, thick + 2.5), "hide" if seg == 0 else "hide_dark")
        # **膜は 1 枚。** 腕の後ろへ大きく張る
        cube(b, (x0, -0.5, 2.5), (length, 1, web), "membrane")
        # 膜の外側の縁
        cube(b, (x0, -0.7, 2.5 + web - 1), (length, 1.4, 1), "scute")
    # 手首の爪
    wrist = f"wing_{side}_fore"
    cube(wrist, (0 if sx > 0 else -7, 1.4, -10), (7, 2.2, 8), "claw")
    # **胴と腕の間の膜**（肩から脇へ）
    cube(f"wing_{side}", (0 if sx > 0 else -10, -0.5, 2.5), (10, 1, 22), "membrane")

# ---- 後脚。**太く**
for side, sx in (("l", -1), ("r", 1)):
    cube(f"leg_{side}", (-5.6, -12, -8), (11.2, 15, 17), "hide")
    cube(f"leg_{side}", (-4.6, -20, -6.5), (9.2, 10, 13), "hide")
    cube(f"shin_{side}", (-4.2, -18, -5), (8.4, 22, 11), "hide")
    cube(f"foot_{side}", (-5, -4.5, -15), (10, 4.5, 20), "hide")
    for k in (-3.2, 0, 3.2):
        cube(f"foot_{side}", (k - 1.6, -4.5, -21), (3.2, 3.2, 8), "claw")
    cube(f"foot_{side}", (-1.7, -4.5, 4), (3.4, 3.4, 6), "claw")   # 後ろ趾

# ---- 尾。**節ごとに細く、背板を載せる**
for i, (name, w, h, ln) in enumerate(
    (
        ("tail1", 14, 14, 15),
        ("tail2", 12, 12, 14),
        ("tail3", 10, 10, 13),
        ("tail4", 8, 8, 12),
        ("tail5", 6.5, 6.5, 12),
    )
):
    cube(name, (-w / 2, -h / 2, -1), (w, h, ln), "hide")
    cube(name, (-1.6, h / 2 - 1, 0), (3.2, 4, ln - 2), "scute")
# 先の棘
cube("tail5", (-2.6, -2.6, 10), (5.2, 5.2, 10), "horn")
for sx in (-1, 1):
    cube("tail5", (sx * 2.6 - (6 if sx > 0 else 0), -1.6, 9), (6, 3.2, 9), "claw")

# ================================================================ UV
#
# **面ごとの UV を使う。**
#
# > ### 箱 UV では、1 マス ＝ 1 画素しか使えない
# >
# > **目や牙をちゃんと描くには、そこだけ画素を増やしたい。**
# > 面ごとに場所と大きさを書けば、**部位ごとに解像度を変えられる。**

# 部位ごとの「1 マスあたりの画素数」
SCALE = {
    "eye": 8,
    "tooth": 4,
    "maw": 2,
    "horn": 1,
    "claw": 1,
    "scute": 1,
    "membrane": 1,
    "belly": 1,
    "hide_dark": 1,
    "hide": 1,
}

# 頭まわりは、さらに細かく
# **頭と顎だけ細かく。** 角や爪は形で見せるので、絵は粗くてよい
FINE_BONES = {"head", "jaw"}


def scale_of(c):
    s = SCALE.get(c["skin"], 2)
    if c["bone"] in FINE_BONES:
        s = max(s, 6)
    return s


def face_rects(u, v, dx, dy, dz, s):
    """面ごとの (x, y, w, h)。**箱を開いた並びは Blockbench と同じ**"""
    return {
        "up": (u + dz * s, v, dx * s, dz * s),
        "down": (u + (dz + dx) * s, v, dx * s, dz * s),
        "east": (u, v + dz * s, dz * s, dy * s),
        "north": (u + dz * s, v + dz * s, dx * s, dy * s),
        "west": (u + (dz + dx) * s, v + dz * s, dz * s, dy * s),
        "south": (u + (dz + dx + dz) * s, v + dz * s, dx * s, dy * s),
    }


class Shelf:
    """棚に並べるだけの、素朴な詰め方"""

    def __init__(self, width):
        self.width = width
        self.x = 0
        self.y = 0
        self.shelf_h = 0
        self.max_y = 0

    def place(self, w, h):
        if self.x + w > self.width:
            self.x = 0
            self.y += self.shelf_h + 2
            self.shelf_h = 0
        pos = (self.x, self.y)
        self.x += w + 2
        self.shelf_h = max(self.shelf_h, h)
        self.max_y = max(self.max_y, self.y + h)
        return pos


def next_pow2(n):
    p = 64
    while p < n:
        p *= 2
    return p


def build(width):
    pivots = {name: p for name, _, p, _ in BONES}
    shelf = Shelf(width)
    bones = {}
    for name, parent, pivot, rot in BONES:
        b = {"name": name, "pivot": list(pivot)}
        if parent is not None:
            b["parent"] = parent
        if rot != (0, 0, 0):
            b["rotation"] = list(rot)
        b["cubes"] = []
        bones[name] = b

    placed = []
    for c in CUBES:
        dx, dy, dz = c["size"]
        s = scale_of(c)
        uw = int(math.ceil(2 * (dx + dz) * s))
        uh = int(math.ceil((dy + dz) * s))
        ux, uy = shelf.place(uw, uh)
        rects = face_rects(ux, uy, dx, dy, dz, s)
        px, py, pz = pivots[c["bone"]]
        rx, ry, rz = c["rel"]
        bones[c["bone"]]["cubes"].append(
            {
                "origin": [px + rx, py + ry, pz + rz],
                "size": [dx, dy, dz],
                "uv": {
                    face: {"uv": [round(r[0], 2), round(r[1], 2)], "uv_size": [round(r[2], 2), round(r[3], 2)]}
                    for face, r in rects.items()
                },
            }
        )
        placed.append((c, rects))

    height = next_pow2(shelf.max_y + 2)
    geo = {
        "format_version": "1.16.0",
        "minecraft:geometry": [
            {
                "description": {
                    "identifier": "geometry.pve3_wyvern",
                    "texture_width": width,
                    "texture_height": height,
                    "visible_bounds_width": 10,
                    "visible_bounds_height": 6,
                    "visible_bounds_offset": [0, 2, 0],
                },
                "bones": [bones[name] for name, _, _, _ in BONES],
            }
        ],
    }
    return geo, placed, width, height


# ================================================================ 絵

def noise(x, y, seed=0):
    n = (x * 374761393 + y * 668265263 + seed * 1013904223) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFF) / 255.0


def shade(color, k):
    return tuple(max(0, min(255, int(v * k))) for v in color)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def fill_rect(px, W, H, rect, fn):
    x0, y0, w, h = (int(round(v)) for v in rect)
    for y in range(y0, min(H, y0 + h)):
        for x in range(x0, min(W, x0 + w)):
            u = (x - x0 + 0.5) / max(1, w)
            v = (y - y0 + 0.5) / max(1, h)
            col = fn(u, v, x, y)
            if col is not None:
                px[x, y] = col


def vnoise(x, y, seed=0, size=8.0):
    """**大きなむら。** 升目ごとの値をなめらかにつないだもの"""
    fx, fy = x / size, y / size
    ix, iy = math.floor(fx), math.floor(fy)
    tx, ty = fx - ix, fy - iy
    tx = tx * tx * (3 - 2 * tx)
    ty = ty * ty * (3 - 2 * ty)
    a = noise(ix, iy, seed)
    b = noise(ix + 1, iy, seed)
    c = noise(ix, iy + 1, seed)
    d = noise(ix + 1, iy + 1, seed)
    top = a + (b - a) * tx
    bot = c + (d - c) * tx
    return top + (bot - top) * ty


def scales(base, u, v, x, y, s):
    """うろこ。

    > ### 一定の模様は、うろこに見えない（2026-09-05）
    >
    > 前は**сos と sin の掛け算 ＋ 画素ごとのゆらぎ**だった。
    > **どこを見ても同じ密度・同じ明るさ**なので、**布か紙**に見えていた。
    >
    > **粒を 1 枚ずつ数える。** そのうえで:
    >
    > | | |
    > | --- | --- |
    > | **1 枚ごとに明るさを変える** | ここが効く。**揃っていないこと**がうろこらしさ |
    > | **たまに極端な 1 枚を混ぜる** | 濃い粒・白っぽい粒を 1 割弱 |
    > | **段ごとに半分ずらす** | 煉瓦積み。格子に見せない |
    > | **大きなむら**を重ねる | 日焼け・汚れ。**粒より大きい単位**で濃淡を作る |
    > | **色みもずらす** | 赤寄り／茶寄り。明るさだけだと灰色っぽくなる |
    """
    # ---- 粒 1 枚の大きさ。**横長**にする（爬虫類のうろこは横に広い）
    sw = max(2.0, s * 1.15)
    sh = max(2.0, s * 0.80)
    row = math.floor(y / sh)
    off = sw * 0.5 if row % 2 else 0.0      # **段ごとに半分ずらす**
    colx = math.floor((x + off) / sw)
    fx = (x + off) / sw - colx
    fy = y / sh - row
    d = math.hypot((fx - 0.5) * 2.0, (fy - 0.5) * 2.0)

    # ---- **1 枚ごとの明るさ。** これが「一定じゃない」の中身
    k = 0.84 + 0.32 * noise(colx, row, 11)
    r = noise(colx, row, 29)
    if r > 0.93:
        k *= 1.20        # 白っぽい 1 枚
    elif r < 0.08:
        k *= 0.72        # 濃い 1 枚

    # ---- 粒の縁を落として、形を出す
    k *= 1.0 - 0.24 * min(1.0, max(0.0, (d - 0.45)) / 0.55)
    # ---- 上のふちに光
    if fy < 0.20 and d < 0.95:
        k *= 1.10

    # ---- **大きなむら**（粒より大きい単位）
    k *= 0.84 + 0.32 * vnoise(x, y, 3, max(6.0, s * 7.0))

    out = shade(base, k)
    # ---- **色みもずらす**
    t = (noise(colx, row, 47) - 0.5) * 0.26
    out = mix(out, (168, 44, 26) if t > 0 else (74, 42, 24), abs(t))
    return out


def paint_eye_side(px, W, H, rects, s):
    """**頭蓋の側面に目を描く。**

    > ### 前後がどちらへ向くか（2026-09-05・実測で確定）
    >
    > **u は「箱を開いた順」に進む。** 東 → 北 → 西 → 南 と**箱の周りを一周する**ので、
    > **東の面では u が -Z（前）へ、西の面では +Z（後ろ）へ**進む——**左右で逆。**
    >
    > 以前は東 0.30 ／ 西 0.70 を使っていたが、**これだと左右とも後頭部**に落ちる。

    > ### **粗い升目に置く。ただし箱で囲わない**（2026-09-05）
    >
    > 頭は 1 マス ＝ 6 画素で描いている。**目だけ滑らかに描くと、そこだけ浮く。**
    > **半マス（3 画素）を 1 ドット**として、**7 × 5 ドットの絵**で置く。
    >
    > **外側を囲わない。** 黒でも暗い赤でも、**線を引いた時点で「ここまでが目」に見える。**
    > **縁取りは持たない。** 虹彩を外へ向かって濃くして、**体の色へ溶かすだけ。**

    > ### **浮かせない**ための 4 つ（2026-09-05）
    >
    > 升目に揃えて枠も外したのに、**まだ貼り付けたように見えた。**
    > **体の側にはうろこの濃淡があるのに、目だけが平らだった**のが理由。
    >
    > | | |
    > | --- | --- |
    > | **窪みを掘る** | 目のまわりの**体の絵を、消さずに暗さだけ掛ける。** 上を濃く（眉の影） |
    > | **目にも粒の濃淡を乗せる** | 1 ドットごとに明るさをずらし、ドットの縁を落とす |
    > | **外周は下の絵と混ぜる** | いちばん外の `e` は**塗り替えず、体の絵と混ぜる**。境目が溶ける |
    > | **瞳と光の点だけ塗り切る** | ここがぼやけると目に見えない |
    """
    #   後ろ → 前 の並び。**東の面はこのまま、西の面は左右を返す**
    #   `.` は描かない（体の色のまま）
    #
    # **12 番**（`tools/pve3-eye-sheet.py` の並び）を **10 × 7 に起こしたもの。**
    # **光の点は上の端**、瞳の真上。
    PAT = (
        "..eeeLLeee..",
        ".emooPPoome.",
        "emoooPPooome",
        "emoOOPPOOome",
        "emoooPPooome",
        ".emooPPoome.",
        "..eeeeeeee..",
    )
    COL = {
        # **暗い縁を持たない。** 外周も虹彩の色のまま——**囲うと「ここまでが目」に見える**
        "e": (204, 84, 14),      # 虹彩の外周
        "m": (230, 110, 16),     # 虹彩
        "o": (246, 140, 22),     # 虹彩
        "O": (255, 176, 44),     # 虹彩の芯
        "P": (10, 7, 5),         # 瞳。**縦のスリット**
        "L": (255, 240, 210),    # 光の点。**上の端に 1 つ**
    }
    # **下の絵とどれだけ混ぜるか**（1.0 ＝ 塗り切る）
    SOLID = {"P": 1.0, "L": 1.0, "O": 0.96, "o": 0.90, "m": 0.74, "e": 0.42}

    # **1 ドット ＝ 3 分の 1 マス。** 体の粗さに寄せつつ、形は描ける
    #
    # > 半マス（3 画素）だと粗すぎて、**瞳の太さを選べなかった。**
    # > **上げすぎない**——画素の目が消えると、そこだけ滑らかになって浮く。
    d = max(1, round(s / 3))
    cols, rows = len(PAT[0]), len(PAT)
    FROM_FRONT = 7      # 前の端から何ドット空けるか
    FROM_TOP = 9        # 上の端から何ドット下げるか

    def blend_px(x, y, col, t):
        """下の絵と混ぜて置く"""
        if not (0 <= x < W and 0 <= y < H):
            return
        px[x, y] = col if t >= 1.0 else mix(px[x, y], col, t)

    for face in ("east", "west"):
        x0, y0, w, h = (int(round(v)) for v in rects[face])
        rowsrc = PAT if face == "east" else tuple(r[::-1] for r in PAT)
        # **東は u が前へ進む**ので、前 ＝ 右端。西は逆
        left = x0 + w - (FROM_FRONT + cols) * d if face == "east" else x0 + FROM_FRONT * d
        top = y0 + FROM_TOP * d

        # ---- まず窪みを掘る。**体の絵は消さず、暗さだけ掛ける**
        #
        # **矩形に掛けない。** 目の形に沿わせないと、結局「枠」に見える。
        # **目のドットからの隔たり**で濃さを決め、**2 段で薄れさせる。**
        eye_cells = {
            (rx, ry)
            for ry in range(rows)
            for rx in range(cols)
            if rowsrc[ry][rx] != "."
        }
        for ry in range(-2, rows + 2):
            for rx in range(-2, cols + 2):
                if (rx, ry) in eye_cells:
                    continue
                near = min(
                    (max(abs(rx - ex), abs(ry - ey)) for ex, ey in eye_cells),
                    default=9,
                )
                if near > 2:
                    continue
                above = ry < rows // 2
                # **上をいちばん濃く**（眉の影）。下は浅く（光が回る）
                deep = 0.50 if above else 0.82
                k = deep if near == 1 else (deep + 1.0) / 2
                # **内がわの環には、目の色をほんの少し混ぜる。**
                # 暗くするだけだと「穴」、少し温めると「窪み」に見える
                warm = 0.14 if near == 1 else 0.05
                for dy in range(d):
                    for dx in range(d):
                        x, y = left + rx * d + dx, top + ry * d + dy
                        if 0 <= x < W and 0 <= y < H:
                            px[x, y] = mix(shade(px[x, y], k), COL["e"], warm)

        # ---- 目を置く
        for ry in range(rows):
            for rx in range(cols):
                ch = rowsrc[ry][rx]
                base = COL.get(ch)
                if base is None:
                    continue
                t = SOLID[ch]
                # **1 ドットごとに明るさをずらす。** 平らに見せない
                jitter = 0.92 + 0.16 * noise(rx, ry, 61)
                for dy in range(d):
                    for dx in range(d):
                        x = left + rx * d + dx
                        y = top + ry * d + dy
                        # **体と同じ「大きなむら」を掛ける。**
                        # 同じ光の当たり方をしていれば、別の層に見えない
                        k = jitter * (0.90 + 0.20 * vnoise(x, y, 3, max(6.0, s * 7.0)))
                        # **ドットの縁を落とす。** うろこと同じ扱い
                        if ch not in ("P", "L") and (dx == 0 or dy == 0 or dx == d - 1 or dy == d - 1):
                            k *= 0.94
                        blend_px(x, y, shade(base, k), t)


def paint_tooth(px, W, H, rects):
    """**牙。** 先を白く、根を暗く。縦に筋"""
    for face, rect in rects.items():
        pointing_down = face == "down"

        def fn(u, v, x, y, down=pointing_down):
            if down:
                return shade(PALETTE["tooth"], 1.0)
            t = v
            k = 0.60 + 0.45 * (1 - t)
            if abs(u - 0.5) < 0.08:
                k *= 1.06
            return shade(PALETTE["tooth"], k + 0.05 * noise(x, y, 11))

        fill_rect(px, W, H, rect, fn)


def paint_membrane(px, W, H, rects):
    """**翼膜。** 血管の筋を走らせる"""
    for face, rect in rects.items():

        def fn(u, v, x, y):
            base = PALETTE["membrane"]
            k = 0.92 + 0.14 * noise(x, y, 5)
            # 骨から末端へ、細い筋
            vein = math.sin(u * 26 + math.sin(v * 5) * 2.0)
            if vein > 0.86:
                k *= 0.74
            elif vein > 0.7:
                k *= 0.87
            k *= 1.0 - 0.18 * v
            return shade(base, k)

        fill_rect(px, W, H, rect, fn)


def paint_scute(px, W, H, rects):
    """**背板。** 段になった稜"""
    for face, rect in rects.items():

        def fn(u, v, x, y):
            k = 0.82 + 0.3 * (1 - abs(u - 0.5) * 2)
            if (int(v * 8)) % 2 == 0:
                k *= 0.9
            return shade(PALETTE["scute"], k + 0.06 * noise(x, y, 13))

        fill_rect(px, W, H, rect, fn)


def paint_belly(px, W, H, rects):
    """**腹板。** 横に並んだ帯"""
    for face, rect in rects.items():

        def fn(u, v, x, y):
            band = int(v * 10) % 2
            k = 0.94 + 0.10 * noise(x, y, 17) - 0.08 * band
            return shade(PALETTE["belly"], k)

        fill_rect(px, W, H, rect, fn)


def paint_plain(px, W, H, rects, skin, s):
    base = PALETTE[skin]
    for face, rect in rects.items():
        top = face == "up"

        def fn(u, v, x, y, top=top):
            col = scales(base, u, v, x, y, s)
            # 上面は少し明るく、下面は暗く
            if top:
                col = shade(col, 1.06)
            return col

        fill_rect(px, W, H, rect, fn)


def paint(img, placed, W, H):
    px = img.load()
    for c, rects in placed:
        skin = c["skin"]
        s = scale_of(c)
        if c.get("feature") == "eye_side":
            paint_plain(px, W, H, rects, skin, s)
            paint_eye_side(px, W, H, rects, s)
            continue
        if skin == "tooth":
            paint_tooth(px, W, H, rects)
        elif skin == "membrane":
            paint_membrane(px, W, H, rects)
        elif skin == "scute":
            paint_scute(px, W, H, rects)
        elif skin == "belly":
            paint_belly(px, W, H, rects)
        else:
            paint_plain(px, W, H, rects, skin, s)


def main():
    # **形の正は `.geo.json`**（2026-09-05 決定。`docs/spec/18-boss-wyvern.md` 2 章）。
    # **この道具は「最初の形を出す」ためのもの**で、以後は Blockbench 側で直す。
    # うっかり走らせて手直しを消さないよう、上書きには `--force` を要る。
    import sys

    force = "--force" in sys.argv
    if os.path.exists(GEO_OUT) and not force:
        print("止めた:", GEO_OUT, "は既にある")
        print("  形の正は .geo.json 側。**Blockbench で直すこと**")
        print("  それでも作り直すなら: python tools/pve3-wyvern.py --force")
        return 1

    width = 1024
    geo, placed, W, H = build(width)
    os.makedirs(os.path.dirname(GEO_OUT), exist_ok=True)
    with io.open(GEO_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(geo, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("書いた:", GEO_OUT, f"骨 {len(BONES)} 本 / 箱 {len(CUBES)} 個")

    if Image is None:
        print("  Pillow が無いので絵は出していない")
        return 0
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    paint(img, placed, W, H)
    os.makedirs(os.path.dirname(TEX_OUT), exist_ok=True)
    img.save(TEX_OUT)
    print("書いた:", TEX_OUT, f"{W} x {H}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
