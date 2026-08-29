"""弓の絵を描く（**64x64。バニラの 4 倍**）。**48 本ぶん。**

    python tools/pve-bow-art.py worlds/pve/packs/pve

仕様は `docs/spec/13-bow-view.md` 2 章、一覧は `docs/spec/19-weapons.md`。
**出どころは `tools/pve_weapon_table.py`。**

## 描き分けの決まり

| 変える | 変えない |
| --- | --- |
| **色**（`hue` と `mat` から 3 色の陰影を作る） | **角度**（左下から右上） |
| **形**（弧の張り・太さ・先端・握り） | **大きさ**（枡いっぱいの比） |
| **飾り**（鋲・刻印・宝石・星） | **矢の向き**（弦と直交） |

**角度と大きさを変えると、持ち姿がぶれて別の武器に見える。**

## バニラの塗り替えをやめた（2026-08-29）

**16x16 では、色を替えるくらいしかできなかった。**
**4 倍の細かさなら、弓ごとの作りそのものを描き分けられる。**

| | |
| --- | --- |
| 形 | **バニラと同じ並び**（左下から右上へ弧・弦・引くと矢が出る） |
| 描き方 | **1 画素ずつ置く**（ぼかさない。にじむと弓に見えない） |
| 影 | **3 色**（縁・地・光）。**縁を必ず入れる**——輪郭が無いと沈む |
| 段 | **4 枚**（構え・引き 0/1/2）。**弦が寄り、矢が出て、弓がしなる** |

## 弓ごとの作り

| 弓 | 素材 | 飾り |
| --- | --- | --- |
| 支給された弓 | **木**（革の握り） | 無し |
| 無銘弓 | **鋼**（青みの弦） | 継ぎ目の鋲 |
| 星屑 | **紫の木に金の飾り** | 先端の金具・小さな星 |
"""

import colorsys
import math
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_weapon_table import weapons  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
OUT = os.path.join(ROOT, "resource_packs", "pve", "textures", "items")
os.makedirs(OUT, exist_ok=True)

S = 64  # 一辺（バニラの 4 倍）

# 弓の両端（0〜1）。**左下から右上へ**（バニラと同じ並び）
#
# **バニラの弦の端は 16 画素中の (4,13)〜(13,4)**。それに合わせてある
A = (0.22, 0.82)
B = (0.82, 0.22)

# 段ごとの、弧のふくらみ（**制御点の寄せ幅**）と弦の引き。
#
# ## 弦と木の間はバニラに合わせる（2026-08-29）
#
# **バニラは、弦から木のいちばん外まで一辺の 0.35**（16 画素中 5.7）。
# 二次ベジェの実際のふくらみは**制御点の半分**なので、**0.7 前後**を置く。
#
# > はじめは 0.155（ふくらみ 0.08）で**弓に見えず**、
# > 0.70（同 0.35）にしたら**太りすぎた**。**その間**（2026-08-29）。
BEND = [0.50, 0.47, 0.44, 0.42]
PULL = [0.0, 0.085, 0.135, 0.175]


# 形ごとの癖（`docs/spec/19-weapons.md` 1 章）
SHAPES = {
    #                 太さ  先の細り 弧の増減 握り  先端
    "plain": dict(width=5.4, taper=2.4, bend=1.00, grip=3.4, tip=2.0),
    "recurve": dict(width=5.0, taper=1.6, bend=1.06, grip=3.2, tip=2.8, hook=True),
    "sharp": dict(width=4.6, taper=3.0, bend=0.96, grip=2.8, tip=2.4),
    "thin": dict(width=3.8, taper=2.0, bend=1.02, grip=2.6, tip=1.6),
    "heavy": dict(width=7.0, taper=3.0, bend=0.92, grip=4.4, tip=2.6),
    "long": dict(width=4.8, taper=2.2, bend=1.12, grip=3.0, tip=2.2),
    "split": dict(width=4.4, taper=2.0, bend=1.00, grip=3.4, tip=2.2, split=True),
}

# 素材ごとの色の作り（彩度・明度）: 縁 / 地 / 光
MATERIALS = {
    "wood": ((0.55, 0.22), (0.50, 0.52), (0.38, 0.74)),
    "steel": ((0.30, 0.24), (0.22, 0.62), (0.12, 0.90)),
    "crystal": ((0.55, 0.28), (0.48, 0.68), (0.28, 0.96)),
    "bone": ((0.30, 0.26), (0.16, 0.72), (0.08, 0.95)),
    "dark": ((0.40, 0.12), (0.30, 0.30), (0.20, 0.52)),
}


def rgb(hue, sat, val):
    r, g, b = colorsys.hsv_to_rgb((hue % 360) / 360.0, min(1.0, sat), min(1.0, val))
    return (round(r * 255), round(g * 255), round(b * 255), 255)


