"""pve-v3 の戦場（100×100）と休憩所を、**下地として生成する。**

    python tools/pve3-map.py basin --scene out/basin.json
    python tools/pve3-map.py --all --dir out
    python tools/pve3-map.py rest --scene out/rest.json

仕様は `worlds/pve-v3/docs/02-map.md`（コンセプト 20 通り）と
`worlds/pve-v3/docs/spec/14-map-build.md`（組み立て方）。

## 何のためか

> ### 20 枚を手で建てるのは、現実的でない
>
> **下地を機械が作り、人が直す**（`02-map.md` 5 章）。
> **形が気に入らなければ、種を変えてもう一度出す**——ここが軽いほど、試せる回数が増える。

## どう持っているか

**柱の一番上だけ**を持つ（`tools/mc-scene.mjs` と同じ形）。

```
H[x][z]  地面の一番上の y（**無ければ None** ＝ 奈落）
S[x][z]  そこに見えるブロック
extra    地面より上に置いたもの（木・柱・橋・ポータル）
```

**写真で見るのは表面だけ**なので、中身は持たない。
**`.mcstructure` にするときは、ここから柱を埋め直す**（まだ書いていない）。

## 決まり（`02-map.md` 4 章）

| | |
| --- | --- |
| 広さ | **x・z とも −50 〜 +49** |
| 平地の高さ | **y ＝ 12**（下に 12 マス掘れる） |
| **休憩所** | **−2000, 0, −2000**。**毎回同じ**（作り直さない） |
| **ポータル** | **奥（0, 地面, +42）に必ず置く** |
| **湧く場所** | **手前（0, 地面, −40）** |
"""

import argparse
import io
import json
import math
import os
import sys

# ---------------------------------------------------------------- 決まり

HALF = 50
X1, X2 = -HALF, HALF - 1
Z1, Z2 = -HALF, HALF - 1
GROUND = 12          # 平地の高さ
YMAX = 63            # 構造物 1 枚の上限（`14-map-build.md` 2 章）
PORTAL_Z = 42        # ポータルの位置（奥）
SPAWN_Z = -40        # 湧く場所（手前）


# ---------------------------------------------------------------- 雑音

def _hash(ix, iz, seed):
    n = (ix * 374761393 + iz * 668265263 + seed * 1013904223) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def noise(x, z, scale, seed):
    """滑らかな雑音（0〜1）"""
    fx, fz = x / scale, z / scale
    ix, iz = math.floor(fx), math.floor(fz)
    tx, tz = fx - ix, fz - iz
    sx = tx * tx * (3 - 2 * tx)
    sz = tz * tz * (3 - 2 * tz)
    a = _hash(ix, iz, seed)
    b = _hash(ix + 1, iz, seed)
    c = _hash(ix, iz + 1, seed)
    d = _hash(ix + 1, iz + 1, seed)
    return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz


def fbm(x, z, scale, seed, octaves=3):
    """雑音を重ねる。**細かい凹凸が出る**"""
    total, amp, norm = 0.0, 1.0, 0.0
    for i in range(octaves):
        total += noise(x, z, scale / (2 ** i), seed + i * 977) * amp
        norm += amp
        amp *= 0.5
    return total / norm


def rnd(x, z, seed):
    """その場所だけで決まる 0〜1。**散らすのに使う**"""
    return _hash(x, z, seed * 7919)


# ---------------------------------------------------------------- 場

