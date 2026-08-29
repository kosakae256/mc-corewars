"""音を作る。

    python tools/pve-sounds.py worlds/pve/packs/pve

仕様は `worlds/pve/docs/spec/16-feedback.md` 3 章。

## 自分で合成する

**バニラの音を借りると、他の場面と同じ音になって聞き分けられない。**
波形をこちらで組み立てて、**`.ogg` で書き出す**（Bedrock が読むのはこれ）。

| 音 | 何をしているか |
| --- | --- |
| **雷（ビリッ）** | **雑音を高い側へ寄せて、鋭く立ち上げてすぐ落とす** ＋ ぱちぱちと弾く粒 |
| **氷（パリン）** | **高い倍音を数本**、速く減衰させる ＋ **破片が遅れて鳴る** |

**どちらも短く、小さく。** 戦っている最中に何度も鳴るので、
**長い音・低い音は邪魔になる。**

## 必要なもの

```bash
python -m pip install soundfile numpy
```
"""

import os
import sys

import numpy as np
import soundfile as sf

ROOT = sys.argv[1] if len(sys.argv) > 1 else "worlds/pve/packs/pve"
OUT = os.path.join(ROOT, "resource_packs", "pve", "sounds", "pve")
os.makedirs(OUT, exist_ok=True)

RATE = 44100
RNG = np.random.default_rng(20260829)


def decay(n: int, tail: float) -> np.ndarray:
    """減衰の形。**tail が小さいほど速く消える**"""
    t = np.arange(n) / RATE
    return np.exp(-t / tail)


def noise(n: int) -> np.ndarray:
    return RNG.uniform(-1.0, 1.0, n)


def highpass(x: np.ndarray, cut: float) -> np.ndarray:
    """一次の高域通し。**低い唸りを落とす**"""
    a = np.exp(-2.0 * np.pi * cut / RATE)
    y = np.empty_like(x)
    prev_x = 0.0
    prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = a * (prev_y + v - prev_x)
        prev_x = v
        y[i] = prev_y
    return y


def lowpass(x: np.ndarray, cut: float) -> np.ndarray:
    a = np.exp(-2.0 * np.pi * cut / RATE)
    y = np.empty_like(x)
    prev = 0.0
    for i, v in enumerate(x):
        prev = a * prev + (1 - a) * v
        y[i] = prev
    return y


def attack(x: np.ndarray, ms: float) -> np.ndarray:
    """**立ち上がりだけ滑らかに**（頭の「プツ」を消す）"""
    n = max(1, int(RATE * ms / 1000))
    ramp = np.ones(len(x))
    ramp[:n] = np.linspace(0, 1, n)
    return x * ramp


def norm(x: np.ndarray, peak: float) -> np.ndarray:
    m = float(np.max(np.abs(x))) or 1.0
    return x / m * peak


def thunder_crack() -> np.ndarray:
    """ビリッ。**鋭く、短く**"""
    n = int(RATE * 0.30)
    body = highpass(noise(n), 1200.0) * decay(n, 0.045)
    # ぱちぱち（弾ける粒）
    for _ in range(9):
        at = RNG.integers(0, int(n * 0.6))
        ln = int(RATE * RNG.uniform(0.002, 0.010))
        seg = highpass(noise(ln), 2500.0) * decay(ln, 0.004)
        body[at : at + ln] += seg * RNG.uniform(0.4, 1.0)
    # 芯（少しだけ低い成分。近さを出す）
    body += lowpass(noise(n), 400.0) * decay(n, 0.020) * 0.35
    return norm(attack(body, 1.0), 0.75)