def palette(w):
    """1 本ぶんの色。**縁・地・光 ＋ 握り・先端・弦・矢**"""
    edge_sv, body_sv, light_sv = MATERIALS[w["mat"]]
    hue = w["hue"]
    return {
        "edge": rgb(hue, *edge_sv),
        "body": rgb(hue, *body_sv),
        "light": rgb(hue, *light_sv),
        "grip": rgb(hue + 12, edge_sv[0] * 0.9, edge_sv[1] * 1.5),
        "gripLight": rgb(hue + 12, edge_sv[0] * 0.7, edge_sv[1] * 2.6),
        "tip": rgb(hue - 18, 0.25, 0.97),
        "string": rgb(hue, 0.10, 0.95),
        "shaft": rgb(hue, 0.30, 0.72),
        "fletch": rgb(hue + 150, 0.45, 0.92),
        "mark": rgb(hue - 30, 0.55, 0.98),
    }


class Canvas:
    def __init__(self):
        self.img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        self.px = self.img.load()

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < S and 0 <= y < S and c[3] > 0:
            self.px[x, y] = c

    def disc(self, x, y, r, c):
        ri = int(r) + 1
        for dy in range(-ri, ri + 1):
            for dx in range(-ri, ri + 1):
                if dx * dx + dy * dy <= r * r:
                    self.put(x + dx, y + dy, c)


def bezier(p0, p1, p2, t):
    u = 1 - t
    return (
        u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    )


def limb_curve(bend, offset=0.0):
    """弓の弧。**弦の側と反対へふくらむ**

    `offset` は横へのずらし（**二又の弓**で 2 本並べるのに使う）。
    """
    ax, ay = A[0] * S, A[1] * S
    bx, by = B[0] * S, B[1] * S
    mx, my = (ax + bx) / 2, (ay + by) / 2
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln, dx / ln
    if nx > 0:  # 左上へ向ける
        nx, ny = -nx, -ny
    c = (mx + nx * bend * S, my + ny * bend * S)
    pts = [bezier((ax, ay), c, (bx, by), i / 96) for i in range(97)]
    if offset == 0.0:
        return pts
    return [(x + nx * offset, y + ny * offset) for x, y in pts]


NAMES = ["standby", "pulling_0", "pulling_1", "pulling_2"]