class Field:
    """柱の一番上だけを持つ場"""

    def __init__(self):
        self.w = X2 - X1 + 1
        self.l = Z2 - Z1 + 1
        self.h = [[None] * self.l for _ in range(self.w)]
        self.s = [["air"] * self.l for _ in range(self.w)]
        self.extra = {}

    # ---- 座標
    def inside(self, x, z):
        return X1 <= x <= X2 and Z1 <= z <= Z2

    def set_ground(self, x, z, y, block):
        if not self.inside(x, z):
            return
        self.h[x - X1][z - Z1] = max(0, min(YMAX, int(y)))
        self.s[x - X1][z - Z1] = block

    def ground(self, x, z):
        if not self.inside(x, z):
            return None
        return self.h[x - X1][z - Z1]

    def put(self, x, y, z, block):
        """地面より上に置く"""
        if not self.inside(x, z) or not (0 <= y <= YMAX):
            return
        self.extra[(x, int(y), z)] = block

    def box(self, x1, y1, z1, x2, y2, z2, block):
        for x in range(min(x1, x2), max(x1, x2) + 1):
            for y in range(min(y1, y2), max(y1, y2) + 1):
                for z in range(min(z1, z2), max(z1, z2) + 1):
                    self.put(x, y, z, block)

    # ---- 書き出し
    def scene(self):
        """`tools/mc-render.py` が読む形"""
        palette, index = [], {}

        def pid(name):
            if name not in index:
                index[name] = len(palette)
                palette.append(name)
            return index[name]

        hs = [-999] * (self.w * self.l)
        bs = [-1] * (self.w * self.l)
        for xi in range(self.w):
            for zi in range(self.l):
                y = self.h[xi][zi]
                if y is None:
                    continue
                i = zi * self.w + xi
                hs[i] = y
                bs[i] = pid(self.s[xi][zi])
        # **上に置いたものが勝つ**（木や柱が地面に埋もれて見えなくなる）
        for (x, y, z), block in self.extra.items():
            xi, zi = x - X1, z - Z1
            i = zi * self.w + xi
            if y <= hs[i]:
                continue
            hs[i] = y
            bs[i] = pid(block)
        return {
            "x0": X1,
            "z0": Z1,
            "w": self.w,
            "l": self.l,
            "field": {"x1": X1, "x2": X2, "z1": Z1, "z2": Z2},
            "palette": palette,
            "h": hs,
            "b": bs,
        }


# ---------------------------------------------------------------- 部品

def flat(f, block, y=GROUND):
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            f.set_ground(x, z, y, block)


def rolling(f, seed, block, amp=3.0, scale=22.0, base=GROUND):
    """ゆるい起伏"""
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            f.set_ground(x, z, base + (fbm(x, z, scale, seed) - 0.5) * 2 * amp, block)


def rim(f, seed, block, height=16, inner=34, base=GROUND):
    """外周だけ持ち上げる（擂鉢・囲い）"""
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            d = max(abs(x), abs(z))
            if d <= inner:
                continue
            t = (d - inner) / (HALF - inner)
            up = height * t * t * (0.7 + 0.6 * fbm(x, z, 13, seed))
            y = (f.ground(x, z) or base) + up
            f.set_ground(x, z, y, block)


def liquid(f, level, block, floor_block=None):
    """水位より低い所を液体で埋める"""
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            y = f.ground(x, z)
            if y is None or y >= level:
                continue
            if floor_block is not None:
                f.set_ground(x, z, y, floor_block)
            for yy in range(y + 1, level + 1):
                f.put(x, yy, z, block)


def scatter(f, seed, chance, build, keep_center=True):
    """散らして置く。**中央の湧く場所とポータルの前は空ける**"""
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            if rnd(x, z, seed) > chance:
                continue
            if keep_center and abs(x) < 5 and (z > PORTAL_Z - 6 or z < SPAWN_Z + 6):
                continue
            y = f.ground(x, z)
            if y is None:
                continue
            build(f, x, y, z)


def tree(f, x, y, z, log, leaf, height=6, radius=3):
    for i in range(1, height + 1):
        f.put(x, y + i, z, log)
    top = y + height
    for dx in range(-radius, radius + 1):
        for dz in range(-radius, radius + 1):
            for dy in range(-1, 2):
                if dx * dx + dz * dz + dy * dy * 2 > radius * radius + 1:
                    continue
                f.put(x + dx, top + dy, z + dz, leaf)


def pillar(f, x, z, y0, y1, block, r=1):
    for dx in range(-r, r + 1):
        for dz in range(-r, r + 1):
            if dx * dx + dz * dz > r * r + r:
                continue
            for y in range(y0, y1 + 1):
                f.put(x + dx, y, z + dz, block)


def disc(f, cx, cz, radius, y, block, seed=1, rough=0.25):
    """丸い足場（浮島の上面）"""
    for x in range(cx - radius - 2, cx + radius + 3):
        for z in range(cz - radius - 2, cz + radius + 3):
            d = math.hypot(x - cx, z - cz)
            edge = radius * (1 - rough * 0.5 + rough * fbm(x, z, 9, seed))
            if d > edge:
                continue
            f.set_ground(x, z, y, block)


