"""実体モデル（`.geo.json`）を、**絵にして確かめる。**

    python tools/mc-geo-view.py <model.geo.json> <texture.png> --out shot.png
    python tools/mc-geo-view.py m.geo.json t.png --yaw 35 --pitch 18 --out shot.png
    python tools/mc-geo-view.py m.geo.json t.png --pose pose.json --out bite.png

## 何のためか

> ### ゲームに入れて、召喚して、回り込んで見る——これを 1 往復すると数分かかる
>
> **形の当たりは、こちらで見られる。**
> **骨に角度を付けて出せる**ので、**噛みつきや薙ぎ払いの姿勢も**確かめられる。

## どう描いているか

**箱の面を 1 枚ずつ、奥から順に塗る**（画家のアルゴリズム）。
投影は平行投影なので、**面ごとの UV を線形に配れば、そのまま貼れる。**

| | |
| --- | --- |
| 面の明るさ | 法線から作る（左上からの光） |
| 骨 | **親からの入れ子で回す**（回転の中心は `pivot`） |
| ポーズ | `--pose` に `{"骨名": [x, y, z], …}`（度） |

**箱 UV の並びは Blockbench と同じ**（上・下／東・北・西・南）。
"""

import argparse
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image


# ---------------------------------------------------------------- 行列

def rot_matrix(rx, ry, rz):
    """Minecraft の回転（度・XYZ の順）"""
    ax, ay, az = (math.radians(v) for v in (rx, ry, rz))
    cx, sx = math.cos(ax), math.sin(ax)
    cy, sy = math.cos(ay), math.sin(ay)
    cz, sz = math.cos(az), math.sin(az)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float64)
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float64)
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float64)
    return mz @ my @ mx


# ---------------------------------------------------------------- 面

# (法線, 4 隅の並び, 箱 UV の場所)
#   隅は (x, y, z) を size で 0/1 に置き換えたもの
# > ### 面の向きを直した（2026-09-05）
# >
# > **u は「箱を開いた順」に進む。** 東 → 北 → 西 → 南 と**箱の周りを一周する**ので、
# > **東の面は u が -Z（前）へ、西の面は +Z（後ろ）へ**進む——**左右で逆**。
# > 外から見て u が右・v が下、と言い換えても同じ。
# >
# > ここが逆だったので、**絵で描いた目の前後が、プレビューと実物で食い違っていた。**
# > 上下の面も**軸が転置**していた（u は X、v は Z）。
FACES = [
    ("up", (0, 1, 0), [(0, 1, 0), (1, 1, 0), (1, 1, 1), (0, 1, 1)], "up"),
    ("down", (0, -1, 0), [(0, 0, 1), (1, 0, 1), (1, 0, 0), (0, 0, 0)], "down"),
    ("east", (1, 0, 0), [(1, 1, 1), (1, 1, 0), (1, 0, 0), (1, 0, 1)], "east"),
    ("north", (0, 0, -1), [(1, 1, 0), (0, 1, 0), (0, 0, 0), (1, 0, 0)], "north"),
    ("west", (-1, 0, 0), [(0, 1, 0), (0, 1, 1), (0, 0, 1), (0, 0, 0)], "west"),
    ("south", (0, 0, 1), [(0, 1, 1), (1, 1, 1), (1, 0, 1), (0, 0, 1)], "south"),
]


def box_uv(u, v, dx, dy, dz, which):
    """箱 UV の 1 面ぶん（左上 x, y, 幅, 高さ）"""
    if which == "up":
        return u + dz, v, dx, dz
    if which == "down":
        return u + dz + dx, v, dx, dz
    if which == "east":
        return u, v + dz, dz, dy
    if which == "north":
        return u + dz, v + dz, dx, dy
    if which == "west":
        return u + dz + dx, v + dz, dz, dy
    return u + dz + dx + dz, v + dz, dx, dy


# UV の四隅（左上・右上・右下・左下）を、面の隅の並びに合わせる
UV_CORNERS = [(0, 0), (1, 0), (1, 1), (0, 1)]


# ---------------------------------------------------------------- 骨

def collect(geo, pose, only=None):
    """骨をたどって、面を集める。

    `only` を渡すと**その骨だけ**描く（頭に寄って見たいとき）。
    枠は描いたものに合わせるので、そのまま拡大になる。
    """
    model = geo["minecraft:geometry"][0]
    bones = model["bones"]
    by_name = {b["name"]: b for b in bones}

    def place(name, point):
        """モデル空間の点を、骨の回転を通して動かす"""
        chain = []
        cur = name
        while cur is not None:
            chain.append(cur)
            cur = by_name[cur].get("parent")
        p = np.array(point, dtype=np.float64)
        for bone_name in chain:
            bone = by_name[bone_name]
            pivot = np.array(bone.get("pivot", [0, 0, 0]), dtype=np.float64)
            rot = list(bone.get("rotation", [0, 0, 0]))
            extra = pose.get(bone_name)
            if extra is not None:
                rot = [rot[i] + extra[i] for i in range(3)]
            if rot != [0, 0, 0]:
                m = rot_matrix(*rot)
                p = m @ (p - pivot) + pivot
        return p

    faces = []
    for bone in bones:
        if only is not None and bone["name"] not in only:
            continue
        for c in bone.get("cubes", []):
            ox, oy, oz = c["origin"]
            dx, dy, dz = c["size"]
            inf = c.get("inflate", 0)
            ox, oy, oz = ox - inf, oy - inf, oz - inf
            dx, dy, dz = dx + 2 * inf, dy + 2 * inf, dz + 2 * inf
            uv = c.get("uv", [0, 0])
            for _, normal, corners, which in FACES:
                pts = []
                for cx, cy, cz in corners:
                    pts.append(place(bone["name"], (ox + cx * dx, oy + cy * dy, oz + cz * dz)))
                nrm = place(bone["name"], (0, 0, 0)) * 0
                # 法線は、面の 2 辺から作る（骨の回転が入った後の向き）
                e1 = pts[1] - pts[0]
                e2 = pts[3] - pts[0]
                nrm = np.cross(e2, e1)
                n = np.linalg.norm(nrm)
                if n > 1e-9:
                    nrm = nrm / n
                if isinstance(uv, dict):
                    # **面ごと UV**（`uv: {north: {uv, uv_size}, …}`）
                    face = uv.get(which)
                    if face is None:
                        continue
                    (ux, uy) = face["uv"]
                    (uw, uh) = face["uv_size"]
                else:
                    ux, uy, uw, uh = box_uv(uv[0], uv[1], dx, dy, dz, which)
                faces.append({"pts": pts, "normal": nrm, "uv": (ux, uy, uw, uh)})
    return faces