def ice_shatter() -> np.ndarray:
    """パリン。**高い倍音と、遅れて落ちる破片**"""
    n = int(RATE * 0.55)
    t = np.arange(n) / RATE
    out = np.zeros(n)
    # 割れる瞬間
    for f, amp, tail in [(2450, 1.0, 0.10), (3720, 0.8, 0.085), (5180, 0.6, 0.07), (6900, 0.4, 0.05)]:
        out += np.sin(2 * np.pi * f * t) * decay(n, tail) * amp
    out += highpass(noise(n), 3000.0) * decay(n, 0.03) * 0.9
    # 破片（少し遅れて、小さく）
    for _ in range(5):
        at = int(RATE * RNG.uniform(0.06, 0.34))
        ln = int(RATE * 0.12)
        if at + ln >= n:
            continue
        tt = np.arange(ln) / RATE
        f = RNG.uniform(4200, 8200)
        out[at : at + ln] += np.sin(2 * np.pi * f * tt) * decay(ln, 0.03) * RNG.uniform(0.12, 0.28)
    return norm(attack(out, 0.5), 0.7)


def trail_steel() -> np.ndarray:
    """鋼の矢が抜けていく音。**鋭い風切り ＋ わずかな金属の余韻**

    **発射音はバニラのまま**（`random.bow`）。**変えるのは飛んでいる音だけ**
    （`docs/spec/13-bow-view.md` 3-1）。
    """
    n = int(RATE * 0.38)
    t = np.arange(n) / RATE
    # 風切り：高い雑音が、少しずつ低く・小さくなる（遠ざかる）
    body = highpass(noise(n), 2600.0) * decay(n, 0.075)
    body = body * (1.0 - 0.35 * (t / t[-1]))
    # 金属の余韻
    for f, amp, tail in [(1650, 0.30, 0.13), (2480, 0.18, 0.09)]:
        body += np.sin(2 * np.pi * f * t) * decay(n, tail) * amp
    return norm(attack(body, 2.0), 0.55)


def trail_star() -> np.ndarray:
    """星屑の矢が抜けていく音。**風切り ＋ 後から散るきらめき**

    > **前は「上がっていく音」を大きく入れていた。**
    > **発射音そのものに聞こえて、弓を撃った感じが消えた**（2026-08-29 に直した）。
    > **頭は風切りだけ。** きらめきは**遅らせて、小さく散らす。**
    """
    n = int(RATE * 0.5)
    t = np.arange(n) / RATE
    # 風切り（鋼より柔らかく）
    out = highpass(noise(n), 2200.0) * decay(n, 0.085) * 0.8
    out = out * (1.0 - 0.4 * (t / t[-1]))
    # きらめきは**後から**、小さく
    for _ in range(7):
        at = int(RATE * RNG.uniform(0.10, 0.40))
        ln = int(RATE * 0.09)
        if at + ln >= n:
            continue
        tt = np.arange(ln) / RATE
        out[at : at + ln] += np.sin(2 * np.pi * RNG.uniform(3600, 7600) * tt) * decay(ln, 0.025) * 0.16
    return norm(attack(out, 2.0), 0.5)


def star_land() -> np.ndarray:
    """星が落ちた音。**短く高い鈴**（`docs/spec/12-stardust.md`）

    **5 つが続けて落ちる**ので、**長いと重なって濁る。**
    """
    n = int(RATE * 0.26)
    t = np.arange(n) / RATE
    out = np.zeros(n)
    for f, amp, tail in [(1860, 1.0, 0.10), (2790, 0.55, 0.075), (4650, 0.3, 0.05)]:
        out += np.sin(2 * np.pi * f * t) * decay(n, tail) * amp
    out += highpass(noise(n), 4000.0) * decay(n, 0.012) * 0.5
    return norm(attack(out, 0.4), 0.6)


def bow_charged() -> np.ndarray:
    """**ためきった合図**（`docs/spec/13-bow-view.md` 3-2）。

    **狩りの弓のような「キン」**。2 つの音が続けて鳴り、後の音が高い——
    **上がって終わる**と「用意ができた」に聞こえる。

    **短く、澄んだ音。** 引いている間ずっと鳴るものではない。
    """
    n = int(RATE * 0.34)
    t = np.arange(n) / RATE
    out = np.zeros(n)
    # 1 つ目（低い）
    for f, amp in [(880, 0.7), (1320, 0.3)]:
        out += np.sin(2 * np.pi * f * t) * decay(n, 0.055) * amp
    # 2 つ目（高い。少し遅れて）
    at = int(RATE * 0.075)
    tt = np.arange(n - at) / RATE
    for f, amp in [(1480, 0.8), (2220, 0.35), (2960, 0.15)]:
        out[at:] += np.sin(2 * np.pi * f * tt) * decay(n - at, 0.10) * amp
    # 澄ませる（頭の擦れを少しだけ）
    out += highpass(noise(n), 5000.0) * decay(n, 0.008) * 0.25
    return norm(attack(out, 1.0), 0.55)


