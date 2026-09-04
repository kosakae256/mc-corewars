"""札ごとのエフェクト（粒と絵）を書き出す。

    python tools/pve2-fx.py worlds/pve-v2/packs/pve_v2

仕様は `worlds/pve-v2/docs/spec/13-feedback.md` 4 章。

## 属性ごとに「顔」を決める

**同じ粒を使い回さない。** 何が起きたか、画面だけで分かるようにする。

| 属性 | 形 | 色 |
| --- | --- | --- |
| **火** | ふくらんで消える塊 | 橙 → 赤 |
| **雷** | 細い光が散る | 黄 → 白 |
| **氷** | ゆっくり落ちる粒 | 水色 → 白 |
| **水** | 上へ昇る雫 | 青 → 空 |
| **風** | 横へ流れる筋 | 薄緑 → 白 |

## 絵は 4 枚だけ

**形は粒の設定（大きさ・速さ・寿命）で作り分ける。**
絵を増やすほど、色を変えたいだけのときに手間が増える。

| 絵 | 使い道 |
| --- | --- |
| `pve2_spark` | 細い光（雷・風） |
| `pve2_flame` | 柔らかい塊（火・水） |
| `pve2_frost` | 六角の粒（氷） |
| `pve2_ring` | 輪（爆ぜる・防ぐ） |
"""

import io
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve-v2/packs/pve_v2"
RP = os.path.join(ROOT, "resource_packs", "pve_v2")

TEX = os.path.join(RP, "textures", "particle")
PAR = os.path.join(RP, "particles")


# ---------------------------------------------------------------- 絵


def spark() -> Image.Image:
    """細い光。**縦に伸ばした芯 ＋ ぼかし**"""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y in range(16):
        t = 1 - abs(y - 8) / 8
        for x in range(16):
            u = 1 - abs(x - 8) / 2.5
            a = max(0.0, t * u)
            if a > 0:
                px[x, y] = (255, 255, 255, int(255 * min(1, a**1.5)))
    return img


def flame() -> Image.Image:
    """柔らかい塊。**中心が濃い円**"""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - 7.5, y - 7.5) / 7.5
            a = max(0.0, 1 - d) ** 1.6
            if a > 0.02:
                px[x, y] = (255, 255, 255, int(255 * a))
    return img


def frost() -> Image.Image:
    """六角の粒。**角が立っていると氷に見える**"""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y in range(16):
        for x in range(16):
            dx, dy = x - 7.5, y - 7.5
            ang = math.atan2(dy, dx)
            r = math.hypot(dx, dy)
            edge = 6.5 * (0.82 + 0.18 * math.cos(6 * ang))
            if r <= edge:
                a = 1 - (r / edge) ** 2
                px[x, y] = (255, 255, 255, int(255 * min(1, a + 0.25)))
    return img


def ring() -> Image.Image:
    """輪。**爆ぜた・防いだ**の合図"""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y in range(16):
        for x in range(16):
            r = math.hypot(x - 7.5, y - 7.5)
            a = max(0.0, 1 - abs(r - 5.8) / 1.8)
            if a > 0.02:
                px[x, y] = (255, 255, 255, int(255 * a))
    return img


def ray() -> Image.Image:
    """**長い光の筋。** 中心が白く、端へ向かって細く消える"""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y in range(16):
        # **横に長い**——真ん中 2 画素が芯
        # **芯を太く、裾の減り方をゆるく**（2026-08-31）——薄く見えたので濃くした
        core = max(0.0, 1 - abs(y - 7.5) / 1.8)
        glow = max(0.0, 1 - abs(y - 7.5) / 3.4) * 0.55
        for x in range(16):
            t = 1 - abs(x - 7.5) / 8
            a = min(1.0, (core + glow) * (t**0.45))
            if a > 0.02:
                px[x, y] = (255, 255, 255, int(255 * a))
    return img



# 当たった瞬間の火花。**コマ送り**（`worlds/pve-v2/user/…gif` を目標に）。
#
# **点を撒くのではなく、1 枚の絵が動く。** 棘が一気に伸びて、細って消える。
# バニラの `flipbook` は**縦に並べた連番**を寿命いっぱいで再生できる。
HIT_FRAMES = 8
HIT_CELL = 64

# コマごとの「伸び・太さ・芯・濃さ」。**2 コマ目が最大**——出た瞬間が一番強い
HIT_LEN = [0.55, 1.00, 0.86, 0.70, 0.55, 0.40, 0.27, 0.15]
HIT_WID = [0.85, 1.00, 0.72, 0.52, 0.38, 0.26, 0.17, 0.10]
HIT_CORE = [0.80, 1.00, 0.66, 0.46, 0.32, 0.20, 0.11, 0.05]
HIT_A = [1.00, 1.00, 1.00, 1.00, 0.95, 0.85, 0.70, 0.45]

# 焼き込む色。**白い芯 → 黄 → 橙**（tint は白のままにして、この色をそのまま出す）
HIT_OUTER = (255, 140, 10)
HIT_INNER = (255, 225, 70)
HIT_CORE_C = (255, 255, 240)


def hit_burst() -> Image.Image:
    """当たった瞬間の火花。**縦に並べた 8 コマ**（1 コマ 32×32）。

    **棘の向きはコマをまたいで同じ**——形が暴れると爆発に見える。
    伸びて縮むのは**長さと太さだけ**。
    """
    rnd = random.Random(7)
    n, cell = HIT_FRAMES, HIT_CELL
    up = 4  # 拡大して描いてから縮める（縁が滑らかになる）
    c = cell * up
    mid = c / 2

    # 棘。**向き・長さの比・太さの比**を先に決めて、全コマで使い回す
    # **片側に寄せる**——均等に生やすと「☆」になってしまう。
    #
    # 当たった方へ弾ける飛沫にしたいので、**扇形に散らし、長さを大きく振る**
    #（短い棘の間から、長い棘が数本だけ突き出る）。
    # **向きは 1 発ごとに回す**（`particle_initial_spin`）ので、同じ形には見えない。
    base = -math.pi / 2
    spikes = []
    for i in range(11):
        spread = (i / 10 - 0.5) * 2  # -1〜1
        ang = base + spread * 1.9 + rnd.uniform(-0.12, 0.12)
        long = rnd.random() ** 2.2  # **たまに長い**（多くは短い）
        spikes.append((ang, 0.35 + 0.65 * long, rnd.uniform(0.35, 1.0)))
    # 飛び散る粒。**棘から離れて先へ行く**
    dots = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0.75, 1.05)) for _ in range(3)]

    sheet = Image.new("RGBA", (cell, cell * n), (0, 0, 0, 0))
    for f in range(n):
        img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ln, wd, cr, al = HIT_LEN[f], HIT_WID[f], HIT_CORE[f], HIT_A[f]

        def spike(ang, length, half, color):
            dx, dy = math.cos(ang), math.sin(ang)
            px, py = -dy * half, dx * half
            d.polygon(
                [
                    (mid + px, mid + py),
                    (mid - px, mid - py),
                    (mid + dx * length, mid + dy * length),
                ],
                fill=color,
            )

        for ang, lr, wr in spikes:
            L = 0.49 * c * ln * lr
            W = 0.030 * c * wd * wr
            spike(ang, L, W, HIT_OUTER)  # 外は橙
            spike(ang, L * 0.72, W * 0.55, HIT_INNER)  # 内は黄

        # 芯。**白く飛ぶ**
        r = 0.085 * c * cr
        if r > 0.5:
            d.ellipse([mid - r, mid - r, mid + r, mid + r], fill=HIT_CORE_C)

        # 飛び散る粒。**進むほど小さく**
        for ang, far in dots:
            t = (f + 1) / n
            dist = 0.5 * c * far * (0.35 + 0.65 * t)
            rr = 0.026 * c * (1 - t) * 1.4
            if rr > 0.5:
                x, y = mid + math.cos(ang) * dist, mid + math.sin(ang) * dist
                d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=HIT_INNER)

        if al < 1.0:
            a = img.getchannel("A").point(lambda v: int(v * al))
            img.putalpha(a)
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (0, f * cell))
    return sheet





def orb() -> Image.Image:
    """光の玉。**白に近い芯 ＋ 橙の縁**（`user/128212844-….png`）。

    **色は絵に焼き込む**——縁だけ橙にしたいので、粒側の単色では出せない。
    """
    n = 32
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    mid = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            r = math.hypot(x - mid, y - mid) / (n / 2)
            if r >= 1.0:
                continue
            # **橙は縁の細い帯だけ**（2026-08-31）——
            # 内側まで橙にすると、**火の玉に見えて画面が橙一色になる。**
            if r < 0.64:  # 芯：ほぼ白
                col, a = (255, 251, 236), 1.0
            elif r < 0.82:  # 内側：わずかに黄
                t = (r - 0.64) / 0.18
                col, a = (255, int(251 - 22 * t), int(236 - 60 * t)), 1.0
            elif r < 0.91:  # 縁：橙（**細い帯**）
                t = (r - 0.82) / 0.09
                col, a = (255, int(229 - 45 * t), int(176 - 80 * t)), 1.0
            else:  # 外：にじんで消える
                t = (r - 0.91) / 0.09
                col, a = (255, 175, 90), (1 - t) ** 1.5
            px[x, y] = (col[0], col[1], col[2], int(255 * a))
    return img


def crescent() -> Image.Image:
    """細い弧。**輪の一部だけが見えているもの**（同じ絵の中にある三日月）"""
    n = 32
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    mid = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            dx, dy = x - mid, y - mid
            r = math.hypot(dx, dy) / (n / 2)
            ring = max(0.0, 1 - abs(r - 0.78) / 0.13)
            if ring <= 0.02:
                continue
            # **片側だけ濃く**——全周だと輪になってしまう
            side = max(0.0, math.cos(math.atan2(dy, dx) - 0.6)) ** 1.1
            a = ring * side
            if a > 0.02:
                px[x, y] = (255, 198, 130, int(255 * min(1.0, a)))
    return img



def flick() -> Image.Image:
    """尾を引く火花。**右が頭（明るい）、左へ細く伸びる尾。**

    **飛ぶ向きに寝かせて使う**（`facing=True`）ので、**横長に描く。**
    頭だけ丸く盛って、**動いている粒に見せる**——点のままでは散らばった星になる。
    """
    n = 16
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    head_x, mid = 11.5, 7.5
    for y in range(n):
        for x in range(n):
            t = x / (n - 1)  # 0 = 尾の先、1 = 頭
            w = 1.0 + 3.2 * (t**2.0)  # 尾は細く、頭は太い
            a = max(0.0, 1 - abs(y - mid) / w) ** 1.2 * (0.12 + 0.88 * (t**1.8))
            d = math.hypot(x - head_x, y - mid)
            a = max(a, max(0.0, 1 - d / 3.6) ** 1.5)  # 頭の丸み
            if a > 0.02:
                px[x, y] = (255, 255, 255, int(255 * min(1.0, a)))
    return img



# 火柱の炎。**業火の一矢のために描いた**（2026-08-31）。
#
# **バニラの炎は借りない**——延焼（ずっと出ているもの）はバニラで足りるが、
# **一発の見せ場は自前で作る。**
#
# `worlds/pve-v2/user/nc90521.jpg` を目標に。**縦長で、細い筋に分かれて立ち上がる。**
#
# | | |
# | --- | --- |
# | 形 | **1 コマ 64×128**（縦長）。**8 コマ**で炎が上へ流れる |
# | 中身 | **白い芯 → 黄 → 橙 → 暗い赤**。色は**絵に焼き込む**（縁だけ赤くしたい） |
# | 細かさ | **ゆらぎを 3 段重ねる**——粗い波で全体を曲げ、細かい波で筋に割る |
BLAZE_FRAMES = 8
BLAZE_W = 64
BLAZE_H = 128