# ---------------------------------------------------------------- 描く

def render(faces, tex, size, yaw, pitch, out, bg=(226, 232, 238)):
    W, H = size
    cam = rot_matrix(pitch, yaw, 0)

    # 画面へ
    projected = []
    for f in faces:
        pts = [cam @ p for p in f["pts"]]
        projected.append({**f, "pts": pts, "depth": sum(p[2] for p in pts) / 4})

    xs = [p[0] for f in projected for p in f["pts"]]
    ys = [p[1] for f in projected for p in f["pts"]]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny) * 1.12
    scale = min(W, H) / span
    cx = (minx + maxx) / 2
    cy = (miny + maxy) / 2

    img = Image.new("RGB", (W, H), bg)
    px = img.load()
    zbuf = np.full((H, W), 1e9, dtype=np.float64)
    tw, th = tex.size
    tpx = tex.convert("RGBA").load()

    light = np.array([-0.45, 0.78, -0.44])
    light = light / np.linalg.norm(light)

    for f in sorted(projected, key=lambda f: -f["depth"]):
        pts = f["pts"]
        # **裏面も描く。** 面の向きは深さで決めるので、間引くと穴が空く
        nrm = f["normal"]
        if (cam @ nrm)[2] > 0:
            nrm = -nrm
        k = 0.55 + 0.45 * max(0.0, float(np.dot(nrm, light)))

        sp = []
        for p in pts:
            sx = (p[0] - cx) * scale + W / 2
            sy = H / 2 - (p[1] - cy) * scale
            sp.append((sx, sy, p[2]))

        ux, uy, uw, uh = f["uv"]
        tri = [(0, 1, 2), (0, 2, 3)]
        for a, b, c in tri:
            raster(px, zbuf, W, H, sp, [a, b, c], UV_CORNERS, (ux, uy, uw, uh), tpx, tw, th, k)

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    img.save(out)
    print("撮った:", out, f"yaw={yaw} pitch={pitch}")


def raster(px, zbuf, W, H, sp, idx, uvc, uvbox, tpx, tw, th, k):
    ux, uy, uw, uh = uvbox
    p0, p1, p2 = (sp[i] for i in idx)
    u0, u1, u2 = (uvc[i] for i in idx)
    minx = max(0, int(math.floor(min(p0[0], p1[0], p2[0]))))
    maxx = min(W - 1, int(math.ceil(max(p0[0], p1[0], p2[0]))))
    miny = max(0, int(math.floor(min(p0[1], p1[1], p2[1]))))
    maxy = min(H - 1, int(math.ceil(max(p0[1], p1[1], p2[1]))))
    denom = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
    if abs(denom) < 1e-9:
        return
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            fx, fy = x + 0.5, y + 0.5
            w0 = ((p1[1] - p2[1]) * (fx - p2[0]) + (p2[0] - p1[0]) * (fy - p2[1])) / denom
            w1 = ((p2[1] - p0[1]) * (fx - p2[0]) + (p0[0] - p2[0]) * (fy - p2[1])) / denom
            w2 = 1 - w0 - w1
            if w0 < -0.001 or w1 < -0.001 or w2 < -0.001:
                continue
            z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
            if z >= zbuf[y, x]:
                continue
            su = w0 * u0[0] + w1 * u1[0] + w2 * u2[0]
            sv = w0 * u0[1] + w1 * u1[1] + w2 * u2[1]
            tx = int(min(tw - 1, max(0, ux + su * uw - 0.001)))
            ty = int(min(th - 1, max(0, uy + sv * uh - 0.001)))
            r, g, b, a = tpx[tx, ty]
            if a < 32:
                continue
            zbuf[y, x] = z
            px[x, y] = (int(r * k), int(g * k), int(b * k))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("texture")
    ap.add_argument("--out", default="geo.png")
    ap.add_argument("--yaw", type=float, default=32)
    ap.add_argument("--pitch", type=float, default=14)
    ap.add_argument("--size", default="900x700")
    ap.add_argument("--pose", help="骨ごとの角度（JSON）")
    ap.add_argument("--only", help="この骨だけ描く（カンマ区切り）。**寄って見るのに使う**")
    args = ap.parse_args()

    with io.open(args.model, encoding="utf-8") as f:
        geo = json.load(f)
    pose = {}
    if args.pose:
        with io.open(args.pose, encoding="utf-8") as f:
            pose = json.load(f)
    tex = Image.open(args.texture)
    W, H = (int(v) for v in args.size.lower().split("x"))
    only = set(args.only.split(",")) if args.only else None
    faces = collect(geo, pose, only)
    render(faces, tex, (W, H), args.yaw, args.pitch, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
