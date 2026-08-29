"""属性のアイコンを、字として書き出す（`U+E200`〜`U+E204`）。

    python tools/pve-element-glyphs.py worlds/pve/packs/pve

仕様は `worlds/pve/docs/spec/17-element.md` 5-1。

## 作り（2026-08-29 に描き直した）

**白い記号を並べていたが、「アイコンが浮いている」だけに見えた。**

| 直したこと | なぜ |
| --- | --- |
| **色を焼き込む** | 属性は**色で覚える。** 字の色に頼ると、周りの文字色に引きずられる |
| **縁を付ける**（濃い色） | **明るい背景でも沈まない。** 形が締まる |
| **芯に明るい色** | 平らな塗りは**印刷物のように見える。** 光沢を 1 段入れる |
| **文字の高さに合わせる** | 枡いっぱいに描くと**文字より大きく**なる。行が揃わない |

**色を焼き込んだので、出すときは `§f`（白）を前に置く**——
色記号を掛けると、焼いた色が濁る。

| 表全体 | **512x512**（枡 **32x32**） |
| --- | --- |
| 描き方 | **8 倍で描いてから縮める** |
"""

import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
OUT = os.path.join(ROOT, "resource_packs", "pve", "font", "glyph_E2.png")

CELL = 32
SUP = 8
SHEET = Image.new("RGBA", (CELL * 16, CELL * 16), (0, 0, 0, 0))

# 枡の中で、絵を置く範囲（上端・下端）。
#
# **文字より小さく。** 塗りつぶした絵は、線でできた文字より**重く見える**——
# 同じ高さにすると大きすぎた（2026-08-29 に 1/2 の高さ＝1/4 の面積へ）。
#
# ## 縦の位置
#
# 枡は**丸ごと 1 文字ぶん**として描かれる。**枡の中で下に置けば、下にずれる。**
# バニラの字は、だいたい**枡の 0.12〜0.80**（足元が 0.80 あたり）に収まっている。
#
# **下端を足元より上に置き、字の真ん中あたりに重ねる**——
# 下寄せにしたら**沈んで見えた**（2026-08-29 の直し）。
# **文字の 4 割ほど**（2026-08-29）。0.20 まで下げたら、形が潰れて読めなくなった
HEIGHT = 0.28
# 0.47/0.50 は浮き、0.55 は沈んだ。**その間**（枡 32px で 1px の話）
CENTER = 0.525
TOP, BOTTOM = CENTER - HEIGHT / 2, CENTER + HEIGHT / 2


def shade(rgb, k):
    return tuple(max(0, min(255, round(c * k))) for c in rgb) + (255,)


