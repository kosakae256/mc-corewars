#!/usr/bin/env python
"""粒（particle）の定義を、ゲームを起動せずに絵にする。

    python tools/particle-preview.py <particle.json> [-o 出力.png] [--frames 8] [--seconds 1.0]

## なぜ要るのか

**粒は、書いてもその場では見えない。**
ゲームを起動し、ワールドへ入り、撃って、ようやく分かる——
**1 回の確認に数分かかる。**

> 見えないものを、勘で書き直すことになる。

**同じ計算をこちらで回して、静止画を並べる。**
色・大きさ・散り方・寿命が**その場で分かる。**

## 何を再現するか

**使っている分だけ。** 足りなくなったら足す。

| 部品 | 対応 |
| --- | --- |
| `emitter_rate_instant` | ○ |
| `emitter_shape_point` / `_sphere` / `_disc` | ○（`direction: outwards` と固定ベクトル） |
| `particle_initial_speed` | ○（数・式） |
| `particle_motion_dynamic` | ○（加速度・抗力） |
| `particle_lifetime_expression` | ○ |
| `particle_appearance_billboard.size` | ○（式も） |
| `particle_appearance_tinting.color.gradient` | ○ |
| テクスチャ | ○（`basic_render_parameters.texture` を読む） |
| `material: particles_add` | ○（**加算合成**で描く） |

**カメラは固定。** 横から見た図を、時間で並べる。

## 出力

**1 枚の PNG に、時間の進みを横へ並べる**（既定 8 コマ）。
各コマの左上に経過秒。**目盛りは 1 マス＝1 ブロック。**
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sys

from PIL import Image, ImageDraw

# ---------------------------------------------------------------- 式

_ALLOWED = re.compile(r"^[0-9+\-*/(). <>=?:a-zA-Z_]*$")


def molang(expr, t: float, life: float) -> float:
    """**使っている範囲だけ**の Molang もどき。

    `v.particle_age` と `v.particle_lifetime` だけを差し替えて評価する。
    """
    if isinstance(expr, (int, float)):
        return float(expr)
    s = str(expr)
    if not _ALLOWED.match(s):
        return 0.0
    s = s.replace("variable.particle_age", str(t)).replace("v.particle_age", str(t))
    s = s.replace("variable.particle_lifetime", str(life)).replace("v.particle_lifetime", str(life))
    # 残った変数は 1 として扱う（script から渡すもの）
    s = re.sub(r"\b(variable|v)\.[a-zA-Z_]+\b", "1", s)
    try:
        return float(eval(s, {"__builtins__": {}}, {"math": math}))  # noqa: S307
    except Exception:
        return 0.0


def pair(value, t: float, life: float) -> tuple[float, float]:
    if isinstance(value, list) and len(value) >= 2:
        return molang(value[0], t, life), molang(value[1], t, life)
    v = molang(value, t, life)
    return v, v


# ---------------------------------------------------------------- 定義を読む


class Particle:
    __slots__ = ("x", "y", "z", "vx", "vy", "vz", "life", "age")

    def __init__(self, pos, vel, life):
        self.x, self.y, self.z = pos
        self.vx, self.vy, self.vz = vel
        self.life = life
        self.age = 0.0


def load(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)["particle_effect"]


def gradient_color(tint, t: float):
    """`gradient` を線形に混ぜる。**割合は 0〜1**"""
    if tint is None:
        return (255, 255, 255, 255)
    g = tint.get("color", {})
    if isinstance(g, list):
        stops = [g]
    else:
        stops = g.get("gradient", [[1, 1, 1, 1]])
    if isinstance(stops, dict):  # {"0.0": [...], "1.0": [...]}
        keys = sorted(float(k) for k in stops)
        stops = [stops[str(k)] for k in keys]
    n = len(stops)
    if n == 1:
        c = stops[0]
    else:
        pos = max(0.0, min(1.0, t)) * (n - 1)
        i = int(pos)
        j = min(n - 1, i + 1)
        f = pos - i
        c = [stops[i][k] * (1 - f) + stops[j][k] * f for k in range(4)]
    return tuple(round(max(0.0, min(1.0, v)) * 255) for v in c)


def simulate(effect, seconds: float, fps: int = 30, seed: int = 7):
    """粒を進める。**戻すのは「コマごとの粒の一覧」**"""
    rnd = random.Random(seed)
    c = effect["components"]

    count = int(c.get("minecraft:emitter_rate_instant", {}).get("num_particles", 1))
    speed = c.get("minecraft:particle_initial_speed", 0)
    life_expr = c.get("minecraft:particle_lifetime_expression", {}).get("max_lifetime", 1.0)
    motion = c.get("minecraft:particle_motion_dynamic", {})
    accel = motion.get("linear_acceleration", [0, 0, 0])
    drag = float(motion.get("linear_drag_coefficient", 0))

    # 形
    sphere = c.get("minecraft:emitter_shape_sphere")
    disc = c.get("minecraft:emitter_shape_disc")
    point = c.get("minecraft:emitter_shape_point", {})

    parts: list[Particle] = []
    for _ in range(count):
        if sphere is not None:
            r = float(sphere.get("radius", 0.1)) * (rnd.random() ** (1 / 3))
            th = rnd.uniform(0, math.tau)
            ph = math.acos(2 * rnd.random() - 1)
            pos = (r * math.sin(ph) * math.cos(th), r * math.cos(ph), r * math.sin(ph) * math.sin(th))
            d = pos if any(pos) else (0, 1, 0)
        elif disc is not None:
            r = float(disc.get("radius", 0.1)) * math.sqrt(rnd.random())
            th = rnd.uniform(0, math.tau)
            pos = (r * math.cos(th), 0.0, r * math.sin(th))
            d = pos if any(pos) else (1, 0, 0)
        else:
            off = point.get("offset", [0, 0, 0])
            pos = tuple(molang(v, 0, 1) for v in off)
            d = point.get("direction", [0, 1, 0])
            d = tuple(molang(v, 0, 1) for v in d) if isinstance(d, list) else (0, 1, 0)
        ln = math.sqrt(sum(v * v for v in d)) or 1.0
        sp = molang(speed, 0, 1)
        vel = tuple(v / ln * sp for v in d)
        parts.append(Particle(pos, vel, molang(life_expr, 0, 1) or 1.0))

    dt = 1.0 / fps
    frames = []
    steps = max(1, int(seconds * fps))
    for step in range(steps):
        alive = []
        for p in parts:
            if p.age > p.life:
                continue
            alive.append((p.x, p.y, p.z, p.age / p.life if p.life else 1.0, p.life))
            p.vx += accel[0] * dt
            p.vy += accel[1] * dt
            p.vz += accel[2] * dt
            k = max(0.0, 1 - drag * dt)
            p.vx *= k
            p.vy *= k
            p.vz *= k
            p.x += p.vx * dt
            p.y += p.vy * dt
            p.z += p.vz * dt
            p.age += dt
        frames.append((step * dt, alive))
    return frames


# ---------------------------------------------------------------- 描く


def render(effect, path_out: str, rp_root: str, frames_n: int, seconds: float, size_px: int = 220, scale: float = 26):
    tex_name = effect["description"]["basic_render_parameters"].get("texture", "")
    tex_path = os.path.join(rp_root, tex_name + ".png")
    tex = Image.open(tex_path).convert("RGBA") if os.path.exists(tex_path) else None
    additive = "add" in effect["description"]["basic_render_parameters"].get("material", "")

    c = effect["components"]
    billboard = c.get("minecraft:particle_appearance_billboard", {})
    size_expr = billboard.get("size", [0.2, 0.2])
    tint = c.get("minecraft:particle_appearance_tinting")

    sim = simulate(effect, seconds)
    picks = [round(i * (len(sim) - 1) / max(1, frames_n - 1)) for i in range(frames_n)]

    sheet = Image.new("RGBA", (size_px * frames_n, size_px), (14, 14, 20, 255))
    for col, idx in enumerate(picks):
        t, alive = sim[idx]
        cell = Image.new("RGBA", (size_px, size_px), (0, 0, 0, 0))
        cx, cy = size_px / 2, size_px * 0.62

        # 目盛り（1 マス）
        g = ImageDraw.Draw(cell)
        for k in range(-3, 4):
            g.line([(cx + k * scale, 0), (cx + k * scale, size_px)], fill=(255, 255, 255, 12))
            g.line([(0, cy + k * scale), (size_px, cy + k * scale)], fill=(255, 255, 255, 12))

        for x, y, z, age, life in alive:
            w, h = pair(size_expr, age * life, life)
            pw = max(1, round(w * scale))
            ph = max(1, round(h * scale))
            col_rgba = gradient_color(tint, age)
            if tex is None:
                spr = Image.new("RGBA", (pw, ph), col_rgba)
            else:
                spr = tex.resize((pw, ph), Image.BILINEAR)
                tintimg = Image.new("RGBA", spr.size, col_rgba)
                spr = Image.composite(tintimg, spr, Image.new("L", spr.size, 255))
                a = tex.resize((pw, ph), Image.BILINEAR).getchannel("A").point(lambda v: v * col_rgba[3] // 255)
                spr.putalpha(a)
            px = round(cx + x * scale - pw / 2)
            py = round(cy - y * scale - ph / 2)
            if additive:
                region = cell.crop((px, py, px + pw, py + ph)).convert("RGBA")
                cell.paste(add_blend(region, spr), (px, py))
            else:
                cell.alpha_composite(spr, (px, py))

        d = ImageDraw.Draw(cell)
        d.text((6, 6), f"{t:0.2f}s  n={len(alive)}", fill=(230, 230, 240, 255))
        sheet.alpha_composite(cell, (col * size_px, 0))

    sheet.convert("RGB").save(path_out)
    return path_out


def add_blend(dst: Image.Image, src: Image.Image) -> Image.Image:
    """**加算合成。** `particles_add` の見え方に寄せる"""
    d = dst.load()
    s = src.load()
    out = Image.new("RGBA", dst.size)
    o = out.load()
    for y in range(dst.size[1]):
        for x in range(dst.size[0]):
            dr, dg, db, da = d[x, y]
            sr, sg, sb, sa = s[x, y]
            f = sa / 255
            o[x, y] = (
                min(255, round(dr + sr * f)),
                min(255, round(dg + sg * f)),
                min(255, round(db + sb * f)),
                max(da, sa),
            )
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="粒の定義を絵にする")
    ap.add_argument("json", help="particles/*.json")
    ap.add_argument("-o", "--out", help="出力 PNG")
    ap.add_argument("--frames", type=int, default=8)
    ap.add_argument("--seconds", type=float, default=0.0, help="0 なら寿命に合わせる")
    args = ap.parse_args()

    effect = load(args.json)
    # リソースパックの根（particles/ の 1 つ上）
    rp_root = os.path.dirname(os.path.dirname(os.path.abspath(args.json)))

    life = effect["components"].get("minecraft:particle_lifetime_expression", {}).get("max_lifetime", 1.0)
    seconds = args.seconds or (molang(life, 0, 1) or 1.0) * 1.15

    out = args.out or os.path.splitext(args.json)[0] + ".preview.png"
    render(effect, out, rp_root, args.frames, seconds)
    print(f"書いた: {out}  （{seconds:.2f} 秒 / {args.frames} コマ）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
