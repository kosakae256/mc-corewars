"""落雷を、**パラパラ漫画の粒**として書き出す（**手描き版**）。

> ### いま使っているのはこちらではない
>
> 実際の絵は **`tools/pve-bolt-from-gif.py`** が映像から切り出している
>（2026-08-29）。**この道具は、映像が使えないときのために残してある。**


    python tools/pve-bolt-flipbook.py worlds/pve/packs/pve

仕様は `worlds/pve/docs/spec/17-element.md` 5-7。

## なぜ作り直したか

**節を縦に繋いでいたが、雷に見えなかった。**
粒を並べても**点の列**にしかならず、**枝も折れも細かく描けない。**

> ### 1 本の雷を、**1 枚の絵**として描く。
> そして**パラパラ漫画（flipbook）で光らせる。**

| | |
| --- | --- |
| 絵 | **縦長 1 枚に、雷 1 本を丸ごと描く**（枝も含めて） |
| 動き | **4 コマ**。形は同じで**明るさと震えだけ変える**（本物の雷の明滅） |
| 形の種類 | **6 通り。** script がどれを出すか引く |

## GIF から作りたいとき

**GIF をそのまま粒にはできない**が、**コマを横に並べた 1 枚**にすれば同じこと
（`tools/gif-to-flipbook.py`）。**flipbook はそれを読む。**
"""

import io
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
RP = os.path.join(ROOT, "resource_packs", "pve")
TEX = os.path.join(RP, "textures", "particle")
PAR = os.path.join(RP, "particles")
for d in (TEX, PAR):
    os.makedirs(d, exist_ok=True)

# 1 コマの大きさ（絵）。**縦長**
FW, FH = 64, 256
FRAMES = 4
KINDS = 6


def bolt_path(rnd, kind):
    """上から下への折れ線。**種類ごとに癖を変える**"""
    # **節は少なく、振れは大きく。** 細かく振ると「うねった線」になり、ギザギザに見えない
    steps = 13
    amp = [9, 16, 12, 14, 19, 13][kind]     # 横へ振れる量
    drift = [0, 0, 0.5, -0.35, 0, 0.25][kind]  # 片側へ流れる癖
    x = FW / 2 + rnd.uniform(-4, 4)
    pts = []
    for i in range(steps + 1):
        t = i / steps
        y = FH * t
        # **上ほど大きく振れ、下は収束する**（着弾点を散らさない）
        span = amp * (1.0 - t * 0.65)
        # **左右へ交互に振る**（同じ側へ続けると、ただ流れた線になる）
        x += ((-1) ** i) * span * rnd.uniform(0.55, 1.0) + drift * 3.0
        x = max(6, min(FW - 6, x))
        pts.append((x, y))
    return pts


def branches(rnd, pts, kind):
    """枝。**種類によって本数を変える**"""
    count = [0, 1, 1, 2, 1, 2][kind]
    out = []
    for _ in range(count):
        i = rnd.randrange(3, max(4, len(pts) - 4))
        x, y = pts[i]
        dx = rnd.choice([-1, 1]) * rnd.uniform(3.5, 7.0)
        seg = [(x, y)]
        for k in range(rnd.randrange(4, 8)):
            x += dx + rnd.uniform(-2.5, 2.5)
            y += FH / 26 * rnd.uniform(0.7, 1.3)
            if y > FH:
                break
            seg.append((x, y))
        if len(seg) > 2:
            out.append(seg)
    return out