def draw_cell(idx: int, fn, color) -> None:
    """**縁 → 本体 → 芯** の順に重ねる"""
    S = CELL * SUP
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # 縁（濃い色）を、少し大きく描いてから本体を重ねる
    edge = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fn(ImageDraw.Draw(edge), S, shade(color, 0.35), shade(color, 0.35), True)
    img.alpha_composite(edge)

    body = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fn(ImageDraw.Draw(body), S, color + (255,), shade(color, 1.35), False)
    img.alpha_composite(body)

    # 文字の高さへ収める
    h = int(S * (BOTTOM - TOP))
    small = img.resize((int(CELL * (BOTTOM - TOP)), int(CELL * (BOTTOM - TOP))), Image.LANCZOS)
    x = (CELL - small.width) // 2
    y = int(CELL * TOP)
    SHEET.alpha_composite(small, ((idx % 16) * CELL + x, (idx // 16) * CELL + y))
    del h


def water(d, S, c, hi, edge):
    """しずく"""
    g = S * 0.05 if edge else 0
    d.ellipse([S * 0.18 - g, S * 0.40 - g, S * 0.82 + g, S * 0.98 + g], fill=c)
    d.polygon([(S * 0.5, S * 0.02 - g), (S * 0.82 + g, S * 0.60), (S * 0.18 - g, S * 0.60)], fill=c)
    if edge:
        return
    # 芯の光
    d.ellipse([S * 0.30, S * 0.58, S * 0.46, S * 0.82], fill=hi)


def thunder(d, S, c, hi, edge):
    """稲妻"""
    g = S * 0.055 if edge else 0
    pts = [(S * 0.68, S * 0.00), (S * 0.20, S * 0.56), (S * 0.46, S * 0.56),
           (S * 0.32, S * 1.00), (S * 0.84, S * 0.40), (S * 0.56, S * 0.40)]
    if edge:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        pts = [(cx + (x - cx) * 1.12, cy + (y - cy) * 1.12) for x, y in pts]
    d.polygon(pts, fill=c)
    if edge:
        return
    d.polygon([(S * 0.60, S * 0.12), (S * 0.36, S * 0.50), (S * 0.48, S * 0.50),
               (S * 0.44, S * 0.72), (S * 0.68, S * 0.40), (S * 0.56, S * 0.40)], fill=hi)


def fire(d, S, c, hi, edge):
    """炎。**先が細く、根が広い。** 左右で高さを変えて揺らぎを出す"""
    g = S * 0.05 if edge else 0
    d.polygon([(S * 0.52, S * 0.00 - g),          # 先
               (S * 0.70 + g, S * 0.26),
               (S * 0.72 + g, S * 0.46),
               (S * 0.86 + g, S * 0.66),          # 右の張り出し
               (S * 0.78, S * 0.88),
               (S * 0.50, S * 1.00 + g),          # 根
               (S * 0.22, S * 0.88),
               (S * 0.14 - g, S * 0.64),
               (S * 0.30, S * 0.52),
               (S * 0.34, S * 0.30)], fill=c)
    if edge:
        return
    # **内炎は下寄りに小さく。** 中央に大きく置くと玉ねぎに見える
    d.polygon([(S * 0.50, S * 0.52), (S * 0.64, S * 0.74), (S * 0.50, S * 0.92),
               (S * 0.36, S * 0.74)], fill=hi)


def wind(d, S, c, hi, edge):
    """風。**渦。** 流れが 1 点へ巻き込まれていく形にする"""
    t = int(S * (0.15 if edge else 0.105))
    # 外から内へ、半径を落としながら回す
    cx, cy = S * 0.54, S * 0.50
    steps = 130
    pts = []
    for i in range(steps):
        u = i / (steps - 1)
        a = math.radians(200 + u * 460)          # 1 回転と少し
        r = S * (0.46 - 0.34 * u)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r * 0.92))
    d.line(pts, fill=c, width=t, joint="curve")
    # 巻き込まれる流れ（左から）
    d.line([S * 0.02, S * 0.22, S * 0.42, S * 0.22], fill=c, width=t)
    d.line([S * 0.04, S * 0.80, S * 0.40, S * 0.80], fill=c, width=t)
    for x, y in [(0.02, 0.22), (0.04, 0.80)]:
        d.ellipse([S * x - t / 2, S * y - t / 2, S * x + t / 2, S * y + t / 2], fill=c)


def ice(d, S, c, hi, edge):
    """雪の結晶"""
    cx = S * 0.5
    r = S * 0.50
    t = int(S * (0.155 if edge else 0.11))
    tb = int(S * (0.115 if edge else 0.075))
    for k in range(3):
        a = math.radians(90 + k * 60)
        dx, dy = math.cos(a) * r, math.sin(a) * r
        d.line([cx - dx, cx - dy, cx + dx, cx + dy], fill=c, width=t)
        for sgn in (1, -1):
            for f in (0.50, 0.84):
                bx, by = cx + dx * f * sgn, cx + dy * f * sgn
                for s2 in (-1, 1):
                    ax = math.radians(90 + k * 60 + s2 * 52)
                    d.line([bx, by, bx + math.cos(ax) * r * 0.26 * sgn, by + math.sin(ax) * r * 0.26 * sgn],
                           fill=c, width=tb)
    if edge:
        return
    d.ellipse([cx - S * 0.10, cx - S * 0.10, cx + S * 0.10, cx + S * 0.10], fill=hi)


ICONS = [
    (water, (74, 158, 255)),    # 水：青
    (thunder, (255, 214, 59)),  # 雷：黄
    (fire, (255, 106, 42)),     # 火：橙
    (wind, (110, 226, 140)),    # 風：緑
    (ice, (150, 226, 255)),     # 氷：水色
]

for i, (fn, col) in enumerate(ICONS):
    draw_cell(i, fn, col)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
SHEET.save(OUT)
print(f"書いた: {OUT}  {SHEET.size}（枡 {CELL}x{CELL}）")
