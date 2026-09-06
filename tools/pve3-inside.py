"""**中に立った目線で描く**（屋内マップ用）。

    python tools/pve3-inside.py out/ops.json --from 0,3,-44 --at 0,3,10 --out shot.png

**呼ぶのは `tools/pve3-map-view.mjs --inside`。** 直に叩くこともできる。

## なぜ要るのか

> ### 高さマップの描画では、屋内の中が写らない
>
>  は**柱のいちばん上**しか持たないので、
> **天井のあるマップは天井しか見えない**（2026-09-06 に気づいた）。
> **立体をそのまま持って、目から光線を飛ばす。**

| | |
| --- | --- |
| **明かり** | ランタン・シーランタン・グロウストーン・松明から**距離で減衰**させて撒く |
| **陰影** | 当たった面の向き（上向きを明るく）と、**目からの距離** |
| **色** |  の  をそのまま借りる |

**遅い。** 1 枚 1100 × 620 で数秒かかる。**枚数を撮るなら覚悟して呼ぶこと。**
"""
import argparse
import importlib.util
import json
import math
import os

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location("mcr", os.path.join("tools", "mc-render.py"))
mcr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mcr)
COLORS, FALLBACK = mcr.COLORS, mcr.FALLBACK

ap = argparse.ArgumentParser()
ap.add_argument("ops", help="手順を書き出した json")
ap.add_argument("--from", dest="cam", default="0,4,-46", help="目の位置 x,y,z")
ap.add_argument("--at", dest="look", default="0,4,10", help="見る先 x,y,z")
ap.add_argument("--out", default="worlds/pve-v3/preview/inside.png")
ap.add_argument("--size", default="1100x620")
ap.add_argument("--fov", type=float, default=75.0)
# **屋外は明かりが無いので真っ黒になる**（2026-09-06）。空の明るさを足せるようにした
ap.add_argument("--ambient", type=float, default=0.06, help="どこにも明かりが無い所の明るさ")
args = ap.parse_args()

ops = json.load(open(args.ops, encoding="utf-8"))
X0, X1 = -56, 56
Y0, Y1 = -34, 30
Z0, Z1 = -56, 56
NX, NY, NZ = X1 - X0 + 1, Y1 - Y0 + 1, Z1 - Z0 + 1
grid = np.zeros((NX, NY, NZ), dtype=np.uint16)
palette = ["air"]
index = {"air": 0}
for op in ops:
    b = op["block"]
    if b not in index:
        index[b] = len(palette); palette.append(b)
    bi = index[b] if b != "air" else 0
    a = op["at"] if op["kind"] == "set" else op["from"]
    c = op["at"] if op["kind"] == "set" else op["to"]
    x1, x2 = sorted((a["x"], c["x"])); y1, y2 = sorted((a["y"], c["y"])); z1, z2 = sorted((a["z"], c["z"]))
    x1 = max(x1, X0); x2 = min(x2, X1); y1 = max(y1, Y0); y2 = min(y2, Y1); z1 = max(z1, Z0); z2 = min(z2, Z1)
    if x1 > x2 or y1 > y2 or z1 > z2: continue
    grid[x1-X0:x2-X0+1, y1-Y0:y2-Y0+1, z1-Z0:z2-Z0+1] = bi

pal = np.array([COLORS.get(n, FALLBACK) for n in palette], dtype=np.float32)
unknown = sorted({n for n in palette if n not in COLORS})
if unknown: print("色未定:", unknown)

# **光るブロック**（2026-09-06 に `soul_lantern` / `shroomlight` などを追加）
EMIT = {
    "lantern": 15, "sea_lantern": 15, "glowstone": 15, "torch": 14,
    "soul_lantern": 10, "soul_torch": 10, "shroomlight": 15, "end_rod": 14,
    "magma": 3, "magma_block": 3, "lava": 15, "campfire": 15, "soul_campfire": 10,
}
solid = grid > 0
water_i = index.get("water", -1)
transp = np.isin(grid, [index.get(n, -1) for n in ("iron_bars", "chain", "lantern")])

# ---- 明かりの場。ランタンから距離で減衰させる
light = np.full((NX, NY, NZ), args.ambient, dtype=np.float32)
R = 14
kx, ky, kz = np.meshgrid(np.arange(-R, R+1), np.arange(-R, R+1), np.arange(-R, R+1), indexing="ij")
kern = np.clip(1.0 - np.sqrt(kx*kx + ky*ky + kz*kz) / R, 0, 1) ** 1.6
for name, lv in EMIT.items():
    i = index.get(name)
    if i is None: continue
    xs, ys, zs = np.nonzero(grid == i)
    for x, y, z in zip(xs, ys, zs):
        x1, x2 = max(0, x-R), min(NX, x+R+1); y1, y2 = max(0, y-R), min(NY, y+R+1); z1, z2 = max(0, z-R), min(NZ, z+R+1)
        light[x1:x2, y1:y2, z1:z2] += kern[x1-x+R:x2-x+R, y1-y+R:y2-y+R, z1-z+R:z2-z+R] * (lv / 15.0) * 0.55
