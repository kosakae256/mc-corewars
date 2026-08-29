"""弓 1 本ごとの音を作る（**軌跡 48 ＋ 能力 48**）。

    python tools/pve-weapon-sounds.py worlds/pve/packs/pve

仕様は `docs/spec/16-feedback.md` 3-1、一覧は `docs/spec/19-weapons.md`。
**出どころは `tools/pve_weapon_table.py`。**

## 使い回しをやめた（2026-08-29）

軌跡の音は 2 種類、能力の音は 5 種類を回していた。
**「弓ごとに違う音」と書いておきながら、そうなっていなかった。**

| 何で変わるか | どう変わるか |
| --- | --- |
| `hue` | **高さ**（色の輪をそのまま音階に写す） |
| `mat` | **音色**（木＝鈍い / 鋼＝金属 / 水晶＝澄む / 骨＝掠れる / 黒鉄＝低い） |
| `base` | **重さ**（強い弓ほど低く、長く） |
| `ability` | **癖**（爆ぜる・抜ける・溜める・散る…） |

**放つ音は変えない**（バニラ共通。`docs/spec/13-bow-view.md` 3-1）。
"""

import io
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pve_weapon_table import weapons  # noqa: E402

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
OUT = os.path.join(ROOT, "resource_packs", "pve", "sounds", "pve", "w")
DEFS = os.path.join(ROOT, "resource_packs", "pve", "sounds", "sound_definitions.json")
os.makedirs(OUT, exist_ok=True)

RATE = 44100


def decay(n, tail):
    return np.exp(-(np.arange(n) / RATE) / tail)


def noise(n, rng):
    return rng.uniform(-1.0, 1.0, n)


def onepole(x, cut, high=False):
    a = np.exp(-2.0 * np.pi * cut / RATE)
    y = np.empty_like(x)
    prev = 0.0
    prev_x = 0.0
    for i, v in enumerate(x):
        if high:
            prev = a * (prev + v - prev_x)
            prev_x = v
        else:
            prev = a * prev + (1 - a) * v
        y[i] = prev
    return y


def norm(x, peak):
    m = float(np.max(np.abs(x))) or 1.0
    return (x / m * peak).astype(np.float32)


def attack(x, ms):
    n = max(1, int(RATE * ms / 1000))
    r = np.ones(len(x))
    r[:n] = np.linspace(0, 1, n)
    return x * r


def base_freq(hue: int, heavy: float) -> float:
    """**色を音の高さに写す。** 重い弓ほど低い"""
    return (240 + (hue % 360) / 360.0 * 520) / heavy


def trail_sound(w, rng):
    """飛んでいく音。**素材で音色、能力で癖**"""
    heavy = 0.85 + (w["base"] / 70) * 0.5
    life = {"common": 0.28, "uncommon": 0.32, "rare": 0.38, "legendary": 0.44}[w["rarity"]]
    n = int(RATE * life)
    t = np.arange(n) / RATE
    f0 = base_freq(w["hue"], heavy)
    mat = w["mat"]
    out = np.zeros(n)

    # ---- 風切り（どの弓にもある。素材で明るさが変わる）
    cut = {"wood": 1500.0, "steel": 2800.0, "crystal": 3400.0, "bone": 2000.0, "dark": 900.0}[mat]
    air = onepole(noise(n, rng), cut, high=True) * decay(n, life * 0.22)
    out += air * {"wood": 0.55, "steel": 0.8, "crystal": 0.6, "bone": 0.85, "dark": 0.5}[mat]

    # ---- 素材の芯
    if mat == "wood":
        out += np.sin(2 * np.pi * f0 * 0.55 * t) * decay(n, 0.05) * 0.6
    elif mat == "steel":
        for r, a in [(1.0, 0.5), (2.76, 0.3), (5.4, 0.15)]:
            out += np.sin(2 * np.pi * f0 * r * t) * decay(n, 0.10 / r) * a
    elif mat == "crystal":
        for r, a in [(1.0, 0.6), (2.0, 0.3), (3.0, 0.15), (4.2, 0.08)]:
            out += np.sin(2 * np.pi * f0 * r * t) * decay(n, 0.16 / r) * a
    elif mat == "bone":
        out += onepole(noise(n, rng), f0 * 3, high=True) * decay(n, 0.06) * 0.5
        out += np.sin(2 * np.pi * f0 * 1.5 * t) * decay(n, 0.04) * 0.25
    else:  # dark
        out += np.sin(2 * np.pi * f0 * 0.35 * t) * decay(n, 0.14) * 0.75
        out += onepole(noise(n, rng), 400.0) * decay(n, 0.10) * 0.5

    # ---- 能力の癖
    ab = w["ability"]
    if ab in ("spread3", "spread5", "twin_spiral", "quiver", "ward"):
        # **散る**：短い風切りを重ねる
        for k in range(3):
            at = int(RATE * 0.02 * (k + 1))
            ln = n - at
            out[at:] += onepole(noise(ln, rng), cut, high=True) * decay(ln, 0.03) * 0.35
    if ab in ("pierce_all", "pierce_line", "railgun"):
        # **抜ける**：高い方へ滑る
        out += np.sin(2 * np.pi * (f0 * 1.2 + f0 * 2.4 * (t / t[-1]) ** 1.6) * t) * decay(n, life * 0.4) * 0.35
    if ab in ("long_draw", "heavy_draw", "cannon", "meteor"):
        # **重い**：下へ落ちる唸り
        out += np.sin(2 * np.pi * (f0 * 0.5 * np.exp(-t * 3)) * t) * decay(n, life * 0.5) * 0.5
    if ab in ("explode_small", "firework", "mine", "brand"):
        # **爆ぜる予感**：終わりに低い塊
        at = int(n * 0.55)
        out[at:] += onepole(noise(n - at, rng), 700.0) * decay(n - at, 0.05) * 0.5
    if ab in ("starfall", "aurora", "light_pillar", "guardian", "ward", "heal_ally"):
        # **きらめき**：高い粒が散る
        for _ in range(4):
            at = int(RATE * rng.uniform(0.03, life * 0.7))
            ln = int(RATE * 0.06)
            if at + ln >= n:
                continue
            tt = np.arange(ln) / RATE
            out[at : at + ln] += np.sin(2 * np.pi * rng.uniform(2800, 6200) * tt) * decay(ln, 0.02) * 0.22
    if ab in ("time_stop", "blackhole", "root", "homing"):
        # **歪む**：うねらせる
        out *= 1.0 + 0.18 * np.sin(2 * np.pi * 6.5 * t)

    return norm(attack(out, 1.5), 0.55)