def bridge(f, x1, z1, x2, z2, y, block, width=3):
    steps = int(max(abs(x2 - x1), abs(z2 - z1))) + 1
    for i in range(steps + 1):
        t = i / max(1, steps)
        x = round(x1 + (x2 - x1) * t)
        z = round(z1 + (z2 - z1) * t)
        for dx in range(-(width // 2), width // 2 + 1):
            for dz in range(-(width // 2), width // 2 + 1):
                if abs(dx) + abs(dz) > width // 2 + 1:
                    continue
                f.set_ground(x + dx, z + dz, y, block)


def roof(f, block, y, thickness=2):
    """屋内マップの蓋"""
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            for i in range(thickness):
                f.put(x, y + i, z, block)


def clearing(f, cx, cz, radius, y=None):
    """平らにならす（湧く場所・ポータルの前）"""
    base = y if y is not None else (f.ground(cx, cz) or GROUND)
    for x in range(cx - radius, cx + radius + 1):
        for z in range(cz - radius, cz + radius + 1):
            if math.hypot(x - cx, z - cz) > radius:
                continue
            if f.ground(x, z) is None:
                continue
            f.set_ground(x, z, base, f.s[x - X1][z - Z1])
            for yy in range(base + 1, base + 6):
                f.extra.pop((x, yy, z), None)
    return base


def portal(f, frame="obsidian"):
    """**奥の端に必ず置く**（`02-map.md` 4 章）"""
    z = PORTAL_Z
    y = f.ground(0, z)
    if y is None:
        # 足場が無ければ作る
        disc(f, 0, z, 6, GROUND, frame)
        y = GROUND
    y = clearing(f, 0, z, 5, y)
    for dx in (-2, 2):
        for dy in range(1, 6):
            f.put(dx, y + dy, z, frame)
    for dx in range(-2, 3):
        f.put(dx, y + 5, z, frame)
        f.put(dx, y, z, frame)
    for dx in (-1, 0, 1):
        for dy in range(1, 5):
            f.put(dx, y + dy, z, "pve_v3:portal")


def spawn_pad(f, block="grass"):
    y = f.ground(0, SPAWN_Z)
    if y is None:
        disc(f, 0, SPAWN_Z, 7, GROUND, block)
        y = GROUND
    clearing(f, 0, SPAWN_Z, 6, y)


# ---------------------------------------------------------------- 20 枚

def m_basin(f, s):
    rolling(f, s, "grass", amp=2, scale=26)
    rim(f, s, "stone", height=18, inner=30)
    scatter(f, s + 1, 0.012, lambda f, x, y, z: pillar(f, x, z, y + 1, y + 2 + int(rnd(x, z, s) * 3), "cobblestone"))
    scatter(f, s + 2, 0.02, lambda f, x, y, z: f.put(x, y + 1, z, "short_grass"))


def m_drylake(f, s):
    rolling(f, s, "mud", amp=1.2, scale=30)
    scatter(f, s + 1, 0.03, lambda f, x, y, z: f.put(x, y + 1, z, "coarse_dirt"))
    scatter(f, s + 2, 0.006, lambda f, x, y, z: pillar(f, x, z, y + 1, y + 2, "spruce_log"))
    scatter(f, s + 3, 0.01, lambda f, x, y, z: f.put(x, y + 1, z, "dead_bush"))


def m_frozen(f, s):
    flat(f, "packed_ice", GROUND)
    # **割れ目**——低くして水を入れる
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            v = fbm(x, z, 17, s, 4)
            if 0.47 < v < 0.53:
                f.set_ground(x, z, GROUND - 5, "water")
    liquid(f, GROUND - 1, "water")
    scatter(f, s + 1, 0.008, lambda f, x, y, z: pillar(f, x, z, y + 1, y + 3, "blue_ice"))


def m_lavaisle(f, s):
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            f.set_ground(x, z, GROUND - 6, "lava")
    spots = [(0, -40), (0, 42), (-22, -14), (24, -10), (-26, 16), (22, 18), (0, 4), (-8, 30), (10, -28)]
    for i, (cx, cz) in enumerate(spots):
        disc(f, cx, cz, 11 + (i % 3) * 3, GROUND, "blackstone", seed=s + i)
    for i in range(len(spots) - 1):
        bridge(f, spots[i][0], spots[i][1], spots[i + 1][0], spots[i + 1][1], GROUND, "polished_blackstone", 3)
    scatter(f, s + 1, 0.02, lambda f, x, y, z: f.put(x, y + 1, z, "magma"), keep_center=True)


def m_dunes(f, s):
    rolling(f, s, "sand", amp=5, scale=18)
    for i in range(6):
        x = -34 + i * 14
        for z in range(-30, 31):
            if rnd(x, z, s + i) < 0.35:
                continue
            y = f.ground(x, z) or GROUND
            for dy in range(1, 4 + int(rnd(x, z, s) * 4)):
                f.put(x, y + dy, z, "sandstone")
    scatter(f, s + 2, 0.01, lambda f, x, y, z: pillar(f, x, z, y + 1, y + 5, "cut_sandstone"))


def m_shallows(f, s):
    flat(f, "prismarine", GROUND - 1)
    liquid(f, GROUND, "water")
    for gx in range(-4, 5):
        for gz in range(-4, 5):
            x, z = gx * 9, gz * 9
            if abs(x) < 4 and (z < SPAWN_Z + 8 or z > PORTAL_Z - 8):
                continue
            pillar(f, x, z, GROUND, GROUND + 7, "dark_prismarine", r=1)
    scatter(f, s, 0.004, lambda f, x, y, z: f.put(x, y + 1, z, "sea_lantern"))


def m_glade(f, s):
    rolling(f, s, "grass", amp=2, scale=24)
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            d = math.hypot(x, z)
            if d < 26:
                continue
            if rnd(x, z, s) > 0.06 + (d - 26) * 0.004:
                continue
            y = f.ground(x, z)
            if y is not None:
                tree(f, x, y, z, "oak_log", "oak_leaves", 7, 3)
    scatter(f, s + 1, 0.03, lambda f, x, y, z: f.put(x, y + 1, z, "short_grass"))


def m_bamboo(f, s):
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            step = 0 if z < -16 else (1 if z < 16 else 2)
            f.set_ground(x, z, GROUND + step * 5 + (fbm(x, z, 20, s) - 0.5) * 2, "podzol")
    scatter(f, s + 1, 0.10, lambda f, x, y, z: pillar(f, x, z, y + 1, y + 6 + int(rnd(x, z, s) * 5), "bamboo", r=0))
    scatter(f, s + 2, 0.02, lambda f, x, y, z: f.put(x, y + 1, z, "moss_carpet"))


def m_ruinvill(f, s):
    flat(f, "grass_path", GROUND)
    for gx in range(-3, 4):
        for gz in range(-3, 4):
            cx, cz = gx * 13, gz * 13
            if abs(cx) < 6 and (cz < SPAWN_Z + 10 or cz > PORTAL_Z - 10):
                continue
            w = 4 + int(rnd(cx, cz, s) * 3)
            hgt = 4 + int(rnd(cx, cz, s + 1) * 4)
            for x in range(cx - w, cx + w + 1):
                for z in range(cz - w, cz + w + 1):
                    edge = x in (cx - w, cx + w) or z in (cz - w, cz + w)
                    if not edge:
                        continue
                    for y in range(1, hgt + 1):
                        if rnd(x + y, z, s + 2) < 0.18:
                            continue
                        f.put(x, GROUND + y, z, "cobblestone" if y < hgt - 1 else "mossy_cobblestone")


def m_courtyard(f, s):
    flat(f, "stone_bricks", GROUND)
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            if max(abs(x), abs(z)) < 24 or max(abs(x), abs(z)) > 34:
                continue
            if abs(x) < 5 and (z < SPAWN_Z + 10 or z > PORTAL_Z - 10):
                continue
            if 26 < max(abs(x), abs(z)) < 32 and (x % 6 != 0 and z % 6 != 0):
                for y in range(1, 9):
                    f.put(x, GROUND + y, z, "air")
                continue
            for y in range(1, 10):
                f.put(x, GROUND + y, z, "chiseled_stone_bricks" if y == 9 else "stone_bricks")


def m_cavern(f, s):
    rolling(f, s, "deepslate", amp=3, scale=20)
    scatter(f, s + 1, 0.015, lambda f, x, y, z: pillar(f, x, z, y + 1, GROUND + 22, "cobbled_deepslate", r=2))
    scatter(f, s + 2, 0.004, lambda f, x, y, z: f.put(x, y + 1, z, "deepslate_iron_ore"))
    roof(f, "deepslate", GROUND + 24, 2)


def m_netherspan(f, s):
    bridge(f, 0, SPAWN_Z - 8, 0, PORTAL_Z + 6, GROUND, "nether_bricks", 9)
    for cz in (-24, -6, 14, 32):
        disc(f, 0, cz, 13, GROUND, "nether_bricks", seed=s + cz, rough=0.15)
    for cz in (-16, 6, 24):
        for sx in (-1, 1):
            bridge(f, 0, cz, sx * 26, cz + 6, GROUND, "cracked_nether_bricks", 5)
            disc(f, sx * 26, cz + 6, 7, GROUND, "nether_bricks", seed=s + cz)
    scatter(f, s + 1, 0.02, lambda f, x, y, z: pillar(f, x, z, y + 1, y + 4, "nether_bricks", r=0))


def m_skyisles(f, s):
    spots = [(0, -40, 12), (0, 42, 10), (-20, -18, 11), (20, -14, 9), (-24, 10, 12),
             (22, 14, 10), (0, 2, 14), (-10, 28, 8), (12, 30, 9), (-32, -2, 7), (32, 0, 7)]
    for i, (cx, cz, r) in enumerate(spots):
        y = GROUND + int((fbm(cx, cz, 30, s) - 0.5) * 10)
        disc(f, cx, cz, r, y, "grass", seed=s + i, rough=0.35)
        for x in range(cx - r - 2, cx + r + 3):
            for z in range(cz - r - 2, cz + r + 3):
                if f.ground(x, z) == y and rnd(x, z, s) < 0.25:
                    f.put(x, y + 1, z, "short_grass")
    for i in range(len(spots) - 1):
        a, b = spots[i], spots[i + 1]
        ya = f.ground(a[0], a[1]) or GROUND
        bridge(f, a[0], a[1], b[0], b[1], ya, "oak_planks", 3)


def m_spire(f, s):
    towers = [(0, -40, 9), (0, 42, 9), (-22, -16, 7), (24, -12, 7),
              (-24, 14, 7), (22, 16, 7), (0, 0, 10)]
    for i, (cx, cz, r) in enumerate(towers):
        top = GROUND + 6 + (i % 4) * 7
        disc(f, cx, cz, r, top, "quartz_block", seed=s + i, rough=0.15)
        pillar(f, cx, cz, 0, top - 1, "smooth_quartz", r=r - 3)
    for i in range(len(towers) - 1):
        a, b = towers[i], towers[i + 1]
        ya = f.ground(a[0], a[1]) or GROUND
        yb = f.ground(b[0], b[1]) or GROUND
        steps = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])))
        for k in range(steps + 1):
            t = k / max(1, steps)
            x = round(a[0] + (b[0] - a[0]) * t)
            z = round(a[1] + (b[1] - a[1]) * t)
            y = round(ya + (yb - ya) * t)
            for dx in (-1, 0, 1):
                f.set_ground(x + dx, z, y, "smooth_quartz")