def _noise(rnd, w, h):
    """なめらかな雑音。**格子で乱数を作って、間を補間する**"""
    grid = [[rnd.random() for _ in range(w + 1)] for _ in range(h + 1)]

    def at(x, y):
        # x, y は 0〜1
        fx, fy = x * w, y * h
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        tx = tx * tx * (3 - 2 * tx)
        ty = ty * ty * (3 - 2 * ty)
        a = grid[y0][x0] * (1 - tx) + grid[y0][x0 + 1] * tx
        b = grid[y0 + 1][x0] * (1 - tx) + grid[y0 + 1][x0 + 1] * tx
        return a * (1 - ty) + b * ty

    return at


def blaze() -> Image.Image:
    """炎の舌。**縦に並べた 8 コマ**（1 コマ 64×128）。

    `worlds/pve-v2/user/key-art.gif` の絵柄（青 → 赤に置き換え）。

    | | |
    | --- | --- |
    | **輪郭** | **硬い**。にじませない——切り絵のように、はっきり縁を出す |
    | **色** | **べた塗りの 3 段**（淡黄 → 橙 → 赤）。境目もぼかさない |
    | **形** | **大きくうねる 1 本**。根元が太く、先が片側へ流れる |

    **段は輪郭に沿って内側へ入る**（縁が赤、芯が淡い）——
    細い縞に割るのではなく、**面で塗り分ける**のがこの絵柄。
    """
    n, w, h = BLAZE_FRAMES, BLAZE_W, BLAZE_H
    # 内側から外へ。**淡黄 → 橙 → 赤**
    BANDS = [(255, 246, 186), (255, 166, 38), (228, 52, 20)]
    sheet = Image.new("RGBA", (w, h * n), (0, 0, 0, 0))
    for f in range(n):
        ph = 2 * math.pi * f / n
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        px = img.load()
        for y in range(h):
            v = y / (h - 1)  # 0 = 上、1 = 下
            # **根元がいちばん太く、先へ細る**（両端が尖ると木の葉になる）。
            # 下端だけ丸めて、切り口が出ないようにする。
            t = 1 - v  # 0 = 根元、1 = 先
            width = w * 0.46 * ((1 - t**0.85) ** 0.5)
            if v > 0.92:  # 根元の丸み
                width *= math.sqrt(max(0.0, 1 - ((v - 0.92) / 0.08) ** 2))
            if width < 0.7:
                continue
            # **先ほど片側へ流れる**。ゆっくり揺れる
            sway = (math.sin(ph + t * 2.4) * 0.6 + 0.4 * math.sin(ph * 0.7 + t * 4.0)) * w * 0.3 * (t**1.7)
            cx = w * 0.5 + sway
            for x in range(w):
                d = abs(x - cx) / width
                if d >= 1.0:
                    continue
                # **輪郭からの深さで塗り分ける**（縁が赤、芯が淡い）
                inner = 1.0 - d
                # 先端側は芯が痩せる——細いところは赤いまま
                inner *= 0.4 + 0.6 * (v**0.45)
                band = 0 if inner > 0.58 else 1 if inner > 0.3 else 2
                col = BANDS[band]
                px[x, y] = (col[0], col[1], col[2], 255)
        sheet.paste(img, (0, f * h))
    return sheet


def blaze_flat() -> Image.Image:
    """炎の柱（**切り絵の側**）。`scripts/lib/fx.ts` で `pve2_blaze_flat` に替えれば使える。

    `worlds/pve-v2/user/66f962e5-….jpg`（Unity の作例）の絵柄。

    | | |
    | --- | --- |
    | **輪郭** | **硬い**。にじませない |
    | **色** | **べた塗りの 4 段**（淡黄 → 黄 → 橙 → 赤）。境目もぼかさない |
    | **形** | **尖った舌が束になっている**。1 本ずつ高さと太さが違う |
    """
    n, w, h = BLAZE_FRAMES, BLAZE_W, BLAZE_H
    rnd = random.Random(5)
    tongues = []
    for k in range(7):
        tongues.append(
            (
                (k / 6 - 0.5) * w * 0.34 + rnd.uniform(-1.5, 1.5),
                rnd.uniform(0.62, 1.0),
                rnd.uniform(0.13, 0.22) * w,
                rnd.uniform(0, 2 * math.pi),
                rnd.uniform(0.8, 1.5),
            )
        )
    BANDS = [(255, 252, 214), (255, 214, 66), (255, 138, 20), (222, 44, 18)]
    sheet = Image.new("RGBA", (w, h * n), (0, 0, 0, 0))
    for f in range(n):
        ph = 2 * math.pi * f / n
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        px = img.load()
        for y in range(h):
            v = y / (h - 1)
            for x in range(w):
                best = -1.0
                for tx, th, tw, tp, ts in tongues:
                    top = 1.0 - th
                    if v < top:
                        continue
                    t = (v - top) / max(1e-6, th)
                    width = tw * (t**0.55) * (0.35 + 0.65 * t)
                    sway = math.sin(ph * ts + tp + (1 - t) * 3.0) * w * 0.05 * ((1 - t) ** 1.5)
                    d = abs(x - (w * 0.5 + tx + sway))
                    if d > width:
                        continue
                    inner = 1.0 - d / max(1e-6, width)
                    if inner > best:
                        best = inner
                if best < 0:
                    continue
                band = 0 if best > 0.72 else 1 if best > 0.46 else 2 if best > 0.22 else 3
                col = BANDS[band]
                px[x, y] = (col[0], col[1], col[2], 255)
        sheet.paste(img, (0, f * h))
    return sheet



# 電気。**放電のために描いた**（2026-08-31）。
#
# `worlds/pve-v2/user/lightning-flash-light-thunder-spark-….webp` の絵柄——
# **芯が白く光り、細い枝が四方へ走る球。** 枝は 6 本だけ——**多いと毛玉になる。**
#
# > ### 稲妻（折れ線 1 本）は使わない
# >
# > **1 本の線は「落雷」に見える。** 放電は**枝分かれして広がるもの**なので、
# > **中心から放射状に、細い枝を何本も**出す。
ELEC_FRAMES = 6
ELEC_CELL = 64


def elec() -> Image.Image:
    """電気の球。**縦に並べた 6 コマ**（1 コマ 64×64）。

    **コマごとに枝の形が変わる**ので、置くだけでバチバチと明滅して見える。
    """
    n, cell, up = ELEC_FRAMES, ELEC_CELL, 3
    c = cell * up
    mid = c / 2
    rnd = random.Random(77)
    sheet = Image.new("RGBA", (cell, cell * n), (0, 0, 0, 0))
    for f in range(n):
        img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        # ---- 枝。**中心から外へ、折れながら伸びる**
        # **枝は少なく**（2026-08-31）——多いと毛玉になって、電気に見えない
        branches_n = 6
        for k in range(branches_n):
            ang = k / branches_n * 2 * math.pi + rnd.uniform(-0.3, 0.3)
            reach = c * rnd.uniform(0.22, 0.46)
            steps = 5
            pts = [(mid, mid)]
            x, y, a = mid, mid, ang
            for i in range(steps):
                a += rnd.uniform(-0.5, 0.5)
                r = reach / steps
                x += math.cos(a) * r
                y += math.sin(a) * r
                pts.append((x, y))
            # **外は空色で太く、芯は白く細く**
            d.line(pts, fill=(90, 190, 255, 255), width=max(1, int(up * 1.6)), joint="curve")
            d.line(pts, fill=(230, 250, 255, 255), width=max(1, int(up * 0.7)), joint="curve")
            # **枝分かれ**——途中から短い枝を 1 本
            if rnd.random() < 0.3:
                bi = rnd.randint(1, steps - 1)
                bx, by = pts[bi]
                ba = math.atan2(by - mid, bx - mid) + rnd.uniform(-1.2, 1.2)
                bl = reach * rnd.uniform(0.25, 0.5)
                bp = [(bx, by), (bx + math.cos(ba) * bl, by + math.sin(ba) * bl)]
                d.line(bp, fill=(120, 205, 255, 235), width=max(1, int(up * 0.9)))

        # ---- 芯。**白く光る**（外へにじむ）
        px = img.load()
        for y in range(c):
            for x in range(c):
                r = math.hypot(x - mid, y - mid) / (c * 0.16)
                if r >= 1:
                    continue
                a = (1 - r) ** 1.6
                old = px[x, y]
                v = int(255 * a)
                px[x, y] = (
                    max(old[0], int(200 + 55 * a)),
                    max(old[1], int(235 + 20 * a)),
                    255,
                    max(old[3], v),
                )
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (0, f * cell))
    return sheet



# 弾ける電気。**放電の「当たった側」用**（2026-08-31）。
#
# `worlds/pve-v2/user/nc298050.jpg` の絵柄——**短く折れた筋。白い芯に水色の縁。**
# 電気の球（`pve2_elec`）は**線を引く用**、こちらは**体で弾ける用**と使い分ける。
#
# > ### 枝分かれは「候補を増やす」でやる
# >
# > **粒の中で形を作り直すことはできない**（絵は固定）。
# > **枝の出方が違う 12 種類**を並べておいて、**1 本ごとにどれか 1 つを引く**
# >（`scripts/lib/fx.ts` の `static_body`）。
ARC_FRAMES = 12
ARC_CELL = 64


def boltarc(edge=(90, 190, 250, 255)) -> Image.Image:
    """弾ける電気。**縦に並べた 6 コマ**（1 コマ 64×64）。

    **角ばった折れ線を横切りに 1 本。** 途中から短い枝を 1〜3 本。

    `edge` で**縁の色**を変える——**青は体に纏う電気、黄は地面の帯電。**
    **色は絵に焼き込む**（粒側で染めると、白い芯まで一緒に染まってしまう）。
    **縁を水色で太く、芯を白く細く**——にじませず、はっきり縁を出す。

    > ### 太さは場所で変える
    >
    > 一定の幅で引くと**紐**に見える。**両端を尖らせ、真ん中を太く**すると電気になる。
    > 幅つきの線を引く命令は無いので、**線の左右へ法線方向にずらした点で多角形を作る。**
    """
    n, cell, up = ARC_FRAMES, ARC_CELL, 3
    c = cell * up
    rnd = random.Random(52)

    def stroke(d, pts, wide, color, taper=0.55):
        """太さの変わる線。**両端が尖り、真ん中が太い**"""
        m = len(pts)
        left, right = [], []
        for i2, (x, y) in enumerate(pts):
            t = i2 / (m - 1)
            w = wide * (math.sin(math.pi * t) ** taper) * 0.5 + 0.4
            # 進む向きの法線
            if i2 == 0:
                dx, dy = pts[1][0] - x, pts[1][1] - y
            elif i2 == m - 1:
                dx, dy = x - pts[-2][0], y - pts[-2][1]
            else:
                dx, dy = pts[i2 + 1][0] - pts[i2 - 1][0], pts[i2 + 1][1] - pts[i2 - 1][1]
            ln = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / ln * w, dx / ln * w
            left.append((x + nx, y + ny))
            right.append((x - nx, y - ny))
        d.polygon(left + right[::-1], fill=color)

    sheet = Image.new("RGBA", (cell, cell * n), (0, 0, 0, 0))
    for f in range(n):
        img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)

        # ---- 本体。**左から右へ、角ばって折れながら**
        steps = rnd.randint(4, 6)
        pts = []
        x = c * 0.06
        y = c * rnd.uniform(0.35, 0.65)
        for i2 in range(steps + 1):
            pts.append((x, y))
            x += c * 0.88 / steps
            y += rnd.uniform(-c * 0.22, c * 0.22)
            y = min(c * 0.86, max(c * 0.14, y))

        # ---- 枝。**本体の途中から分かれ、さらに孫枝が出ることもある**
        branches = []
        for _ in range(rnd.randint(1, 3)):
            k = rnd.randint(1, steps - 1)
            bx, by = pts[k]
            ang = rnd.uniform(-1.3, 1.3)
            ln = c * rnd.uniform(0.16, 0.34)
            mx = bx + math.cos(ang) * ln * 0.5
            my = by + math.sin(ang) * ln * 0.5
            ex = mx + math.cos(ang + rnd.uniform(-0.7, 0.7)) * ln * 0.5
            ey = my + math.sin(ang + rnd.uniform(-0.7, 0.7)) * ln * 0.5
            branches.append([(bx, by), (mx, my), (ex, ey)])
            # **孫枝**——枝の途中からもう 1 本
            if rnd.random() < 0.45:
                gx = mx + math.cos(ang + rnd.uniform(-1.4, 1.4)) * ln * 0.45
                gy = my + math.sin(ang + rnd.uniform(-1.4, 1.4)) * ln * 0.45
                branches.append([(mx, my), ((mx + gx) / 2, (my + gy) / 2), (gx, gy)])

        # **縁（水色・太い） → 芯（白・細い）**
        for col, wide in ((edge, up * 5.4), ((255, 255, 255, 255), up * 2.4)):
            stroke(d, pts, wide, col)
            for b in branches:
                stroke(d, b, wide * 0.55, col)
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (0, f * cell))
    return sheet