def draw_bow(w, stage, twinkle=None):
    """弓 1 枚。**色・形・飾りは一覧から来る**"""
    col = palette(w)
    sh = SHAPES[w["shape"]]
    cv = Canvas()
    pts = limb_curve(BEND[stage] * sh["bend"])
    n = len(pts)

    def width_at(t):
        """先ほど細く。**t は 0（中央）〜1（端）**"""
        return sh["width"] - sh["taper"] * (t ** 1.6)

    # ---- 弓本体（縁 → 地 → 光の順に重ねる）
    strands = [pts]
    scale = 1.0
    if sh.get("split"):
        # **二又。** 細い 2 本を少し離して並べる
        strands = [limb_curve(BEND[stage] * sh["bend"], -1.7), limb_curve(BEND[stage] * sh["bend"], 1.7)]
        scale = 0.62
    for strand in strands:
        for layer in ("edge", "body", "light"):
            for i2, (x, y) in enumerate(strand):
                t = abs(i2 / (n - 1) - 0.5) * 2
                wd = width_at(t) * scale
                if layer == "edge":
                    cv.disc(x, y, wd / 2 + 0.9, col["edge"])
                elif layer == "body":
                    cv.disc(x, y, wd / 2, col["body"])
                elif wd >= 2.2:
                    cv.disc(x - 0.8, y - 0.8, wd / 2 - 1.2, col["light"])

    # ---- 先端
    for i2 in (0, n - 1):
        x, y = pts[i2]
        cv.disc(x, y, sh["tip"], col["edge"])
        cv.disc(x, y, sh["tip"] * 0.6, col["tip"])
        if sh.get("hook"):
            # **反り返り。** 先が外へ跳ねる
            j = 6 if i2 == 0 else n - 7
            hx, hy = pts[j]
            for k in range(1, 5):
                cv.disc(x + (x - hx) * 0.12 * k, y + (y - hy) * 0.12 * k, 1.5, col["edge"])
                cv.disc(x + (x - hx) * 0.12 * k, y + (y - hy) * 0.12 * k, 0.9, col["body"])

    # ---- 握り（中央）
    for i2 in range(n):
        t = i2 / (n - 1)
        if not (0.40 <= t <= 0.60):
            continue
        x, y = pts[i2]
        cv.disc(x, y, sh["grip"], col["edge"])
        cv.disc(x, y, sh["grip"] - 0.8, col["grip"])
        if i2 % 6 < 3:
            cv.disc(x - 0.6, y - 0.6, 1.1, col["gripLight"])

    # ---- 弦（引くほど中央が右下へ寄る）
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy)
    nx, ny = dy / ln, -dx / ln
    if nx < 0:
        nx, ny = -nx, -ny
    px = (ax + bx) / 2 + nx * PULL[stage] * S
    py = (ay + by) / 2 + ny * PULL[stage] * S
    for (x0, y0), (x1, y1) in (((ax, ay), (px, py)), ((px, py), (bx, by))):
        steps = int(math.hypot(x1 - x0, y1 - y0) * 2) + 1
        for i2 in range(steps + 1):
            t = i2 / steps
            cv.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, col["string"])

    # ---- 矢（**引き始めて初めて出す。弦と直交**）
    if stage > 0:
        ux, uy = -nx, -ny
        nockx, nocky = px, py
        tipx, tipy = px + ux * S * 0.68, py + uy * S * 0.68
        steps = int(math.hypot(tipx - nockx, tipy - nocky) * 2) + 1
        for i2 in range(steps + 1):
            t = i2 / steps
            cv.disc(nockx + (tipx - nockx) * t, nocky + (tipy - nocky) * t, 1.7, (44, 34, 24, 255))
        for i2 in range(steps + 1):
            t = i2 / steps
            cv.disc(nockx + (tipx - nockx) * t, nocky + (tipy - nocky) * t, 0.9, col["shaft"])
        # 鏃（三角）
        for i2 in range(9):
            t = i2 / 8
            wdt = 2.6 * (1 - t)
            for k in range(-2, 3):
                cv.disc(tipx - ux * (1 - t) * 6.0 - uy * k * wdt / 2,
                        tipy - uy * (1 - t) * 6.0 + ux * k * wdt / 2, 1.0, (52, 52, 60, 255))
        for i2 in range(9):
            t = i2 / 8
            wdt = 1.7 * (1 - t)
            for k in range(-2, 3):
                cv.put(tipx - ux * (1 - t) * 5.4 - uy * k * wdt / 2,
                       tipy - uy * (1 - t) * 5.4 + ux * k * wdt / 2, (226, 230, 240, 255))
        # 矧（はず側の羽）
        for k in (-1, 1):
            for i2 in range(7):
                cv.disc(nockx - ux * i2 * 0.85 - uy * k * (2.8 - i2 * 0.3),
                        nocky - uy * i2 * 0.85 + ux * k * (2.8 - i2 * 0.3), 1.0, (44, 34, 24, 255))
                cv.put(nockx - ux * i2 * 0.85 - uy * k * (2.4 - i2 * 0.28),
                       nocky - uy * i2 * 0.85 + ux * k * (2.4 - i2 * 0.28), col["fletch"])

    # ---- 飾り（**弧の上に置く。宙に浮かせない**）
    decor = w["decor"]
    if decor != "none":
        spots = {
            "studs": [0.16, 0.34, 0.66, 0.84],
            "runes": [0.26, 0.50, 0.74],
            "gems": [0.30, 0.70],
            "stars": [0.26, 0.50, 0.74],
        }[decor]
        for k, t in enumerate(spots):
            bx_, by_ = pts[int(t * (n - 1))]
            i3 = min(n - 1, int(t * (n - 1)) + 4)
            tx, ty = pts[i3][0] - bx_, pts[i3][1] - by_
            tl = math.hypot(tx, ty) or 1.0
            ox, oy = -ty / tl, tx / tl
            if ox * nx + oy * ny > 0:
                ox, oy = -ox, -oy
            if decor == "studs":
                cv.disc(bx_, by_, 1.6, col["edge"])
                cv.disc(bx_, by_, 0.9, col["tip"])
            elif decor == "runes":
                cv.disc(bx_ + ox * 3.0, by_ + oy * 3.0, 1.2, col["mark"])
                cv.put(bx_ + ox * 4.6, by_ + oy * 4.6, col["mark"])
            elif decor == "gems":
                cv.disc(bx_, by_, 2.2, col["edge"])
                cv.disc(bx_, by_, 1.4, col["mark"])
            else:  # stars：**きらめきで明るさが変わる**
                lift = 1.0 if (twinkle is None or k % 3 == twinkle) else 0.4
                c = col["tip"]
                star = (c[0], c[1], c[2], max(70, min(255, round((150 + stage * 35) * lift))))
                sx, sy = bx_ + ox * 3.4, by_ + oy * 3.4
                for dx2, dy2 in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
                    cv.put(sx + dx2, sy + dy2, star)
    return cv.img


def main():
    made = 0
    for w in weapons():
        for i2, suffix in enumerate(NAMES):
            draw_bow(w, i2).save(os.path.join(OUT, f'pve_bow_{w["key"]}_{suffix}.png'))
            made += 1
        # **光る飾りを持つ弓だけ、きらめきを 2 枚**（`docs/spec/13-bow-view.md` 2-3）
        if w["decor"] in ("stars", "gems"):
            for t in (0, 1):
                draw_bow(w, 0, twinkle=t).save(os.path.join(OUT, f'pve_bow_{w["key"]}_twinkle_{t}.png'))
                made += 1
    print(f"できた（{S}x{S} / {made} 枚 / {len(weapons())} 本）")


if __name__ == "__main__":
    main()