def draw_frame(kind: int, frame: int) -> Image.Image:
    """1 コマ。**芯（白）＋ にじみ（青白）** の 2 層"""
    rnd = random.Random(kind * 100 + 7)          # 形はコマ間で同じ
    pts = bolt_path(rnd, kind)
    brs = branches(rnd, pts, kind)

    jit = random.Random(kind * 100 + frame)      # **震えだけコマごとに変える**
    pts = [(x + jit.uniform(-1.2, 1.2), y) for x, y in pts]

    # **にじみは 1 層だけ、狭く。**
    #
    # 広くぼかすと、**薄い光の板**になって「背景がうっすら見える」ようになった
    #（2026-08-29 の直し）。**線の際だけ光らせる。**
    glow = Image.new("L", (FW, FH), 0)
    g = ImageDraw.Draw(glow)
    g.line(pts, fill=185, width=5)
    for b in brs:
        g.line(b, fill=120, width=3)
    glow = glow.filter(ImageFilter.GaussianBlur(2.0))

    core = Image.new("L", (FW, FH), 0)
    c = ImageDraw.Draw(core)
    # **細く。** 太いと「光の帯」になる
    c.line(pts, fill=255, width=2)
    for b in brs:
        c.line(b, fill=210, width=1)
    ex, ey = pts[-1]
    c.ellipse([ex - 4, ey - 6, ex + 4, ey + 2], fill=255)
    core = core.filter(ImageFilter.GaussianBlur(0.4))

    # **コマごとに明るさを変える。** 消えかけるコマを入れると雷らしくなる
    k = [1.0, 0.55, 0.9, 0.3][frame % 4]
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    px = img.load()
    gp = glow.load()
    cp = core.load()
    for y in range(FH):
        for x in range(FW):
            a = min(255, int((gp[x, y] * 0.65 + cp[x, y]) * k))
            # **薄い所は完全に消す。** 残すと**光の板**が見える
            if a <= 26:
                continue
            # **芯は白、外へ行くほど青**（本物の落雷の色）
            t = cp[x, y] / 255
            px[x, y] = (
                round(120 + 135 * t),
                round(175 + 80 * t),
                255,
                a,
            )
    return img


def particle(ident: str, texture: str) -> dict:
    """雷 1 本ぶんの粒。**パラパラ漫画を寿命に合わせて 1 周させる**"""
    return {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": ident,
                "basic_render_parameters": {"material": "particles_add", "texture": f"textures/particle/{texture}"},
            },
            "components": {
                "minecraft:emitter_local_space": {"position": False},
                "minecraft:emitter_rate_instant": {"num_particles": 1},
                "minecraft:emitter_lifetime_once": {"active_time": 0.05},
                "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
                "minecraft:particle_initial_speed": 0,
                # **出てすぐ消える。** 0.32 秒では「残っている」と言われた（2026-08-29）
                "minecraft:particle_lifetime_expression": {"max_lifetime": 0.13},
                "minecraft:particle_appearance_billboard": {
                    # **絵の縦横に合わせる**（1:4）。落ちる高さは script が決める
                    "size": [2.0, 8.0],
                    "facing_camera_mode": "lookat_y",
                    "uv": {
                        "texture_width": FW * FRAMES,
                        "texture_height": FH,
                        "flipbook": {
                            "base_UV": [0, 0],
                            "size_UV": [FW, FH],
                            "step_UV": [FW, 0],
                            "frames_per_second": 30,
                            "max_frame": FRAMES,
                            "stretch_to_lifetime": True,
                            "loop": False,
                        },
                    },
                },
            },
        },
    }


for kind in range(KINDS):
    sheet = Image.new("RGBA", (FW * FRAMES, FH), (0, 0, 0, 0))
    for f in range(FRAMES):
        sheet.alpha_composite(draw_frame(kind, f), (FW * f, 0))
    name = f"pve_bolt_{kind}"
    sheet.save(os.path.join(TEX, f"{name}.png"))
    with io.open(os.path.join(PAR, f"el_bolt_{kind}.json"), "w", encoding="utf-8") as fp:
        json.dump(particle(f"pve:el_bolt_{kind}", name), fp, indent=2, ensure_ascii=False)
    print("  ", f"{name}.png / el_bolt_{kind}.json")
print(f"できた（{KINDS} 通り × {FRAMES} コマ）")