# 葉と羽。**風の札のために描いた**（2026-08-31）。
#
# | 絵 | どこで |
# | --- | --- |
# | `pve2_leaf` | **疾走射**——当たった敵に散る |
# | `pve2_feather` | **烈風**——発動した人の周りに舞う |
#
# **どちらも 4 種類**を縦に並べる。**1 粒ごとにどれかを引く**（`uv` を乱数で選ぶ）——
# 同じ形が並ぶと模様に見えるため。
LEAF_KINDS = 4
LEAF_CELL = 32


def leaf() -> Image.Image:
    """葉。**縦に並べた 4 種**（1 コマ 32×32）。**緑の濃さを 1 枚ずつ変える**"""
    n, cell, up = LEAF_KINDS, LEAF_CELL, 4
    c = cell * up
    rnd = random.Random(19)
    greens = [(120, 200, 90), (90, 175, 70), (150, 215, 110), (105, 165, 75)]
    sheet = Image.new("RGBA", (cell, cell * n), (0, 0, 0, 0))
    for f in range(n):
        img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        col = greens[f]
        # **木の葉の形**——両端が尖った紡錘。太さと反りを 1 枚ずつ変える
        wide = c * rnd.uniform(0.16, 0.24)
        bend = rnd.uniform(-0.12, 0.12) * c
        left, right = [], []
        for i in range(25):
            t = i / 24
            y = c * 0.1 + t * c * 0.8
            w = wide * (math.sin(math.pi * t) ** 0.7)
            x = c * 0.5 + bend * math.sin(math.pi * t)
            left.append((x - w, y))
            right.append((x + w, y))
        # **少し透ける**（2026-08-31）——不透明だと紙に見える
        d.polygon(left + right[::-1], fill=(col[0], col[1], col[2], 205))
        # **葉脈**——1 本だけ、少し暗く
        d.line([(c * 0.5 + bend * math.sin(math.pi * (i / 12)), c * 0.12 + (i / 12) * c * 0.76) for i in range(13)],
               fill=(int(col[0] * 0.7), int(col[1] * 0.7), int(col[2] * 0.7), 255), width=max(1, int(up * 0.7)))
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (0, f * cell))
    return sheet


def feather() -> Image.Image:
    """羽。**縦に並べた 4 種**（1 コマ 32×32）。

    > ### 面で塗ると葉になる
    >
    > **羽枝を 1 本ずつ引く。** 軸から斜めに、先端へ向かって短い線を何十本も——
    > **その striation こそが羽に見える理由**で、輪郭を塗っただけでは葉にしかならない。
    >
    > **左右で幅を変え、ところどころ羽枝を欠けさせる**（裂け目）。

    | | |
    | --- | --- |
    | 軸 | 斜めに反る。**下 2 割は軸だけ**（付け根） |
    | 羽枝 | **先へ 35 度ほど寝かせて**引く。長さは中ほどが最大 |
    | 裂け目 | 2〜3 か所、羽枝を短くして隙間を作る |
    """
    n, cell, up = LEAF_KINDS, LEAF_CELL, 4
    c = cell * up
    rnd = random.Random(23)
    sheet = Image.new("RGBA", (cell, cell * n), (0, 0, 0, 0))
    for f in range(n):
        img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        lean = rnd.uniform(0.12, 0.3) * (1 if f % 2 == 0 else -1)
        wide = c * rnd.uniform(0.2, 0.26)
        # 裂け目の位置
        splits = [rnd.uniform(0.35, 0.9) for _ in range(rnd.randint(2, 3))]

        def axis(t):
            """軸。**下（t=0）から先（t=1）へ、斜めに反る**"""
            return (c * (0.5 - lean * 0.5) + lean * c * (t**1.3), c * 0.95 - t * c * 0.9)

        def span(t, side):
            """その高さでの羽枝の長さ。**左右で違う**"""
            if t < 0.2:
                return 0.0
            u = (t - 0.2) / 0.8
            w = wide * (math.sin(math.pi * u) ** 0.6) * (0.72 if side < 0 else 1.0)
            for sp in splits:  # **裂け目**
                w *= 1.0 - 0.55 * math.exp(-(((t - sp) / 0.05) ** 2))
            return w

        # ---- 羽枝を 1 本ずつ
        steps = 70
        for i2 in range(steps + 1):
            t = i2 / steps
            ax, ay = axis(t)
            for side in (-1, 1):
                w = span(t, side)
                if w < 1.0:
                    continue
                # **先端へ 35 度ほど寝かせる**
                ex = ax + side * w
                ey = ay - w * 0.7
                v = 236 + rnd.randint(-14, 19)
                d.line([(ax, ay), (ex, ey)], fill=(v, min(255, v + 6), 255, 170), width=max(1, int(up * 0.75)))

        # ---- 軸。**下まで伸びる。羽枝より明るい**
        d.line([axis(i2 / 24) for i2 in range(25)], fill=(255, 255, 255, 225), width=max(1, int(up * 0.85)))
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (0, f * cell))
    return sheet





# 雫。**恵みの雨のために描いた**（2026-08-31）。**4 種を縦に並べる。**
#
# **上が尖り、下がふくらむ**——落ちる向きに合うように。
# 中に**白い光**を入れて、水というより**恵み**に見せる。
DROP_KINDS = 4
DROP_CELL = 32


def droplet() -> Image.Image:
    """雫。**縦に並べた 4 種**（1 コマ 32×32）"""
    n, cell, up = DROP_KINDS, DROP_CELL, 4
    c = cell * up
    rnd = random.Random(41)
    sheet = Image.new("RGBA", (cell, cell * n), (0, 0, 0, 0))
    for f in range(n):
        img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        px = img.load()
        wide = c * rnd.uniform(0.13, 0.2)
        top = c * rnd.uniform(0.1, 0.2)
        for y in range(c):
            t = (y - top) / (c * 0.86 - top)
            if t < 0 or t > 1:
                continue
            # **上が尖り、下がふくらむ**
            w = wide * (math.sin(math.pi * (0.12 + 0.88 * t)) ** 0.8) * (0.35 + 0.65 * t)
            for x in range(c):
                d = abs(x - c * 0.5) / max(1.0, w)
                if d >= 1:
                    continue
                a = (1 - d) ** 0.6
                # **芯は白、外は水色**
                if a > 0.72:
                    col = (250, 254, 255)
                elif a > 0.4:
                    col = (170, 232, 255)
                else:
                    col = (110, 195, 245)
                px[x, y] = (col[0], col[1], col[2], int(235 * min(1.0, a * 1.3)))
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (0, f * cell))
    return sheet



def circle() -> Image.Image:
    """回復の円（64×64）。**外縁はしっかり、中は薄い水色。**

    **範囲を示すためのもの**なので、**縁がはっきりしていることが要。**
    **中は一様に塗りつぶす**（グラデーションにしない）が、**濃さは 16％ だけ**——
    透けて地面が見えるくらいでちょうどよい。
    """
    n = 64
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = img.load()
    mid = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            r = math.hypot(x - mid, y - mid) / (n / 2)
            if r >= 1.0:
                continue
            if r > 0.86:  # **外縁**——白に近い水色で、はっきり
                t = (r - 0.86) / 0.14
                a = 1.0 - (t**2.2) * 0.15
                px[x, y] = (215, 248, 255, int(255 * a))
            elif r > 0.78:  # 縁の内側——にじませて繋ぐ
                t = (r - 0.78) / 0.08
                px[x, y] = (170, 235, 255, int(255 * (0.28 + 0.72 * t)))
            else:  # **中身**——**一様に塗りつぶす。ただしかなり透明**
                px[x, y] = (130, 220, 255, int(255 * 0.16))
    return img



# 氷の破片。**砕氷のために描いた**（2026-08-31）。**4 種を縦に並べる。**
#
# > ### 六角の粒だと雪に見える
# >
# > `pve2_frost` は**丸みのある六角**で、舞う雪の絵。
# > **砕けた氷は角が立っている**——**不揃いな多角形**にして、縁を白く光らせる。
CHIP_KINDS = 4
CHIP_CELL = 32


def icechip() -> Image.Image:
    """氷の破片。**縦に並べた 4 種**（1 コマ 32×32）"""
    n, cell, up = CHIP_KINDS, CHIP_CELL, 4
    c = cell * up
    rnd = random.Random(61)
    sheet = Image.new("RGBA", (cell, cell * n), (0, 0, 0, 0))
    for f in range(n):
        img = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        # **不揃いな多角形**——角の数も半径もばらばら
        k = rnd.randint(4, 6)
        pts = []
        for i2 in range(k):
            a = i2 / k * 2 * math.pi + rnd.uniform(-0.25, 0.25)
            r = c * rnd.uniform(0.2, 0.44)
            pts.append((c * 0.5 + math.cos(a) * r, c * 0.5 + math.sin(a) * r))
        # 中は薄い水色、**縁は白く光る**
        d.polygon(pts, fill=(150, 220, 250, 190))
        d.line(pts + [pts[0]], fill=(240, 252, 255, 245), width=max(1, int(up * 0.9)))
        # **割れ目**——中に 1 本、光る線
        a1, a2 = rnd.sample(range(k), 2)
        d.line([pts[a1], pts[a2]], fill=(225, 245, 255, 170), width=max(1, int(up * 0.5)))
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (0, f * cell))
    return sheet


TEXTURES = {"pve2_spark": spark, "pve2_flame": flame, "pve2_frost": frost, "pve2_ring": ring, "pve2_ray": ray, "pve2_hit_burst": hit_burst, "pve2_orb": orb, "pve2_crescent": crescent, "pve2_flick": flick, "pve2_blaze": blaze, "pve2_blaze_flat": blaze_flat, "pve2_elec": elec, "pve2_boltarc": boltarc, "pve2_boltarc_y": lambda: boltarc((255, 205, 60, 255)), "pve2_leaf": leaf, "pve2_feather": feather, "pve2_droplet": droplet, "pve2_circle": circle, "pve2_icechip": icechip}


# ---------------------------------------------------------------- 粒
#
# name: (絵, 数, 広がり, 初速, 抵抗, 寿命, 大きさ, 色（始→終）, 向きの付け方)