def m_reef(f, s):
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            f.set_ground(x, z, GROUND - 7 + (fbm(x, z, 24, s) - 0.5) * 4, "gravel")
    for i in range(14):
        cx = int((rnd(i, 3, s) - 0.5) * 88)
        cz = int((rnd(i, 9, s + 1) - 0.5) * 88)
        disc(f, cx, cz, 5 + int(rnd(i, 1, s) * 7), GROUND + int(rnd(i, 5, s) * 3), "andesite", seed=s + i)
    bridge(f, 0, SPAWN_Z, 0, PORTAL_Z, GROUND, "spruce_planks", 5)
    liquid(f, GROUND - 1, "water")


def m_fungal(f, s):
    rolling(f, s, "mycelium", amp=2, scale=22)
    caps = [(-26, -20), (18, -24), (-14, 4), (26, 8), (-28, 26), (8, 30), (0, -4)]
    for i, (cx, cz) in enumerate(caps):
        y = (f.ground(cx, cz) or GROUND) + 9 + (i % 3) * 3
        pillar(f, cx, cz, GROUND, y - 1, "mushroom_stem", r=2)
        for x in range(cx - 12, cx + 13):
            for z in range(cz - 12, cz + 13):
                if math.hypot(x - cx, z - cz) > 11:
                    continue
                f.put(x, y, z, "red_mushroom_block" if i % 2 == 0 else "brown_mushroom_block")


