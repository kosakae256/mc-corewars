"""映像（GIF）から、落雷の粒を作る。

    python tools/pve-bolt-from-gif.py <入力.gif> worlds/pve/packs/pve

仕様は `worlds/pve/docs/spec/17-element.md` 5-7。

## やること

| | |
| --- | --- |
| **落雷を 1 本ずつ切り出す** | 暗いコマで区切る。**1 本＝1 種類**になる |
| **透かしを消す** | **暗い所を完全に切る。** 見本映像の背景に作者の印が入っていることがある |
| **黒を透明にする** | 明るさをそのまま不透明度にする（**加算合成と相性がよい**） |
| **縦長に切る** | 雷の周りだけ。**余白は光の板に見える** |
| **コマを横に並べる** | `flipbook` が順に映す（`tools/gif-to-flipbook.py` と同じ仕組み） |

**入力は使ってよいものだけ。** 見本映像には作者の印が入っている。
"""

import io
import json
import os
import sys

from PIL import Image, ImageSequence

SRC = sys.argv[1]
ROOT = sys.argv[2] if len(sys.argv) > 2 else "worlds/pve/packs/pve"
RP = os.path.join(ROOT, "resource_packs", "pve")
TEX = os.path.join(RP, "textures", "particle")
PAR = os.path.join(RP, "particles")
for d in (TEX, PAR):
    os.makedirs(d, exist_ok=True)

# 1 コマの大きさ（書き出し）
FW, FH = 64, 256

# 使うコマ数
FRAMES = 4

# **これより暗い所は消す。** 透かしと、うっすらした背景を落とす
CUT = 48

# 明るさがこれを超えたコマを「雷が出ている」とみなす
LIT = 110


def luminance(img: Image.Image) -> Image.Image:
    return img.convert("L")


frames = [f.convert("RGBA").copy() for f in ImageSequence.Iterator(Image.open(SRC))]
lums = [luminance(f) for f in frames]

# ---- 落雷ごとに切り分ける（暗いコマが区切り）
strikes: list[list[int]] = []
run: list[int] = []
for i, g in enumerate(lums):
    if g.point(lambda v: 255 if v > LIT else 0).getbbox() is None:
        if len(run) > 0:
            strikes.append(run)
            run = []
        continue
    run.append(i)
if len(run) > 0:
    strikes.append(run)

print(f"落雷 {len(strikes)} 本を見つけた")


def full_frames(idx: list[int]) -> list[int]:
    """**下まで届いているコマ**だけ使う（伸びている途中は使わない）"""
    h = frames[0].height
    out = []
    for i in idx:
        b = lums[i].point(lambda v: 255 if v > LIT else 0).getbbox()
        if b is not None and b[3] > h * 0.9:
            out.append(i)
    return out


def pick(idx: list[int], n: int) -> list[int]:
    if len(idx) <= n:
        return idx
    step = (len(idx) - 1) / (n - 1)
    return [idx[round(k * step)] for k in range(n)]


def cut_alpha(img: Image.Image) -> Image.Image:
    """**明るさを不透明度にする。** 暗い所は切り捨てる"""
    out = img.copy()
    px = out.load()
    w, h = out.size
    g = luminance(img).load()
    for y in range(h):
        for x in range(w):
            v = g[x, y]
            if v <= CUT:
                px[x, y] = (0, 0, 0, 0)
                continue
            a = round((v - CUT) / (255 - CUT) * 255)
            r, gg, b, _ = px[x, y]
            px[x, y] = (r, gg, b, a)
    return out


def particle(ident: str, texture: str) -> dict:
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
                # **出てすぐ消える**
                "minecraft:particle_lifetime_expression": {"max_lifetime": 0.16},
                "minecraft:particle_appearance_billboard": {
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


made = 0
for s_i, idx in enumerate(strikes):
    use = pick(full_frames(idx), FRAMES)
    if len(use) < 2:
        continue

    # ---- 雷の周りだけを、縦長に切る
    box = None
    for i in use:
        b = lums[i].point(lambda v: 255 if v > CUT else 0).getbbox()
        if b is None:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        continue
    pad = 6
    x0, y0, x1, y1 = max(0, box[0] - pad), max(0, box[1] - pad), min(frames[0].width, box[2] + pad), min(frames[0].height, box[3] + pad)
    # **縦横 1:4 に合わせる**（絵が歪まないように、足りないぶんは横へ広げる）
    h = y1 - y0
    want = h / 4
    if (x1 - x0) < want:
        cx = (x0 + x1) / 2
        x0, x1 = max(0, round(cx - want / 2)), min(frames[0].width, round(cx + want / 2))

    sheet = Image.new("RGBA", (FW * FRAMES, FH), (0, 0, 0, 0))
    for k in range(FRAMES):
        src = frames[use[min(k, len(use) - 1)]].crop((x0, y0, x1, y1))
        sheet.alpha_composite(cut_alpha(src).resize((FW, FH), Image.LANCZOS), (FW * k, 0))

    name = f"pve_bolt_{made}"
    sheet.save(os.path.join(TEX, f"{name}.png"))
    with io.open(os.path.join(PAR, f"el_bolt_{made}.json"), "w", encoding="utf-8") as fp:
        json.dump(particle(f"pve:el_bolt_{made}", name), fp, indent=2, ensure_ascii=False)
    print("  ", f"{name}.png / el_bolt_{made}.json  （元のコマ {use}）")
    made += 1

print(f"できた（{made} 通り × {FRAMES} コマ）")
print(f"→ `features/element/thunder.ts` の KINDS を {made} にすること")