C_FIRE = ((1.0, 0.72, 0.25, 1.0), (0.85, 0.15, 0.05, 0.0))
C_EMBER = ((1.0, 0.55, 0.15, 0.9), (0.4, 0.08, 0.02, 0.0))
# 燃えている炎（白に近い芯 → 橙 → 消える）と、その上の煙
# 炎（**足元は黄色、上へ行くほど橙 → 赤**）と、抜けていく火の粉
C_BURN = ((1.0, 0.88, 0.2, 1.0), (1.0, 0.3, 0.04, 0.0))
C_RISE = ((1.0, 0.42, 0.1, 1.0), (0.85, 0.12, 0.02, 0.0))
C_BOLT = ((1.0, 0.96, 0.6, 1.0), (1.0, 1.0, 1.0, 0.0))
C_ARC = ((0.95, 0.9, 0.35, 1.0), (0.5, 0.75, 1.0, 0.0))
C_ICE = ((0.75, 0.95, 1.0, 1.0), (1.0, 1.0, 1.0, 0.0))
C_DEEP = ((0.45, 0.8, 1.0, 1.0), (0.85, 0.95, 1.0, 0.0))
C_WATER = ((0.35, 0.75, 1.0, 1.0), (0.8, 0.95, 1.0, 0.0))
C_HEAL = ((0.55, 1.0, 0.7, 1.0), (0.9, 1.0, 0.85, 0.0))
C_WIND = ((0.8, 1.0, 0.85, 0.9), (1.0, 1.0, 1.0, 0.0))
# 貫き風の軌跡。**緑**——貫いた矢だけ色が変わる
C_GALE = ((0.55, 1.0, 0.45, 0.9), (0.2, 0.7, 0.25, 0.0))
C_GUARD = ((0.7, 0.85, 1.0, 1.0), (1.0, 1.0, 1.0, 0.0))
C_CRIT = ((1.0, 0.9, 0.35, 1.0), (1.0, 0.5, 0.1, 0.0))
# 閃光は**白から桃**へ、火花は**橙**（`user/show.jpg`）
C_FLASH = ((1.0, 1.0, 1.0, 1.0), (1.0, 0.55, 0.85, 0.0))
C_SPARK = ((1.0, 0.75, 0.3, 1.0), (1.0, 0.35, 0.05, 0.0))
# 通常ヒットの火花。**白っぽく、すぐ消える**
C_HIT = ((1.0, 0.95, 0.8, 1.0), (1.0, 0.7, 0.35, 0.0))
# 小爆発の芯と輪。**大きく出すぶん薄く**（濃いままだと画面を覆う）
C_BOOM = ((1.0, 0.85, 0.5, 0.5), (1.0, 0.35, 0.05, 0.0))
# 小爆発の玉と弧。**焼き込んだ色をそのまま出すが、濃さは 45％まで落とす**
# 足元のきらめき（`docs/spec/15-glow.md`）。**属性の色をそのまま出す**

C_ORB_FIRE = ((1.0, 0.5, 0.14, 1.0), (1.0, 0.32, 0.05, 0.85))
C_ORB_BOLT = ((1.0, 0.94, 0.35, 1.0), (1.0, 0.78, 0.12, 0.85))
C_ORB_WIND = ((0.5, 1.0, 0.45, 1.0), (0.22, 0.85, 0.3, 0.85))
C_ORB_WATER = ((0.32, 0.72, 1.0, 1.0), (0.12, 0.48, 0.95, 0.85))
C_ORB_ICE = ((0.78, 0.97, 1.0, 1.0), (0.52, 0.86, 1.0, 0.85))

C_FAINT = ((1.0, 1.0, 1.0, 0.45), (1.0, 1.0, 1.0, 0.0))
# 小爆発の輪。**橙**（白いと煙の輪に見える）。薄いまま色だけ付ける
C_WAVE = ((1.0, 0.55, 0.12, 0.5), (1.0, 0.25, 0.02, 0.0))
# 電気の線。**1 粒ずつは目立たせない**——濃いと「点の列」に見えて、繋がらない
C_LINK = ((0.75, 0.92, 1.0, 0.45), (0.5, 0.8, 1.0, 0.0))
# **絵に焼き込んだ色をそのまま出す**（連番の火花）。濃さだけ落とす
C_WHITE = ((1.0, 1.0, 1.0, 1.0), (1.0, 1.0, 1.0, 0.0))
# 筋の 4 色（`user/show.jpg`）。**どれが出るかは 1 ヒットごとの抽選**。
#
# **白は入れない**——閃光の芯と見分けが付かない。**濃い色だけ**にする
C_RAY_R = ((1.0, 0.12, 0.18, 1.0), (0.7, 0.0, 0.08, 0.0))
C_RAY_B = ((0.15, 0.35, 1.0, 1.0), (0.0, 0.12, 0.75, 0.0))
C_RAY_P = ((1.0, 0.18, 0.75, 1.0), (0.7, 0.0, 0.45, 0.0))
C_RAY_O = ((1.0, 0.5, 0.05, 1.0), (0.8, 0.22, 0.0, 0.0))

# 筋の寿命。**1 本ごとに散らす**——同じ速さで消えると機械的に見える。
#
# **`math.random` は粒ごとに引き直されない**（1 度だけ評価されることがある）。
# **`variable.particle_random_1` は粒ごとに違う値**なので、そちらを使う。
RAY_LIFE = "0.15 + 0.1 * variable.particle_random_1"

# 筋の大きさ。**1 本ごとに 1.0〜1.5 倍**（2026-08-31）——同じ大きさだと判で押したように見える。
#
# **寿命とは別の乱数を使う**（`_1` を使い回すと「長いものほど大きい」と相関してしまう）。
RAY_SIZE = "3.2 * (1 + 0.5 * variable.particle_random_2)"

# ---------------------------------------------------------------- 量の刻み
#
# **属性値でエフェクトの量が変わる**（`docs/spec/13-feedback.md` 4-2）。
#
# | 属性値 | 出る量 |
# | --- | --- |
# | 0〜4 | 出ない |
# | 5〜9 / 10〜14 / 15〜19 / 20 | 25％ / 50％ / 75％ / 100％ |
#
# **粒の数は JSON に固定で書く**ので、割合では変えられない。
# **ここに書く数は「25％ぶん」**——script（`scripts/lib/fx.ts`）が 1〜4 回出す。

