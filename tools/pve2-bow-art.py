"""PVE v2 の弓の絵を描く（**64x64・1 枚**）。

    python tools/pve2-bow-art.py worlds/pve-v2/packs/pve_v2

仕様は `worlds/pve-v2/docs/spec/10-bow.md` 3 章。

## 姿（2026-08-30 決定）

**濃い木の弓に白い布を巻き、節々から色とりどりの羽根が生えている。**

| | |
| --- | --- |
| 弓身 | **濃い木**（縁・地・光の 3 色） |
| 巻き | **白い布**を 3 か所（握りと、その上下） |
| 先端 | **黒い口金** |
| 弦 | **細い銀** |
| 羽根 | **7 色**を、両端と巻きの所から扇状に |

> **参考にしたのは `worlds/pve-v2/user/` に置かれた画像**（よそのゲームの弓）。
> **色づかいと「羽根が生えている」という方向だけを取り、絵はここで描き起こす。**

## v1 と違うところ

**引く動きが要らなくなった**（2026-08-30 決定）。

| | v1 | v2 |
| --- | --- | --- |
| 枚数 | 4（構え・引き 0/1/2） | **1 枚だけ** |
| 段の意味 | ため具合 | **無し。** 持っている間ずっと**引き絞った姿** |
| つがえた矢 | 描いていた | **描かない**（撃っていなくても刺さって見える） |

**立体の模型は作らない**——絵 1 枚から起こす（`tools/pve2-bow-rig.py`）。

## 描き方（v1 から引き継ぐ）

| | |
| --- | --- |
| 形 | **バニラと同じ並び**（左下から右上へ弧・弦） |
| 描き方 | **1 画素ずつ置く。** ぼかさない——にじむと弓に見えない |
| 影 | **3 色**（縁・地・光）。**縁を必ず入れる**——輪郭が無いと沈む |
| 角度と大きさ | **変えない**（持ち姿がぶれる） |
"""

import math
import os
import sys

from PIL import Image

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve-v2/packs/pve_v2"
OUT = os.path.join(ROOT, "resource_packs", "pve_v2", "textures", "items")
os.makedirs(OUT, exist_ok=True)

S = 64

# 弓の両端（0〜1）。**バニラの弦の端に合わせてある**
A = (0.22, 0.82)
B = (0.82, 0.22)

# **1 枚だけ。** 弧のふくらみ・弦の引き（`docs/spec/10-bow.md` 3-2）
FRAMES = [
    #  名前     弧     弦の引き
    ("bow", 0.46, 0.17),
]

# 弓 1 本ぶんの色。**1 本しかないので、ここが顔になる**
#
# **濃い木に白い布。** 弓身を抑えて、羽根の色を立たせる
COLOR = {
    "edge": (28, 18, 12, 255),
    "body": (104, 66, 40, 255),
    "light": (146, 100, 60, 255),
    "wrap": (240, 238, 232, 255),
    "wrapEdge": (150, 146, 138, 255),
    "wrapShade": (190, 186, 178, 255),
    "cap": (58, 40, 26, 255),
    "string": (206, 212, 222, 255),
}

# 羽根の色。**7 色を順に**——隣り合う羽根で色を変える
PLUME = [
    (226, 62, 62, 255),
    (244, 140, 44, 255),
    (248, 214, 66, 255),
    (86, 196, 92, 255),
    (72, 200, 210, 255),
    (78, 118, 226, 255),
    (196, 92, 214, 255),
]

# 形（v1 の「反り返り」に近い。**先が跳ねると弓らしく見える**）
WIDTH = 5.6
TAPER = 2.6
GRIP = 3.6

# 布を巻く位置（弧の上の 0〜1）。**握りと、その上下**
WRAPS = (0.22, 0.5, 0.78)


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


def limb(bend):
    ax, ay = A[0] * S, A[1] * S
    bx, by = B[0] * S, B[1] * S
    mx, my = (ax + bx) / 2, (ay + by) / 2
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln, dx / ln
    if nx > 0:
        nx, ny = -nx, -ny
    return [bezier((ax, ay), (mx + nx * bend * S, my + ny * bend * S), (bx, by), i / 96) for i in range(97)]


def tangent(pts, i):
    """その点で弓身が進む向き（正規化）"""
    a = pts[max(0, i - 2)]
    b = pts[min(len(pts) - 1, i + 2)]
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy) or 1.0
    return dx / ln, dy / ln