def m_scorched(f, s):
    rolling(f, s, "coarse_dirt", amp=2.5, scale=26)
    scatter(f, s + 1, 0.03, lambda f, x, y, z: f.set_ground(x, z, y, "black_concrete_powder"))
    for i in range(22):
        x = int((rnd(i, 2, s) - 0.5) * 84)
        z = int((rnd(i, 8, s + 3) - 0.5) * 84)
        y = f.ground(x, z) or GROUND
        run = 5 + int(rnd(i, 4, s) * 9)
        along_x = rnd(i, 6, s) < 0.5
        for k in range(run):
            f.put(x + (k if along_x else 0), y + 1, z + (0 if along_x else k), "stripped_dark_oak_log")
    scatter(f, s + 2, 0.01, lambda f, x, y, z: pillar(f, x, z, y + 1, y + 4, "dark_oak_log", r=0))


def m_snowgate(f, s):
    rolling(f, s, "snow", amp=1.8, scale=28)
    for x in range(-20, 21):
        for z in (-3, -2, 2, 3):
            for y in range(1, 8):
                if abs(x) < 4:
                    continue
                f.put(x, GROUND + y, z, "spruce_planks")
    for x in (-20, -8, 8, 20):
        pillar(f, x, 0, GROUND + 1, GROUND + 11, "spruce_log", r=1)
    scatter(f, s + 1, 0.012, lambda f, x, y, z: tree(f, x, y, z, "spruce_log", "birch_leaves", 6, 2))