EFFECTS = [
    # 火 ---------------------------------------------------------------
    ("fire_burst", "pve2_flame", 14, 0.5, 3.2, 3.0, 0.45, 0.55, C_FIRE),
    # 火薬矢。**`fire_burst` を広げただけ**（2026-08-31）——見た目はそのまま、**半径 1.5 マス**へ。
    #
    # **`fire_burst` 自体は触らない**（灼熱の渦・帯電・雷鳴の炎でも使っている）。
    # 抵抗 3.0 に対して初速 4.6 なので、**およそ 1.5 マス進んで止まる。**
    ("powder_burst", "pve2_flame", 20, 0.3, 4.6, 3.0, 0.5, 0.55, C_FIRE),
    ("fire_big", "pve2_flame", 30, 0.8, 5.0, 2.6, 0.7, 0.9, C_FIRE),
    ("ember_tick", "pve2_flame", 1, 0.35, 0.9, 2.0, 0.5, 0.28, C_EMBER),
    ("scorch", "pve2_ring", 1, 0.05, 0.2, 1.0, 0.35, 1.1, C_EMBER),
    ("heat", "pve2_flame", 3, 0.3, 0.8, 2.5, 0.35, 0.22, C_FIRE),
    # 火薬矢の小爆発（`scripts/lib/fx.ts` の `powder`）。
    #
    # **煙はバニラ**（`boom_puff`）。ここで作るのは**芯の閃光・飛ぶ火花・衝撃波**。
    # `user/128212844-aeedffcb-9b72-4747-83b9-a98b60f55279.png` を目標に。
    #
    # **光の玉がばらけて散る**——輪でも煙でもない。
    # 玉は**白い芯に橙の縁**（絵に焼き込んである）、それに**細い弧**を少しだけ混ぜる。
    # **一点から出して、急に止める**（2026-08-31）。
    #
    # > ### 撒いてはいけない
    # >
    # > 広い球から出すと、**最初から散らばった状態で現れる**——
    # > **置かれた光**であって、爆発ではない。
    # > **爆発は「一点から出て、外へ行き、急に止まる」動き**で見える。
    #
    # 出る場所はほぼ 1 点（半径 0.12）。**速さは 1 粒ごとに 5〜14 とばらばら**で、
    # **抵抗 7.0** が効いて 0.2 秒ほどで止まる——**近くと遠くに散り、間隔が空く。**
    ("boom_orb", "pve2_orb", 3, 0.12, "5 + 9 * variable.particle_random_3", 7.0, "0.2 + 0.15 * variable.particle_random_1", "0.22 * (1 + 1.7 * variable.particle_random_2)", C_FAINT, "flat", False, "particles_add", 0.3),
    ("boom_arc", "pve2_crescent", 9, 0.12, "4 + 10 * variable.particle_random_3", 7.0, "0.19 + 0.14 * variable.particle_random_1", "0.26 * (1 + 1.2 * variable.particle_random_2)", C_FAINT, "flat", False, "particles_add", 0.3, None, True),
    ("boom_ring", "pve2_ring", 1, 0.05, 0.0, 0.0, 0.3, 4.2, C_BOOM, True, False, "particles_add", 0.35),
    # 火薬矢の火花（`pve2_flick`）。**一点から弾けて、尾を引いて散る。**
    #
    # | | |
    # | --- | --- |
    # | 向き | **飛ぶ向きに寝かせる**（`facing=True`）——尾が進行方向に伸びる |
    # | 速さ | **1 粒ごとに 10〜25** のばらばら。抵抗 3.0 なので **3〜8 マス**まで散る |
    # | 量と太さ | **44 本・長さ 0.4〜0.64・潰し 0.6**（2026-08-31 に小さくした。大きいと画面を覆う） |
    # | 落ち方 | **重力 −7**。線香花火のように**垂れて**消える |
    ("powder_spark", "pve2_flick", 11, 0.1, "10 + 15 * variable.particle_random_3", 3.0, "0.35 + 0.35 * variable.particle_random_1", "0.4 * (1 + 0.6 * variable.particle_random_2)", C_SPARK, False, True, "particles_add", 0.45, None, False, {"accel": [0, -7.0, 0], "thin": 0.6}),
    # 芯。**火花が出た瞬間だけ、小さく光る**
    ("powder_flash", "pve2_flame", 1, 0.02, 0.0, 0.0, 0.12, 1.0, C_FAINT, "pulse"),
    # ---- 火花に足すもの（2026-08-31）
    #
    # **跡は残さない。** 残り火・煤のように**後まで漂うものは入れない**——
    # **爆発は一瞬で終わるほうが強く見える。**
    #
    # | | なぜ要るか |
    # | --- | --- |
    # | **内側の細かい火花** | **弾けた瞬間の密度**。外へ伸びる火花の根元を埋める |
    # | **輪** | **どこまで届いたか**が一瞬で分かる。薄いので邪魔にならない |
    ("powder_seed", "pve2_flick", 6, 0.08, "3 + 6 * variable.particle_random_3", 8.0, "0.12 + 0.1 * variable.particle_random_1", "0.22 * (1 + 0.6 * variable.particle_random_2)", C_HIT, False, True, "particles_add", 0.4, None, False, {"thin": 0.6}),
    ("powder_wave", "pve2_ring", 1, 0.05, 0.0, 0.0, 0.22, 3.6, C_WAVE, True, False, "particles_add", 0.3),
    # 業火の一矢（`scripts/lib/fx.ts` の `inferno`）。**縦に吹き上がる火柱。**
    #
    # **火薬矢が「横に散る」なら、こちらは「縦に立つ」**——同じ火でも見分けが付く。
    #
    # | | |
    # | --- | --- |
    # | **柱** | **自分で描いた炎**（`pve2_blaze`・8 コマ）を縦に撒く。高さ 4 マス |
    # | **吹き上がる火花** | 真上へ 9〜20。**重力 −6 で落ちてくる** |
    # | **地面の輪** | **半径 3 マス**——延焼が移る範囲（`onhit.ts`）と同じ大きさにする |
    # **色は絵に焼き込んである**ので、粒側は白のまま（`C_WHITE`）。
    # **縦は横の 2 倍**（絵が 64×128 なので、比を合わせる）。
    # **柱はこれ 1 個で完結する。** 大きさは横 3.0 × **縦 6.0 マス**、寿命 1.1 秒。
    #
    # **足元を地面に置く**——絵の中心が出た場所になるので、**高さの半分だけ上げる。**
    ("inferno_flame", "pve2_blaze", 2, 0.16, 1.2, 2.2, "0.5 + 0.45 * variable.particle_random_1", "1.1 * (1 + 0.4 * variable.particle_random_2)", C_WHITE, False, "lookat_y", "particles_add", 0.35, (BLAZE_FRAMES, BLAZE_W, BLAZE_H), False, {"direction": [0, 1, 0], "accel": [0, 2.2, 0], "tall": 2.0}),
    # 舞い上がる火の粉。**柱のまわりに散る細かい粒**（`user/AI51ds2090_TP_V4.webp`）
    # 雷 ---------------------------------------------------------------
    ("bolt", "pve2_spark", 5, 0.35, 6.0, 4.0, 0.35, 0.5, C_BOLT),
    ("arc", "pve2_spark", 2, 0.4, 3.0, 4.0, 0.3, 0.3, C_ARC),
    ("charge_ring", "pve2_ring", 3, 0.15, 1.2, 2.0, 0.5, 1.4, C_BOLT),
    # 反射（弓の札）用。**属性で量が変わらない**ので、こちらは満量のまま
    ("bounce_spark", "pve2_spark", 5, 0.25, 2.2, 4.0, 0.25, 0.22, C_BOLT),
    ("spark_fast", "pve2_spark", 2, 0.25, 2.2, 4.0, 0.25, 0.22, C_BOLT),
    # 放電（`scripts/lib/fx.ts` の `static`）。**電気が流れたことを 2 つで見せる。**
    #
    # | | |
    # | --- | --- |
    # | **体** | 伝播した敵で**折れた筋が 2 本弾ける**（`pve2_boltarc`・0.26 角・向きはばらばら・0.16〜0.3 秒） |
    # | **線** | **当てた敵と伝播先を結ぶ**——script が線上に点を詰めて置く（`lib/fx.ts`） |
    #
    # **絵は 6 コマの折れ線**（`pve2_zap`）。寿命いっぱいで 1 周するので、**バリバリ明滅する。**
    # 線は**小さな電気の球**を詰めて置く（2026-08-31）。
    #
    # > ### 縦向きの稲妻を並べては駄目
    # >
    # > 折れ線を横一列に置くと、**杭が並んでいるようにしか見えない。**
    # > **四方に枝が出る球**なら、隣どうしの枝が噛み合って**電気が繋がって見える。**
    #
    # **1 粒ずつは薄く**（濃さ 45％）。大きさは 0.34 角で、**詰めて置いて線にする。**
    # **1 粒ごとに回す**——同じ絵が同じ向きで並ぶと、模様に見えて線に見えない。
    #
    # > ### 量は「濃さ」で変える（`docs/spec/13-feedback.md` 4-2）
    # >
    # > **点の数を減らすと線が途切れる。** 線は繋がっていてこそ線なので、
    # > **間隔はそのままに、薄い版を 4 つ**用意して、属性値の段で使い分ける。
    *[
        (
            f"static_link_{i}",
            "pve2_elec",
            1,
            0.02,
            0.0,
            0.0,
            0.2,
            "0.34 * (1 + 0.35 * variable.particle_random_2)",
            ((0.75, 0.92, 1.0, 0.45 * i / 4), (0.5, 0.8, 1.0, 0.0)),
            "flat",
            False,
            "particles_add",
            0.5,
            (ELEC_FRAMES, ELEC_CELL),
            True,
        )
        for i in (1, 2, 3, 4)
    ],
    # 帯電。**体に纏う電気と同じ絵を、地面に敷く**（2026-08-31）。
    #
    # **床に寝かせる**（`emitter_transform_xz`）ので、上から見ても踏み荒らされた電気に見える。
    # **纏う電気より長い**（1.0）——**範囲の広さ（半径 6）を見せるため。**
    # **色は黄色**（`pve2_boltarc_y`。絵に焼き込んである）——青白い「纏う電気」と見分けが付く。
    ("charge_zap", "pve2_boltarc_y", 1, 0.05, 0.0, 0.0, 0.35, 1.0, C_WHITE, "flat", "emitter_transform_xz", "particles_add", 0.6, (ARC_FRAMES, ARC_CELL), True),
    # 氷 ---------------------------------------------------------------
    ("frost", "pve2_frost", 8, 0.5, 0.9, 1.6, 0.7, 0.3, C_ICE),
    # 氷片。**霜の粒が散る**（元の姿に戻した・2026-08-31）——
    # **破片が飛ぶのは砕氷の役**。氷片は**周りへ冷気を撒く**札なので、粒のほうが合う
    ("shard_frost", "pve2_frost", 4, 0.4, 3.5, 3.0, 0.4, 0.4, C_ICE),
    # 砕氷。**角の立った破片が飛び散る**（雪ではない）。数は 25％ ぶん
    ("shatter", "pve2_icechip", 4, 0.3, "4.0 + 3.5 * variable.particle_random_3", 1.6, "0.4 + 0.3 * variable.particle_random_1", "0.24 * (1 + 0.6 * variable.particle_random_2)", C_WHITE, "flat", False, "particles_blend", 0.7, None, True, {"accel": [0, -10.0, 0], "offset": [0, 1.0, 0], "pick_uv": (CHIP_KINDS, CHIP_CELL)}),
    ("deep_freeze", "pve2_frost", 22, 0.7, 1.4, 1.2, 1.0, 0.5, C_DEEP),
    # 水 ---------------------------------------------------------------
    ("heal", "pve2_flame", 10, 0.5, 1.0, 1.5, 0.8, 0.35, C_HEAL),
    ("guard", "pve2_ring", 2, 0.1, 0.6, 1.5, 0.5, 1.3, C_GUARD),
    ("drop", "pve2_flame", 6, 0.4, 0.8, 1.5, 0.6, 0.25, C_WATER),
    # 恵みの雨（`scripts/lib/fx.ts` の `rain`）。**地面に水色の円を描く。**
    #
    # | | |
    # | --- | --- |
    # | **円** | **半径 1.5 の円を地面に敷く**（`emitter_transform_xz`）——**回復する範囲そのもの** |
    # | **昇る光** | 円の中から上へ抜ける。**回復した感じ** |
    #
    # **円は外縁がはっきり、中は薄い**（`pve2_circle`）——
    # 中まで濃いと地面が見えず、**水たまりになってしまう。**
    # **内から外へ広がる**（2026-08-31）。
    #
    # **0.3 秒で開く。0.1 秒（＝ 33％）から薄れ始める**——急に消えると硬い。
    # `grow=True` は「大きさ × 経過」なので、
    # 出た瞬間は 0、寿命の終わりで 3.0（＝半径 1.5）になる。
    ("rain_circle", "pve2_circle", 1, 0.05, 0.0, 0.0, 0.3, 3.0, C_WHITE, True, "emitter_transform_xz", "particles_blend", 0.33),
    ("rain_up", "pve2_flame", 3, 0.6, 1.2, 2.2, "0.5 + 0.4 * variable.particle_random_1", 0.18, C_HEAL, False, False, "particles_add", 0.5, None, False, {"direction": [0, 1, 0], "accel": [0, 1.0, 0], "offset": [0, 0.2, 0]}),
    # 風 ---------------------------------------------------------------
    ("gust", "pve2_spark", 3, 0.6, 2.4, 2.2, 0.45, 0.32, C_WIND),
    # 疾走射。**当たった敵に葉が散る**（走りながら当てたときだけ）
    # **敵の体の外側から**散る（中から出ると体にめり込んで見える）
    ("dash_leaf", "pve2_leaf", 2, 0.05, "1.6 + 1.6 * variable.particle_random_3", 2.6, "0.5 + 0.5 * variable.particle_random_1", "0.22 * (1 + 0.5 * variable.particle_random_2)", C_WHITE, "flat", False, "particles_blend", 0.75, None, True, {"accel": [0, -3.0, 0], "direction": ["math.cos(variable.particle_random_1 * 360)", 0.5, "math.sin(variable.particle_random_1 * 360)"], "offset": ["math.cos(variable.particle_random_1 * 360) * 0.85", "0.5 + 1.2 * variable.particle_random_2", "math.sin(variable.particle_random_1 * 360) * 0.85"], "pick_uv": (LEAF_KINDS, LEAF_CELL)}),
    # 貫き風。**貫いた矢の軌跡**（緑）
    ("gale_trail", "pve2_spark", 1, 0.04, 0.0, 0.0, "0.25 + 0.15 * variable.particle_random_1", 0.2, C_GALE, "flat", False, "particles_add", 0.6),
    # 烈風。**発動した人の周りに羽が舞う**（ゆっくり落ちる）
    # **横へ流れながら落ちる**（2026-08-31）。
    #
    # > ### 真下に落とさない
    # >
    # > 羽は**空気を掴む**ので、まっすぐは落ちてこない。
    # > **外へ向かって放り**、**落ちながらも横へ流れ続ける**——
    # > 横向きの加速を **1 枚ごとに別の向き**へ掛ける（`particle_random_3`）。
    # > 回転はさせない（回し続けると風車に見える）。
    (
        "gust_feather",
        "pve2_feather",
        3,
        0.05,
        "1.6 + 1.4 * variable.particle_random_3",
        1.1,
        "1.6 + 1.4 * variable.particle_random_1",
        "0.3 * (1 + 0.5 * variable.particle_random_2)",
        C_WHITE,
        "flat",
        False,
        "particles_blend",
        0.8,
        None,
        True,
        {
            # **ほぼ横へ**放る（上へは少しだけ）
            "direction": [
                "math.cos(variable.particle_random_1 * 360)",
                0.35,
                "math.sin(variable.particle_random_1 * 360)",
            ],
            # **落ちながら、1 枚ごとに別の向きへ流れる**
            "accel": [
                "math.cos(variable.particle_random_3 * 360) * 1.1",
                -1.5,
                "math.sin(variable.particle_random_3 * 360) * 1.1",
            ],
            # **体の外側から出す**（2026-08-31）——中から出ると体にめり込んで見える。
            # **半径 1.1〜1.6 の輪**の上、高さは 0.6〜2.0 に散らす
            "offset": [
                "math.cos(variable.particle_random_1 * 360) * (1.1 + 0.5 * variable.particle_random_2)",
                "0.6 + 1.4 * variable.particle_random_2",
                "math.sin(variable.particle_random_1 * 360) * (1.1 + 0.5 * variable.particle_random_2)",
            ],
            "pick_uv": (LEAF_KINDS, LEAF_CELL),
        },
    ),
    # 共通 -------------------------------------------------------------
    # クリティカル（`worlds/pve-v2/user/show.jpg` を目標に）。
    #
    # **一瞬だけ**。白い閃光 ＋ 放射状の光の筋 ＋ 橙の火花。
    ("crit_core", "pve2_flame", 1, 0.02, 0.0, 0.0, 0.2, "1.5 * (1 + 0.5 * variable.particle_random_2)", C_FLASH, "pulse"),
    # **筋は 1 ヒットに 1 本だけ。** 色は赤・青・白から選ぶ（script が抽選する）
    ("crit_ray_red", "pve2_ray", 1, 0.05, 7.0, 7.0, RAY_LIFE, RAY_SIZE, C_RAY_R, "pulse", True, "particles_add", 0.88),
    ("crit_ray_blue", "pve2_ray", 1, 0.05, 7.0, 7.0, RAY_LIFE, RAY_SIZE, C_RAY_B, "pulse", True, "particles_add", 0.88),
    ("crit_ray_pink", "pve2_ray", 1, 0.05, 7.0, 7.0, RAY_LIFE, RAY_SIZE, C_RAY_P, "pulse", True, "particles_add", 0.88),
    ("crit_ray_orange", "pve2_ray", 1, 0.05, 7.0, 7.0, RAY_LIFE, RAY_SIZE, C_RAY_O, "pulse", True, "particles_add", 0.88),
    ("crit_spark", "pve2_spark", 12, 0.12, 5.0, 3.0, 0.38, 0.3, C_SPARK),
    # 通常ヒット（**いま使っているのはこちら**）。
    #
    # **1 枚の絵がコマ送りで動く**——点を撒くやり方では火花に見えなかった。
    # 大きさは 1 発ごとに 1.0〜1.4 倍（同じ絵が続くと判で押したように見える）。
    (
        "hit_burst",
        "pve2_hit_burst",
        1,
        0.02,
        0.0,
        0.0,
        0.3,
        "0.8 * (1 + 0.4 * variable.particle_random_2)",
        C_WHITE,
        "flat",
        False,
        "particles_add",
        0.85,
        (HIT_FRAMES, HIT_CELL),
        True,
    ),
    # 旧・通常ヒット（点を撒くもの）。**残してある**——別の札で使えるように。
    #
    # **見えないほど小さかった**（2026-08-31）。粒を大きく・長く・濃くした：
    # 大きさ 0.22 → 1.0（1 粒ごとに 1.0〜1.6 倍）、寿命 0.12〜0.22 → 0.2〜0.35 秒、
    # **色を 0.6 まで保つ**（それまでは出た瞬間から薄れていた）。
    (
        "hit_spark",
        "pve2_spark",
        10,
        0.08,
        3.4,
        3.6,
        "0.2 + 0.15 * variable.particle_random_1",
        "1.0 * (1 + 0.6 * variable.particle_random_2)",
        C_HIT,
        False,
        False,
        "particles_add",
        0.6,
    ),
    ("proc", "pve2_flame", 6, 0.3, 1.6, 3.0, 0.35, 0.3, C_GUARD),
]