def plume(cv, x, y, ang, length, color):
    """羽根 1 枚。**縁を先に置いてから色を載せる**"""
    dx, dy = math.cos(ang), math.sin(ang)
    steps = int(length * 2) + 1
    for i in range(steps + 1):
        t = i / steps
        cv.disc(x + dx * length * t, y + dy * length * t, 1.3, COLOR["edge"])
    for i in range(steps + 1):
        t = i / steps
        # **根元は細く、先で少し太る**
        cv.disc(x + dx * length * t, y + dy * length * t, 0.3 + 0.8 * t, color)


def fan(cv, x, y, ang, count, length, seed):
    """羽根の束。**角度も長さも 1 枚ずつずらす**——揃うと櫛に見える"""
    for k in range(count):
        t = (k / (count - 1) - 0.5) if count > 1 else 0.0
        a = ang + t * 1.6
        ln = length * (0.70 + 0.30 * math.cos(t * 2.4))
        plume(cv, x, y, a, ln, PLUME[(seed + k) % len(PLUME)])


def wrap(cv, pts, i, half):
    """布を 1 か所巻く。**弓身と直交する帯**"""
    tx, ty = tangent(pts, i)
    nx, ny = -ty, tx
    x, y = pts[i]
    for j in (-1.4, -0.7, 0.0, 0.7, 1.4):
        for k in range(-int(half * 2), int(half * 2) + 1):
            u = k / 2
            cv.put(x + tx * j + nx * u, y + ty * j + ny * u,
                   COLOR["wrapEdge"] if abs(j) > 1.2 else COLOR["wrap"])
    for k in range(-int(half * 2), int(half * 2) + 1):
        u = k / 2
        cv.put(x + tx * 1.0 + nx * u, y + ty * 1.0 + ny * u, COLOR["wrapShade"])


def draw(name: str, bend: float, pull: float) -> None:
    cv = Canvas()
    pts = limb(bend)
    n = len(pts)

    # ---- 羽根（**弓身より先に描く**——上に重ねると弓の形が読めない）
    for k, t in enumerate(WRAPS):
        i = int(t * (n - 1))
        x, y = pts[i]
        tx, ty = tangent(pts, i)
        nx, ny = -ty, tx
        if nx < 0:  # 弧の外側へ生やす
            nx, ny = -nx, -ny
        fan(cv, x, y, math.atan2(ny, nx), 5, 8.5, k * 2)

    for i, seed in ((0, 1), (n - 1, 4)):
        x, y = pts[i]
        tx, ty = tangent(pts, i)
        d = 1 if i == n - 1 else -1
        fan(cv, x, y, math.atan2(ty * d, tx * d), 6, 10.0, seed)

    # ---- 弓身（縁 → 地 → 光）
    for layer in ("edge", "body", "light"):
        for i, (x, y) in enumerate(pts):
            t = abs(i / (n - 1) - 0.5) * 2
            w = WIDTH - TAPER * (t**1.6)
            if layer == "edge":
                cv.disc(x, y, w / 2 + 0.9, COLOR["edge"])
            elif layer == "body":
                cv.disc(x, y, w / 2, COLOR["body"])
            elif w >= 2.2:
                cv.disc(x - 0.8, y - 0.8, w / 2 - 1.2, COLOR["light"])

    # ---- 先端（黒い口金）
    for i in (0, n - 1):
        x, y = pts[i]
        cv.disc(x, y, 2.6, COLOR["edge"])
        cv.disc(x, y, 1.6, COLOR["cap"])

    # ---- 握り（弓身を少し太らせる）
    for i in range(n):
        t = i / (n - 1)
        if not (0.42 <= t <= 0.58):
            continue
        x, y = pts[i]
        cv.disc(x, y, GRIP, COLOR["edge"])
        cv.disc(x, y, GRIP - 0.9, COLOR["body"])

    # ---- 布を巻く（**弓身の上**）
    for t in WRAPS:
        i = int(t * (n - 1))
        wrap(cv, pts, i, 3.4 if abs(t - 0.5) < 0.01 else 2.8)

    # ---- 弦
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy)
    nx, ny = dy / ln, -dx / ln
    if nx < 0:
        nx, ny = -nx, -ny
    px = (ax + bx) / 2 + nx * pull * S
    py = (ay + by) / 2 + ny * pull * S
    for (x0, y0), (x1, y1) in (((ax, ay), (px, py)), ((px, py), (bx, by))):
        steps = int(math.hypot(x1 - x0, y1 - y0) * 2) + 1
        for i in range(steps + 1):
            t = i / steps
            cv.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, COLOR["string"])

    cv.img.save(os.path.join(OUT, f"pve2_bow_{name}.png"))
    print("  ", f"pve2_bow_{name}.png")


def main() -> int:
    for name, bend, pull in FRAMES:
        draw(name, bend, pull)
    print(f"できた（{S}x{S} / {len(FRAMES)} 枚）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