def m_aqueduct(f, s):
    flat(f, "stone_bricks", GROUND)
    for x in range(X1, X2 + 1):
        for z in range(Z1, Z2 + 1):
            if abs(((z + 60) % 24) - 12) < 5:
                f.set_ground(x, z, GROUND - 4, "mossy_stone_bricks")
    liquid(f, GROUND - 1, "water")
    for gx in range(-4, 5):
        for gz in range(-4, 5):
            pillar(f, gx * 11, gz * 11, GROUND + 1, GROUND + 13, "stone_brick_wall", r=1)
    roof(f, "stone_bricks", GROUND + 15, 2)


def m_altar(f, s):
    flat(f, "blackstone", GROUND)
    for step in range(5):
        r = 30 - step * 6
        for x in range(-r, r + 1):
            for z in range(-r, r + 1):
                if max(abs(x), abs(z)) > r:
                    continue
                f.set_ground(x, z, GROUND + step * 3, "polished_blackstone" if step % 2 else "blackstone")
    for sx in (-1, 1):
        for sz in (-1, 1):
            pillar(f, sx * 7, sz * 7, GROUND + 12, GROUND + 22, "obsidian", r=1)
    scatter(f, s + 1, 0.006, lambda f, x, y, z: f.put(x, y + 1, z, "gilded_blackstone"))


MAPS = {
    "basin": (m_basin, "grass"),
    "drylake": (m_drylake, "mud"),
    "frozen": (m_frozen, "packed_ice"),
    "lavaisle": (m_lavaisle, "blackstone"),
    "dunes": (m_dunes, "sand"),
    "shallows": (m_shallows, "prismarine"),
    "glade": (m_glade, "grass"),
    "bamboo": (m_bamboo, "podzol"),
    "ruinvill": (m_ruinvill, "grass_path"),
    "courtyard": (m_courtyard, "stone_bricks"),
    "cavern": (m_cavern, "deepslate"),
    "netherspan": (m_netherspan, "nether_bricks"),
    "skyisles": (m_skyisles, "grass"),
    "spire": (m_spire, "quartz_block"),
    "reef": (m_reef, "andesite"),
    "fungal": (m_fungal, "mycelium"),
    "scorched": (m_scorched, "coarse_dirt"),
    "snowgate": (m_snowgate, "snow"),
    "aqueduct": (m_aqueduct, "stone_bricks"),
    "altar": (m_altar, "blackstone"),
}


# ---------------------------------------------------------------- 休憩所