# ---------------------------------------------------------------- 借りもの
#
# **炎だけはバニラの粒を使う**（v1 の `worlds/pve/.../element/effects.ts` から）。
#
# > **自分で描いた炎より、バニラのほうが炎に見えた**（v1・2026-08-29 の決定）。
# > **数と置き場所はこちらで決める**——体の周りに散らす（`scripts/lib/fx.ts`）。
#
# バニラの粒地図（`textures/particle/particles`）の **uv [0,24] の 8×8** が炎。
# 大きさは**出たときに決まり、時間で縮む**。寿命は 0.3〜1.0 秒でばらける。
BORROWED = {
    **{
        # 足元のきらめき（`docs/spec/15-glow.md`）。
        #
        # > ### バニラの「レッドストーン通電中の粒」をそのまま写す
        # >
        # > 自分で粉の絵を描いたら**全然違う**と言われた（2026-09-01 実機）。
        # > `minecraft:redstone_wire_dust_particle` の定義を**丸ごと写し、色だけ変える。**
        # > 絵（粒地図 uv[56,0] の 8 コマ）・大きさ・寿命・散り方・当たり判定まで同じ。
        #
        # **明るさの揺れ（`(r1*0.2+0.8)*(r2*0.4+0.6)`）も残す**——
        # これがレッドストーンの粒の「ちらつき」の正体。
        f"glow_{name}": {
            "format_version": "1.26.10",
            "particle_effect": {
                "description": {
                    "identifier": f"pve_v2:glow_{name}",
                    "basic_render_parameters": {
                        "material": "particles_alpha",
                        # **バニラの粒地図をそのまま指す**（自分では持たない）
                        "texture": "textures/particle/particles",
                    },
                },
                "components": {
                    "minecraft:emitter_lifetime_expression": {"expiration_expression": 1},
                    "minecraft:emitter_rate_instant": {"num_particles": 1},
                    "minecraft:emitter_shape_point": {},
                    "minecraft:particle_appearance_billboard": {
                        "size": [
                            "variable.particle_random_3 * 0.075 + 0.075",
                            "variable.particle_random_3 * 0.075 + 0.075",
                        ],
                        "facing_camera_mode": "lookat_xyz",
                        "direction": {
                            "mode": "derive_from_velocity",
                            "custom_direction": [0, 0, 0],
                            "min_speed_threshold": 0.1,
                        },
                        "uv": {
                            "texture_width": 128,
                            "texture_height": 128,
                            "uv": [0, 0],
                            "uv_size": [1, 1],
                            "flipbook": {
                                "base_UV": [56, 0],
                                "size_UV": [8, 8],
                                "step_UV": [-8, 0],
                                "frames_per_second": 8,
                                "max_frame": 8,
                                "stretch_to_lifetime": True,
                            },
                        },
                    },
                    "minecraft:particle_appearance_lighting": {},
                    "minecraft:particle_appearance_tinting": {
                        "color": {
                            "gradient": {
                                "0.000000": [
                                    f"(variable.particle_random_1 * 0.2 + 0.8) * (variable.particle_random_2 * 0.4 + 0.6) * {rgb[0]}",
                                    f"(variable.particle_random_1 * 0.2 + 0.8) * (variable.particle_random_2 * 0.4 + 0.6) * {rgb[1]}",
                                    f"(variable.particle_random_1 * 0.2 + 0.8) * (variable.particle_random_2 * 0.4 + 0.6) * {rgb[2]}",
                                    0,
                                ]
                            },
                            "interpolant": 0,
                        }
                    },
                    "minecraft:particle_initial_speed": [
                        "Math.random(-0.4, 0.4)",
                        "Math.random(-0.1, 0.1)",
                        "Math.random(-0.4, 0.4)",
                    ],
                    "minecraft:particle_lifetime_expression": {"max_lifetime": "2 / math.random(1.0, 5.0)"},
                    "minecraft:particle_motion_collision": {"collision_radius": 0.01, "events": []},
                    "minecraft:particle_motion_dynamic": {},
                },
            },
        }
        for name, rgb in (
            ("fire", (1.0, 0.42, 0.1)),
            ("thunder", (1.0, 0.92, 0.3)),
            ("wind", (0.45, 1.0, 0.45)),
            ("water", (0.25, 0.65, 1.0)),
            ("ice", (0.7, 0.95, 1.0)),
        )
    },
    # 爆発の煙。**バニラの爆発と同じ絵**（粒地図の 8 コマ・uv[56,0] から左へ）。
    #
    # **寿命だけ短くしてある**——バニラは最長 4 秒で、**小爆発には長すぎる。**
    # **数と散らし方は script が決める**（`scripts/lib/fx.ts` の `scatter`）。
    # 業火の一矢。**地面を走る火の輪**（2026-08-31 決定）。
    #
    # > ### 火柱はやめた
    # >
    # > Bedrock の粒は**カメラを向く板**なので、**縦に長いものほど破綻する**——
    # > 板 1 枚でも、粒を積んでも、「絵が立っている」ようにしか見えなかった。
    # > **地面に沿う表現なら、角度で崩れようがない。**
    #
    # | | |
    # | --- | --- |
    # | 出方 | **中心の小さな円**から**外へ一斉に**（90 個 × 段＝最大 360） |
    # | 走り方 | 初速 9〜11・抵抗 2.6 → **およそ 3 マスで止まる**（＝延焼が移る範囲） |
    # | 絵 | **バニラの炎**（粒地図の uv[0,24]）。**自作より炎に見える**（延焼と同じ結論） |
    # | 消え方 | 0.45〜0.65 秒。**濃さは 0.7 まで保つ**——薄れながら走ると勢いが死ぬ |
    #
    # **角度は 1 粒ごとの乱数**。位置と向きで同じ値を使うので、
    # **円の上から、その点の外向きへ**まっすぐ走る（＝輪が広がって見える）。
    # 業火の一矢。**敵が燃え上がる**（2026-08-31 追加）。
    #
    # 火の輪（`inferno_ring`）と一緒に出す。
    # **輪は「どこまで燃え移ったか」、こちらは「誰が焼かれたか」**を見せる。
    #
    # | | |
    # | --- | --- |
    # | 絵 | **バニラの炎**（粒地図 uv[0,24]） |
    # | 出る場所 | **足元から 2 マス下**（半径 0.5）。**地面から立ち上がる** |
    # | 動き | **上へ吹き上がる**（初速 6〜9・上へ 3.0 の加速・抵抗 1.1）。2 マス下から出るぶん速く |
    # | 量 | **240 個を一度に**。延焼（3 本）の 80 倍——**格が違うことを量で見せる** |
    # 業火の矢の軌跡（2026-08-31）。**普通の矢とは見た目を変える。**
    #
    # > ### 撃った瞬間に分かるようにする
    # >
    # > **抽選は撃った時**（`features/bow/shoot.ts`）。
    # > **音と軌跡が変わる**ので、飛んでいる間から「来る」と分かる。
    #
    # 琥珀色の線（`arrow_trail`）の代わりに、**バニラの炎を点々と置く。**
    # 放電。**雷を纏う**（2026-08-31）。
    #
    # > ### 板を大きくしても「絵が貼ってある」だけ
    # >
    # > **体のまわりの空間に、小さな筋を球状に散らす**——
    # > **どの角度から見ても電気に包まれて見える。**（板 1 枚では正面からしか成立しない）
    #
    # | | |
    # | --- | --- |
    # | 位置 | **半径 0.7 の球殻**（胸の高さ）。角度 2 つを乱数で振って表面に置く |
    # | 数 | **2 本 × 段（最大 4 段）**。**横に長い筋**（長さ 0.55〜0.85・太さ 0.2〜0.27）——多いと毛玉になる |
    # | 長さ | **0.2 秒＝4 tick**。**一瞬だけ**光って消える |
    # | 向き | 1 本ごとにランダム回転 |
    "static_body": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:static_body",
                "basic_render_parameters": {
                    "material": "particles_add",
                    "texture": "textures/particle/pve2_boltarc",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": 2},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                # **球の表面に置く**（中を埋めない）——纏っているのは体の周り
                "minecraft:emitter_shape_custom": {
                    "offset": [
                        "math.sin(variable.particle_random_2 * 180) * math.cos(variable.particle_random_1 * 360) * 0.7",
                        "math.cos(variable.particle_random_2 * 180) * 0.7 + 1.0",
                        "math.sin(variable.particle_random_2 * 180) * math.sin(variable.particle_random_1 * 360) * 0.7",
                    ],
                    "direction": [0, 0, 0],
                },
                "minecraft:particle_initial_speed": 0,
                # **横向きだけにする**（2026-08-31）——縦に立った筋は「板」に見える。
                # ±35 度に収めれば、どれも寝た筋のまま向きだけ散る
                "minecraft:particle_initial_spin": {"rotation": "variable.particle_random_3 * 70 - 35"},
                "minecraft:particle_lifetime_expression": {"max_lifetime": 0.2},
                "minecraft:particle_appearance_billboard": {
                    # **横に長く、縦は薄く**（2026-08-31）——正方形だと筋が短く見える
                    "size": [
                        "0.55 + 0.3 * variable.particle_random_2",
                        "0.2 + 0.07 * variable.particle_random_2",
                    ],
                    "facing_camera_mode": "rotate_xyz",
                    # **形は 1 本ごとに 1 つ選んで、そのまま**（2026-08-31）。
                    #
                    # > ### コマ送りにしない
                    # >
                    # > 4 tick のあいだ形が変わり続けると、**何が出ているのか読めない。**
                    # > **12 種のどれかを乱数で 1 つ選び、消えるまで同じ形**を保つ。
                    # > **変わるのは濃さだけ**（下の `tinting`）。
                    "uv": {
                        "texture_width": 64,
                        "texture_height": 768,
                        "uv": [0, "math.floor(variable.particle_random_2 * 12) * 64"],
                        "uv_size": [64, 64],
                    },
                },
                # **出て、濃くなって、消える**（形はそのまま）
                "minecraft:particle_appearance_tinting": {
                    "color": {
                        "gradient": {"0.0": [1, 1, 1, 0.55], "0.3": [1, 1, 1, 1], "1.0": [1, 1, 1, 0]},
                        "interpolant": "v.particle_age / v.particle_lifetime",
                    }
                },
            },
        },
    },
    # 凪。**水しぶき**（2026-08-31）。
    #
    # > ### バニラの粒はそのまま呼べないことがある
    # >
    # > `minecraft:cauldron_splash_particle` は**ゲームが渡す変数**
    # >（`variable.color` / `variable.texture_coord`）を使っていて、
    # > **script から出すと色も UV も 0 になり、何も見えない。**
    # >
    # > **絵だけ借りて、粒は自分で組む**——バニラの粒地図の
    # > **水しぶき 4 種**（uv[24,8] から 8 ずつ）を 1 粒ごとに引く。
    # 霜纏い。**自分の体に霜を纏い続ける**（2026-08-31）。
    #
    # > ### 飛び散らせない
    # >
    # > 砕氷（`shatter`）は**割れて飛ぶ**、こちらは**貼り付く**——同じ絵でも別物に見える。
    # > **体のまわりの球殻に、動かない破片を並べる。**
    #
    # | | |
    # | --- | --- |
    # | 位置 | **半径 0.95 の球殻**（**足元〜腰**）——**体から離し、低く。目の高さは視界を塞ぐ** |
    # | 動き | **止まったまま**（初速 0）。**その場で膨らんで、薄れて消える** |
    # | 長さ | 0.45 秒 |
    "frost_aura": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:frost_aura",
                "basic_render_parameters": {
                    "material": "particles_blend",
                    # **霜の粒**（六角）。**砕けた破片ではない**——纏うのは霜
                    "texture": "textures/particle/pve2_frost",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                # **1 回に 1 個**——**出す間隔**で量を決める（`features/aura/`）
                "minecraft:emitter_rate_instant": {"num_particles": 1},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_custom": {
                    # **体から離し（半径 0.95）、低い所に出す**——
                    # **目の高さに出ると 1 人称で視界を塞ぐ。足元から腰まで**に収める
                    "offset": [
                        "math.sin(variable.particle_random_2 * 180) * math.cos(variable.particle_random_1 * 360) * 0.95",
                        "math.cos(variable.particle_random_2 * 180) * 0.4 + 0.55",
                        "math.sin(variable.particle_random_2 * 180) * math.sin(variable.particle_random_1 * 360) * 0.95",
                    ],
                    "direction": [0, 0, 0],
                },
                "minecraft:particle_initial_speed": 0,
                "minecraft:particle_initial_spin": {"rotation": "variable.particle_random_3 * 360"},
                # **長めに残す**——0.5 秒ごとに少しずつ足して、**途切れないようにする**
                "minecraft:particle_lifetime_expression": {"max_lifetime": "0.7 + 0.3 * variable.particle_random_1"},
                "minecraft:particle_appearance_billboard": {
                    # **貼り付いてから、少し育つ**
                    "size": [
                        "(0.2 + 0.12 * variable.particle_random_2) * (0.7 + 0.5 * (v.particle_age / v.particle_lifetime))",
                        "(0.2 + 0.12 * variable.particle_random_2) * (0.7 + 0.5 * (v.particle_age / v.particle_lifetime))",
                    ],
                    "facing_camera_mode": "rotate_xyz",
                    "uv": {"texture_width": 16, "texture_height": 16, "uv": [0, 0], "uv_size": [16, 16]},
                },
                "minecraft:particle_appearance_tinting": {
                    "color": {
                        # **薄い水色**。常に出るものなので、濃いと画面が濁る
                        "gradient": {
                            "0.0": [0.75, 0.95, 1.0, 0.3],
                            "0.3": [0.8, 0.96, 1.0, 0.5],
                            "1.0": [1.0, 1.0, 1.0, 0.0],
                        },
                        "interpolant": "v.particle_age / v.particle_lifetime",
                    }
                },
            },
        },
    },
    "calm_splash": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:calm_splash",
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": 6},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_sphere": {
                    "radius": 0.35,
                    "direction": [
                        "math.cos(variable.particle_random_1 * 360)",
                        1.2,
                        "math.sin(variable.particle_random_1 * 360)",
                    ],
                    "offset": [0, 1.0, 0],
                },
                "minecraft:particle_initial_speed": "2.5 + 2.0 * variable.particle_random_3",
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": [0, -9.0, 0],
                    "linear_drag_coefficient": 0.6,
                },
                "minecraft:particle_lifetime_expression": {
                    "max_lifetime": "0.35 + 0.3 * variable.particle_random_1"
                },
                "minecraft:particle_appearance_billboard": {
                    "size": ["0.14 + 0.06 * variable.particle_random_2", "0.14 + 0.06 * variable.particle_random_2"],
                    "facing_camera_mode": "lookat_xyz",
                    # **バニラの水しぶき 4 種**から 1 粒ごとに引く
                    "uv": {
                        "texture_width": 128,
                        "texture_height": 128,
                        "uv": ["24 + math.round(variable.particle_random_2 * 3.0) * 8", 8],
                        "uv_size": [8, 8],
                    },
                },
            },
        },
    },
    "inferno_trail": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:inferno_trail",
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": 2},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_sphere": {"radius": 0.12, "direction": "outwards"},
                "minecraft:particle_initial_speed": 0.6,
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": [0, 1.2, 0],
                    "linear_drag_coefficient": 2.0,
                },
                "minecraft:particle_lifetime_expression": {
                    "max_lifetime": "0.25 + 0.25 * variable.particle_random_1"
                },
                "minecraft:particle_appearance_billboard": {
                    "size": [
                        "0.22 * (1 - (v.particle_age / v.particle_lifetime) * 0.8)",
                        "0.22 * (1 - (v.particle_age / v.particle_lifetime) * 0.8)",
                    ],
                    "facing_camera_mode": "lookat_xyz",
                    "uv": {"texture_width": 128, "texture_height": 128, "uv": [0, 24], "uv_size": [8, 8]},
                },
            },
        },
    },
    "inferno_body": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:inferno_body",
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                # **4 倍に増やした**（2026-08-31）——10％ でしか出ない技なので、量で格を出す
                "minecraft:emitter_rate_instant": {"num_particles": 60},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_sphere": {
                    "radius": 0.5,
                    "direction": [0, 1, 0],
                    # **足元から 2 マス下**——**地面から燃え上がって見せる**（2026-08-31）。
                    # 体の高さから出すと「まとわりついている」だけで、立ち上がりが無い
                    "offset": [0, -2.0, 0],
                },
                "minecraft:particle_initial_speed": "6 + 3 * variable.particle_random_2",
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": [0, 3.0, 0],
                    "linear_drag_coefficient": 1.1,
                },
                "minecraft:particle_lifetime_expression": {
                    "max_lifetime": "0.6 + 0.5 * variable.particle_random_1"
                },
                "minecraft:particle_appearance_billboard": {
                    "size": [
                        "0.3 * (1 - (v.particle_age / v.particle_lifetime) * 0.7)",
                        "0.3 * (1 - (v.particle_age / v.particle_lifetime) * 0.7)",
                    ],
                    "facing_camera_mode": "lookat_xyz",
                    "uv": {"texture_width": 128, "texture_height": 128, "uv": [0, 24], "uv_size": [8, 8]},
                },
            },
        },
    },
    "inferno_ring": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:inferno_ring",
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                # **4 倍に増やした**（2026-08-31）
                "minecraft:emitter_rate_instant": {"num_particles": 90},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_custom": {
                    "offset": [
                        "math.cos(variable.particle_random_1 * 360) * 0.4",
                        0.15,
                        "math.sin(variable.particle_random_1 * 360) * 0.4",
                    ],
                    "direction": [
                        "math.cos(variable.particle_random_1 * 360)",
                        0.18,
                        "math.sin(variable.particle_random_1 * 360)",
                    ],
                },
                "minecraft:particle_initial_speed": "9 + 2 * variable.particle_random_2",
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": [0, -1.5, 0],
                    "linear_drag_coefficient": 2.6,
                },
                "minecraft:particle_lifetime_expression": {
                    "max_lifetime": "0.45 + 0.2 * variable.particle_random_3"
                },
                "minecraft:particle_appearance_billboard": {
                    "size": [
                        "0.28 * (1 - (v.particle_age / v.particle_lifetime) * 0.6)",
                        "0.28 * (1 - (v.particle_age / v.particle_lifetime) * 0.6)",
                    ],
                    "facing_camera_mode": "lookat_xyz",
                    # **バニラの炎**（粒地図 uv[0,24] の 8×8）
                    "uv": {"texture_width": 128, "texture_height": 128, "uv": [0, 24], "uv_size": [8, 8]},
                },
                "minecraft:particle_appearance_tinting": {
                    "color": {
                        "gradient": {"0.0": [1, 1, 1, 1], "0.7": [1, 1, 1, 0.95], "1.0": [1, 1, 1, 0]},
                        "interpolant": "v.particle_age / v.particle_lifetime",
                    }
                },
            },
        },
    },
    "boom_puff": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:boom_puff",
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": 1},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_point": {},
                "minecraft:particle_initial_speed": 0,
                "minecraft:particle_motion_dynamic": {
                    "linear_acceleration": [0, 1.5, 0],
                    "linear_drag_coefficient": 2.5,
                },
                "minecraft:particle_appearance_billboard": {
                    "size": [
                        "0.7 + variable.particle_random_1 * 0.55",
                        "0.7 + variable.particle_random_1 * 0.55",
                    ],
                    "facing_camera_mode": "lookat_xyz",
                    "uv": {
                        "texture_width": 128,
                        "texture_height": 128,
                        "uv": [0, 0],
                        "uv_size": [1, 1],
                        "flipbook": {
                            "base_UV": [56, 0],
                            "size_UV": [8, 8],
                            "step_UV": [-8, 0],
                            "frames_per_second": 12,
                            "max_frame": 8,
                            "stretch_to_lifetime": True,
                        },
                    },
                },
                # **薄くする**（2026-08-31）——**大きくすると濃さがそのままでは画面を覆う。**
                # 大きさで迫力を出し、**濃さは下げる。**
                "minecraft:particle_appearance_tinting": {
                    "color": {
                        "gradient": {"0.0": [1, 1, 1, 0.45], "0.5": [1, 1, 1, 0.3], "1.0": [1, 1, 1, 0.0]},
                        "interpolant": "v.particle_age / v.particle_lifetime",
                    }
                },
                "minecraft:particle_lifetime_expression": {
                    "max_lifetime": "0.45 + 0.35 * variable.particle_random_1"
                },
            },
        },
    },
    "burn_flame": {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": "pve_v2:burn_flame",
                "basic_render_parameters": {
                    "material": "particles_alpha",
                    "texture": "textures/particle/particles",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": 1},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_sphere": {"radius": 0.025, "direction": [0, 0, 0]},
                "minecraft:particle_initial_speed": 0,
                "minecraft:particle_appearance_billboard": {
                    "size": [
                        "(0.1 + variable.particle_random_1*0.1) - (0.1 * variable.particle_age)",
                        "(0.1 + variable.particle_random_1*0.1) - (0.1 * variable.particle_age)",
                    ],
                    "facing_camera_mode": "lookat_xyz",
                    "uv": {"texture_width": 128, "texture_height": 128, "uv": [0, 24], "uv_size": [8, 8]},
                },
                "minecraft:particle_lifetime_expression": {"max_lifetime": "Math.random(0.3, 1.0)"},
            },
        },
    },
}