def ability_bless() -> np.ndarray:
    """加護（**癒し・結界・聖水**）。柔らかく広がる和音"""
    n = int(RATE * 0.6)
    t = np.arange(n) / RATE
    out = np.zeros(n)
    for f, amp in [(660, 0.7), (990, 0.5), (1320, 0.35), (1980, 0.2)]:
        out += np.sin(2 * np.pi * f * t) * decay(n, 0.22) * amp
    return norm(attack(out, 8.0), 0.5)


def ability_slam() -> np.ndarray:
    """叩きつけ（**杭打ち・重力錘・反動**）。低く重い一撃"""
    n = int(RATE * 0.45)
    t = np.arange(n) / RATE
    out = np.sin(2 * np.pi * (150 * np.exp(-t * 9)) * t) * decay(n, 0.09) * 1.0
    out += lowpass(noise(n), 700.0) * decay(n, 0.05) * 0.8
    return norm(attack(out, 0.5), 0.75)


def ability_boom() -> np.ndarray:
    """爆発（**炸裂・花火・大砲・地雷・流星**）"""
    n = int(RATE * 0.7)
    t = np.arange(n) / RATE
    out = lowpass(noise(n), 900.0) * decay(n, 0.12) * 1.0
    out += highpass(noise(n), 2200.0) * decay(n, 0.035) * 0.7
    out += np.sin(2 * np.pi * (90 * np.exp(-t * 6)) * t) * decay(n, 0.13) * 0.6
    return norm(attack(out, 0.5), 0.8)


def ability_beam() -> np.ndarray:
    """光線（**レールガン**）。溜まって走る"""
    n = int(RATE * 0.55)
    t = np.arange(n) / RATE
    sweep = np.sin(2 * np.pi * (380 + 2400 * (t / t[-1]) ** 2.2) * t)
    out = sweep * decay(n, 0.16) * 0.8
    out += highpass(noise(n), 3000.0) * decay(n, 0.05) * 0.5
    return norm(attack(out, 2.0), 0.6)


def ability_chime() -> np.ndarray:
    """時・虚（**時詠み・黒穴**）。澄んだ余韻が長い"""
    n = int(RATE * 0.9)
    t = np.arange(n) / RATE
    out = np.zeros(n)
    for f, amp, tail in [(1180, 0.8, 0.34), (1770, 0.4, 0.26), (2360, 0.2, 0.18)]:
        out += np.sin(2 * np.pi * f * t) * decay(n, tail) * amp
    # わずかにうねらせる（時間が歪む感じ）
    out *= 1.0 + 0.10 * np.sin(2 * np.pi * 5.5 * t)
    return norm(attack(out, 3.0), 0.5)


SOUNDS = {
    "ability_bless": ability_bless,
    "ability_slam": ability_slam,
    "ability_boom": ability_boom,
    "ability_beam": ability_beam,
    "ability_chime": ability_chime,
    "bow_charged": bow_charged,
    "star_land": star_land,
    "thunder_crack": thunder_crack,
    "ice_shatter": ice_shatter,
    "trail_steel": trail_steel,
    "trail_star": trail_star,
}

for name, make in SOUNDS.items():
    wave = make().astype(np.float32)
    path = os.path.join(OUT, f"{name}.ogg")
    sf.write(path, wave, RATE, format="OGG", subtype="VORBIS")
    print(f"   {name}.ogg  （{len(wave) / RATE:.2f} 秒 / {os.path.getsize(path) / 1024:.0f} KB）")
print("できた")