np.clip(light, 0, 1.3, out=light)

def render(cam, look, out, size=(1100, 620), fov=75.0):
    W, H = size
    cam = np.array(cam, dtype=np.float64); look = np.array(look, dtype=np.float64)
    fwd = look - cam; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    ar = W / H
    th = math.tan(math.radians(fov) / 2)
    px = (np.arange(W) + 0.5) / W * 2 - 1
    py = 1 - (np.arange(H) + 0.5) / H * 2
    gx, gy = np.meshgrid(px, py)
    d = fwd[None, None, :] + right[None, None, :] * (gx * th * ar)[..., None] + up[None, None, :] * (gy * th)[..., None]
    d /= np.linalg.norm(d, axis=2, keepdims=True)
    d = d.reshape(-1, 3)
    N = d.shape[0]
    o = np.repeat(cam[None, :], N, axis=0)
    t = np.zeros(N); hit = np.zeros(N, dtype=np.int32)
    nrm = np.zeros((N, 3), dtype=np.float32); pos = np.zeros((N, 3), dtype=np.float32)
    alive = np.ones(N, dtype=bool)
    step = 0.16; far = 130.0
    prev = np.floor(o).astype(np.int64)
    while t.max() < far and alive.any():
        t[alive] += step
        p = o + d * t[:, None]
        ci = np.floor(p).astype(np.int64)
        ix = np.clip(ci[:, 0] - X0, 0, NX - 1); iy = np.clip(ci[:, 1] - Y0, 0, NY - 1); iz = np.clip(ci[:, 2] - Z0, 0, NZ - 1)
        oob = (ci[:, 0] < X0) | (ci[:, 0] > X1) | (ci[:, 1] < Y0) | (ci[:, 1] > Y1) | (ci[:, 2] < Z0) | (ci[:, 2] > Z1)
        v = grid[ix, iy, iz]
        h = alive & (v > 0) & ~oob
        if h.any():
            hit[h] = v[h]; pos[h] = p[h]
            diff = ci[h] - prev[h]
            n = np.zeros((diff.shape[0], 3), dtype=np.float32)
            ax = np.argmax(np.abs(diff), axis=1)
            n[np.arange(diff.shape[0]), ax] = -np.sign(diff[np.arange(diff.shape[0]), ax])
            nrm[h] = n
            alive[h] = False
        alive &= ~oob
        prev = ci
    col = pal[np.clip(hit, 0, len(pal) - 1)]
    ci = np.floor(pos).astype(np.int64)
    lx = np.clip(ci[:, 0] - X0, 0, NX - 1); ly = np.clip(ci[:, 1] - Y0, 0, NY - 1); lz = np.clip(ci[:, 2] - Z0, 0, NZ - 1)
    ax = np.clip(lx + nrm[:, 0].astype(np.int64), 0, NX - 1)
    ay = np.clip(ly + nrm[:, 1].astype(np.int64), 0, NY - 1)
    az = np.clip(lz + nrm[:, 2].astype(np.int64), 0, NZ - 1)
    lit = light[ax, ay, az]
    # 面の向きで陰影（上向きを明るく）
    face = 0.62 + 0.38 * np.clip(nrm[:, 1], 0, 1) + 0.12 * np.abs(nrm[:, 0])
    dist = np.linalg.norm(pos - cam[None, :], axis=1)
    head = 1.0 / (1.0 + (dist / 26.0) ** 1.7)
    bright = np.clip(lit * 1.25 + head * 0.9, 0.05, 1.35) * face
    emit = np.isin(hit, [index.get(n, -1) for n in EMIT])
    col = col * bright[:, None]
    col[emit] = pal[hit[emit]]
    col[hit == 0] = np.array([6, 7, 10], dtype=np.float32)
    img = np.clip(col.reshape(H, W, 3), 0, 255).astype(np.uint8)
    Image.fromarray(img).save(out)
    print("→", out)


W, H = (int(v) for v in args.size.lower().split("x"))
render(
    [float(v) for v in args.cam.split(",")],
    [float(v) for v in args.look.split(",")],
    args.out,
    size=(W, H),
    fov=args.fov,
)