def ability_sound(w, rng):
    """固有能力が起きた音。**軌跡より低く、短く**"""
    heavy = 0.85 + (w["base"] / 70) * 0.5
    n = int(RATE * 0.42)
    t = np.arange(n) / RATE
    f0 = base_freq(w["hue"], heavy) * 0.6
    ab = w["ability"]
    out = np.zeros(n)

    if ab in ("explode_small", "firework", "cannon", "meteor", "mine", "brand"):
        out += onepole(noise(n, rng), 800.0) * decay(n, 0.10) * 1.0
        out += np.sin(2 * np.pi * (f0 * 0.5 * np.exp(-t * 7)) * t) * decay(n, 0.12) * 0.7
    elif ab in ("heal_ally", "light_pillar", "ward", "guardian", "aurora", "heal_on_kill"):
        for r, a in [(1.0, 0.7), (1.5, 0.45), (2.0, 0.25)]:
            out += np.sin(2 * np.pi * f0 * 2 * r * t) * decay(n, 0.20) * a
    elif ab in ("time_stop", "blackhole", "root"):
        for r, a in [(1.0, 0.7), (1.49, 0.35)]:
            out += np.sin(2 * np.pi * f0 * 2.2 * r * t) * decay(n, 0.28) * a
        out *= 1.0 + 0.2 * np.sin(2 * np.pi * 5.0 * t)
    elif ab in ("knock_far", "slam_down", "recoil", "pull"):
        out += np.sin(2 * np.pi * (f0 * 0.45 * np.exp(-t * 9)) * t) * decay(n, 0.08) * 1.0
        out += onepole(noise(n, rng), 600.0) * decay(n, 0.05) * 0.6
    elif ab in ("railgun", "pierce_all", "pierce_line"):
        out += np.sin(2 * np.pi * (f0 + f0 * 5 * (t / t[-1]) ** 2) * t) * decay(n, 0.14) * 0.8
        out += onepole(noise(n, rng), 3000.0, high=True) * decay(n, 0.04) * 0.5
    elif ab == "starfall":
        for f, a, tail in [(1860, 1.0, 0.10), (2790, 0.55, 0.075), (4650, 0.3, 0.05)]:
            out += np.sin(2 * np.pi * f * t) * decay(n, tail) * a
        out += onepole(noise(n, rng), 4000.0, high=True) * decay(n, 0.012) * 0.5
    else:
        # そのほか：**素材の音を短く**
        for r, a in [(1.0, 0.6), (2.0, 0.25)]:
            out += np.sin(2 * np.pi * f0 * 2 * r * t) * decay(n, 0.10) * a
        out += onepole(noise(n, rng), 2200.0, high=True) * decay(n, 0.03) * 0.35

    return norm(attack(out, 1.0), 0.5)


def main() -> int:
    ws = weapons()
    defs = json.load(io.open(DEFS, encoding="utf-8"))
    sd = defs["sound_definitions"]

    # 使い回していた分を外す（**残すと、どれが使われているか分からない**）
    for old in ["pve.trail.steel", "pve.trail.star", "pve.ability.bless", "pve.ability.slam",
                "pve.ability.boom", "pve.ability.beam", "pve.ability.chime"]:
        sd.pop(old, None)

    total = 0
    for w in ws:
        rng = np.random.default_rng(w["num"] * 977 + 13)
        for kind, make in (("trail", trail_sound), ("ability", ability_sound)):
            wave = make(w, rng)
            name = f'{kind}_{w["key"]}'
            sf.write(os.path.join(OUT, f"{name}.ogg"), wave, RATE, format="OGG", subtype="VORBIS")
            sd[f'pve.{kind}.{w["key"]}'] = {
                "category": "neutral",
                "sounds": [{"name": f"sounds/pve/w/{name}", "volume": 1.0, "is3D": True}],
            }
            total += 1

    json.dump(defs, io.open(DEFS, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1024
    print(f"音 {total} 個を書いた（{size:.0f} KB）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