# **向きを要る facing**（ここ以外に `direction` を添えると、粒ごと弾かれる）
NEEDS_DIRECTION = ("direction_x", "direction_y", "direction_z", "lookat_direction")


def particle(name, tex, count, radius, speed, drag, life, size, color, grow=False, facing=False, material="particles_add", hold=0.0, flipbook=None, spin=False, direction=None, accel=None, offset=None, thin=0.10, tall=1.0, pick_uv=None, spin_rate=0.0):
    """粒 1 つぶんの定義。

    | | |
    | --- | --- |
    | `grow` | `True` で**広がる**、`"pulse"` で**広がってから縮む**（山なり） |
    | `facing` | `True` で**飛ぶ向きへ寝かせる**（光の筋）。**文字列ならその向き方をそのまま使う** |

    > ### `lookat_y` は**立ったまま**こちらを向く
    >
    > 既定の `lookat_xyz` は**カメラへ完全に正対する**ので、
    > **真上から見ると板が寝てしまう**（炎が地面に貼り付いて見える）。
    > **炎のように「上に立っているもの」は `lookat_y`**——
    > 縦は保ったまま、横向きだけこちらを向く。
    | `material` | **`particles_add`** は光（重なるほど白い）。**`particles_blend`** は半透明。**`particles_alpha` は「抜き」**——**薄い色は出ない**（閾値で切られる） |

    > ### 半透明にしたいなら `particles_blend`
    >
    > `particles_alpha` は**アルファテスト**（不透明か、消えるかの 2 択）。
    > **薄い色を塗っても、ただ消える**——円の中身が出なかった原因（2026-08-31）。
    | `hold` | **その割合まで濃さを保つ**（0.7 なら最後の 3 割で一気に消える） |
    | `flipbook` | `(コマ数, 幅)` か `(コマ数, 幅, 高さ)` で**連番の絵を寿命いっぱいで再生** |
    | `pick_uv` | `(種類, 1 マスの辺)` で**縦に並んだ絵から 1 粒ごとに 1 つ引く**（動かさない） |
    | `direction` | `[0, 1, 0]` で**上へ昇る**（既定は「外へ」） |
    | `accel` | `[0, -4, 0]` で**落ちる**（火の粉） |
    | `offset` | **足元からどれだけ上で出すか**（煙は炎より上） |
    | `thin` | 寝かせたときの**縦の潰し具合**（0.10 で光の筋、0.3 で火花） |
    | `tall` | **縦に伸ばす**（1.7 で炎の舌。横に広がらず、上に伸びる） |

    `grow="flat"` は**大きさを変えない**——連番の絵は、絵の側が伸び縮みする。

    **寿命は式でもよい**（`"math.random(0.15, 0.25)"` のように、1 つずつ散らせる）。
    """
    a, b = color
    t = "(v.particle_age / v.particle_lifetime)"
    if grow == "flat":
        # **大きさは動かさない**（連番の絵が自分で伸び縮みする）
        scale = f"{size}"
    elif grow == "pulse":
        # **小さく出て、広がって、また縮んで消える**（山なり）
        scale = f"{size} * math.sin(180 * {t})"
    elif grow:
        scale = f"{size} * {t}"
    else:
        scale = f"{size} * (1 - {t})"
    # **光の筋は縦だけ細く**（横に長い絵を、細く寝かせて放射状に見せる）。
    #
    # **0.18 → 0.10 に絞った**（2026-08-31）——太いと爆発に見える。
    # **線であって、塊ではない**（`worlds/pve-v2/user/show.jpg`）
    # **寝かせた粒は縦を潰す**（`thin`）、**立った粒は縦に伸ばす**（`tall`）
    scale_y = f"({scale}) * {thin}" if facing is True else (f"({scale}) * {tall}" if tall != 1.0 else scale)
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": f"pve_v2:{name}",
                "basic_render_parameters": {
                    "material": material,
                    "texture": f"textures/particle/{tex}",
                },
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                # **1 粒ごとに向きを回す**（同じ絵でも、毎回ちがう向きに弾ける）
                **(
                    {
                        "minecraft:particle_initial_spin": {
                            "rotation": "variable.particle_random_3 * 360",
                            **({"rotation_rate": spin_rate} if spin_rate else {}),
                        }
                    }
                    if spin
                    else {}
                ),
                "minecraft:emitter_rate_instant": {"num_particles": count},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_sphere": {
                    "radius": radius,
                    "direction": direction if direction is not None else "outwards",
                    **({"offset": offset} if offset is not None else {}),
                },
                "minecraft:particle_initial_speed": speed,
                "minecraft:particle_motion_dynamic": {
                    "linear_drag_coefficient": drag,
                    **({"linear_acceleration": accel} if accel is not None else {}),
                },
                "minecraft:particle_lifetime_expression": {"max_lifetime": life},
                "minecraft:particle_appearance_billboard": {
                    "size": [scale, scale_y],
                    "facing_camera_mode": (
                        "direction_x" if facing is True else (facing if isinstance(facing, str) else "lookat_xyz")
                    ),
                    # **`direction` は「向きを要る facing」にしか付けられない**（2026-09-01）。
                    #
                    # > ### 付けると、ブロックごと弾かれる
                    # >
                    # > `lookat_y` や `emitter_transform_xz` に添えたら、実機のログに
                    # > **`The 'direction' sub section is not using a valid mode!`** が出た。
                    # > 使えるのは **`direction_x/y/z` と `lookat_direction`** だけ
                    # >（`reference/minecraft-creator-docs/.../minecraftParticle_appearance_billboard.md`）。
                    **(
                        {"direction": {"mode": "derive_from_velocity", "min_speed_threshold": 0.01}}
                        if facing is True
                        else (
                            {"direction": {"mode": "custom_direction", "custom_direction": [0, 1, 0]}}
                            if isinstance(facing, str) and facing in NEEDS_DIRECTION
                            else {}
                        )
                    ),
                    "uv": (
                        {
                            "texture_width": flipbook[1],
                            "texture_height": (flipbook[2] if len(flipbook) > 2 else flipbook[1]) * flipbook[0],
                            "uv": [0, 0],
                            "uv_size": [flipbook[1], flipbook[2] if len(flipbook) > 2 else flipbook[1]],
                            "flipbook": {
                                "base_UV": [0, 0],
                                "size_UV": [flipbook[1], flipbook[2] if len(flipbook) > 2 else flipbook[1]],
                                # **縦に並べてある**——1 コマぶん下へ送る
                                "step_UV": [0, flipbook[2] if len(flipbook) > 2 else flipbook[1]],
                                "frames_per_second": 24,
                                "max_frame": flipbook[0],
                                # **寿命いっぱいで 1 周**（寿命を変えれば速さも変わる）
                                "stretch_to_lifetime": True,
                                "loop": False,
                            },
                        }
                        if flipbook is not None
                        else (
                            {
                                "texture_width": pick_uv[1],
                                "texture_height": pick_uv[1] * pick_uv[0],
                                # **1 粒ごとに 1 種を引く**（同じ形が並ぶと模様に見える）
                                "uv": [0, f"math.floor(variable.particle_random_2 * {pick_uv[0]}) * {pick_uv[1]}"],
                                "uv_size": [pick_uv[1], pick_uv[1]],
                            }
                            if pick_uv is not None
                            else {"texture_width": 16, "texture_height": 16, "uv": [0, 0], "uv_size": [16, 16]}
                        )
                    ),
                },
                "minecraft:particle_appearance_tinting": {
                    "color": {
                        "gradient": (
                            # **途中まで濃さを保つ**——薄く見えるのを防ぐ
                            {"0.0": list(a), str(hold): list(a), "1.0": list(b)}
                            if hold > 0
                            else [list(a), list(b)]
                        ),
                        "interpolant": "v.particle_age / v.particle_lifetime",
                    }
                },
            },
        },
    }