def m_rest(f, s):
    """休憩所。**戦う場所ではない**——見通しがよく、迷わないこと。

    **見た目も構造も、毎回同じ**（2026-09-04 決定）。戦場だけが変わる。

    ```
                奥（＋z）
        ┌──────[ ポータル ]──────┐
        │  強化4  ショップ  強化4 │   z ＝ +14
        │   宝  箱  3  つ         │   z ＝ +7
        │        ▲ 立つ所         │   0, 0（＝ -2000, 0, -2000）
        └────────────────────────┘
                手前（−z）
    ```
    """
    HALL = 20
    flat(f, "grass", GROUND - 1)
    for x in range(-HALL, HALL + 1):
        for z in range(-HALL, HALL + 1):
            f.set_ground(x, z, GROUND, "smooth_stone" if (x + z) % 2 else "polished_andesite")

    # ---- 囲い（奥の中央だけ開けてポータルを通す）
    for x in range(-HALL, HALL + 1):
        for z in (-HALL, HALL):
            if z == HALL and abs(x) < 4:
                continue
            pillar(f, x, z, GROUND + 1, GROUND + 6, "stone_bricks", r=0)
    for z in range(-HALL, HALL + 1):
        for x in (-HALL, HALL):
            pillar(f, x, z, GROUND + 1, GROUND + 6, "stone_bricks", r=0)

    # ---- 柱
    for sx in (-1, 1):
        for sz in (-1, 1):
            pillar(f, sx * 15, sz * 15, GROUND + 1, GROUND + 10, "stone_brick_wall", r=1)

    # ---- 立つ所（手前・中央）。**目印を敷く**
    for x in range(-3, 4):
        for z in range(-3, 4):
            f.set_ground(x, z, GROUND, "polished_blackstone")

    # ---- 宝箱 3 つ（モーション強化の 3 択）。**正面を向いたとき、横に並ぶ**
    for dx in (-5, 0, 5):
        f.put(dx, GROUND + 1, 7, "barrel")
        f.set_ground(dx, 7, GROUND, "chiseled_stone_bricks")

    # ---- その奥。**ショップが中央、強化 4 つが左右に 2 つずつ**
    for dx in (-11, -7, 7, 11):
        f.put(dx, GROUND + 1, 14, "smithing_table")
        f.put(dx, GROUND + 2, 14, "lantern")
    f.put(0, GROUND + 1, 14, "barrel")
    f.put(-1, GROUND + 1, 14, "barrel")
    f.put(1, GROUND + 1, 14, "barrel")
    for x in range(-13, 14):
        f.set_ground(x, 14, GROUND, "polished_andesite")

    # ---- 奥のポータル（全員入れば出発）
    pz = 18
    for dx in (-2, 2):
        for dy in range(1, 6):
            f.put(dx, GROUND + dy, pz, "obsidian")
    for dx in range(-2, 3):
        f.put(dx, GROUND + 5, pz, "obsidian")
    for dx in (-1, 0, 1):
        for dy in range(1, 5):
            f.put(dx, GROUND + dy, pz, "pve_v3:portal")

    scatter(f, s, 0.002, lambda f, x, y, z: f.put(x, y + 1, z, "lantern"), keep_center=False)


# ---------------------------------------------------------------- 実行

def build(name, seed):
    f = Field()
    if name == "rest":
        m_rest(f, seed)
        return f
    gen, pad = MAPS[name]
    gen(f, seed)
    spawn_pad(f, pad)
    portal(f)
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", nargs="?", help="マップ id（`02-map.md` 5 章）または rest")
    ap.add_argument("--all", action="store_true", help="20 枚 ＋ 休憩所を全部")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--scene", help="出す先（1 枚のとき）")
    ap.add_argument("--dir", default="out/pve3-map", help="出す先のフォルダ（--all のとき）")
    args = ap.parse_args()

    names = list(MAPS) + ["rest"] if args.all else [args.name]
    if names == [None]:
        ap.error("マップ id か --all が要る")
    for name in names:
        if name != "rest" and name not in MAPS:
            print("知らないマップ:", name)
            return 1
        f = build(name, args.seed)
        out = args.scene if (args.scene and not args.all) else os.path.join(args.dir, name + ".json")
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        with io.open(out, "w", encoding="utf-8") as fp:
            json.dump(f.scene(), fp)
        print("作った:", name, "->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