# ---------------------------------------------------------------- v1 から
#
# **落雷は v1 のものをそのまま使う**（2026-08-31 決定）。
#
# > ### 作り直さない
# >
# > v1 で**映像から切り出して 5 通り**作ってある（`worlds/pve/.../el_bolt_*`）。
# > **雷 1 本を縦長の絵に丸ごと描き、4 コマの明滅で光らせる**——
# > 粒を並べるやり方より確実に雷に見える、というのが v1 の結論。
#
# 絵（`pve_bolt_0〜4` / `pve_blob` / `pve_splinter`）は**v1 からコピーする。**
# **編集しない**——直したくなったら v1 側を直す。
V1_RP = os.path.join("worlds", "pve", "packs", "pve", "resource_packs", "pve")
V1_TEXTURES = {
    **{f"pve2_bolt_{i}": f"pve_bolt_{i}" for i in range(5)},
    "pve2_blob": "pve_blob",
    "pve2_splinter": "pve_splinter",
}
# v1 の粒定義（識別子と絵の名前だけ差し替えて使う）
V1_PARTICLES = {
    **{f"strike_bolt_{i}": f"el_bolt_{i}" for i in range(5)},
    "strike_flash": "el_thunder_flash",
    "strike_spark": "el_thunder_spark",
}


def copy_v1():
    """v1 の絵と粒を持ってくる。**中身は変えず、名前だけ付け替える**"""
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = os.path.join(root, V1_RP)
    for dst, name in V1_TEXTURES.items():
        Image.open(os.path.join(src, "textures", "particle", f"{name}.png")).save(
            os.path.join(TEX, f"{dst}.png")
        )
        print("  ", f"textures/particle/{dst}.png（v1）")
    for dst, name in V1_PARTICLES.items():
        with io.open(os.path.join(src, "particles", f"{name}.json"), encoding="utf-8") as f:
            data = json.load(f)
        pe = data["particle_effect"]
        pe["description"]["identifier"] = f"pve_v2:{dst}"
        tex = pe["description"]["basic_render_parameters"]["texture"]
        base = tex.rsplit("/", 1)[-1]
        pe["description"]["basic_render_parameters"]["texture"] = f"textures/particle/pve2_{base[4:]}"
        with io.open(os.path.join(PAR, f"{dst}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("  ", f"particles/{dst}.json（v1）")


def main() -> int:
    os.makedirs(TEX, exist_ok=True)
    os.makedirs(PAR, exist_ok=True)

    for name, make in TEXTURES.items():
        make().save(os.path.join(TEX, f"{name}.png"))
        print("  ", f"textures/particle/{name}.png")

    copy_v1()

    for name, data in BORROWED.items():
        with io.open(os.path.join(PAR, f"{name}.json"), "w", encoding="utf-8") as fp:
            json.dump(data, fp, ensure_ascii=False, indent=2)
        print("  ", f"particles/{name}.json")

    for row in EFFECTS:
        name = row[0]
        # **末尾が dict なら名前つき引数**——向き・重力・ずらしを足すとき用
        if isinstance(row[-1], dict):
            data = particle(*row[:-1], **row[-1])
        else:
            data = particle(*row)  # 9 個目（grow）は省略できる
        with io.open(os.path.join(PAR, f"{name}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("  ", f"particles/{name}.json")

    print(f"できた（絵 {len(TEXTURES)} 枚 / 粒 {len(EFFECTS)} 個）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
