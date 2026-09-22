"""弓が当たった音を作る。**ピピピ。**

    python tools/pve3-hitsound.py

仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 9 章。

## どんな音か

**軽くて、とても短い、3 つの粒。** 「ピピピ」。
**高い音にはしない**——毎秒 2 発当たるので、高いと耳に刺さる。

| | |
| --- | --- |
| **粒の数** | 3 つ |
| **高さ** | **620 → 570 → 520 Hz。** 少しずつ下がる（当たって沈む感じ） |
| **1 粒の長さ** | 14 ミリ秒 |
| **間隔** | 20 ミリ秒 |
| **全体** | **60 ミリ秒ほど。** 瞬きより短い |

## なぜ合成なのか

**借りてきた音は、他の場面と同じ音に聞こえる。**
**波形をこちらで組み立てれば、長さも高さも自由に決められる**——
`docs/research/` に残した通り、**Bedrock が読むのは `.ogg`** なので、そこまで書き出す。

## 必要なもの

```bash
python -m pip install soundfile numpy
```
"""

import io
import json
import os
import re

import numpy as np
import soundfile as sf

PACK = os.path.join("worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
OUT = os.path.join(PACK, "sounds", "pve3", "bow_hit.ogg")
DEFS = os.path.join(PACK, "sounds", "sound_definitions.json")
MANIFEST = os.path.join(PACK, "manifest.json")
NAME = "bow_hit"

RATE = 44100

# **粒の高さ（Hz）。** 少しずつ下がる。**高くしない**
HZ = (620.0, 570.0, 520.0)

# **1 粒の長さ（秒）**
BLIP_SEC = 0.014

# **粒どうしの間隔（秒）**
GAP_SEC = 0.020

# **減り方。** 大きいほど、ぱっと消える
DECAY = 190.0

# **当たりの「チッ」。** 頭に混ぜる雑音の強さ
CLICK = 0.22

# **雑音のこもり（Hz）。** これより上を落とす
#
# > ### 雑音をそのまま混ぜると、高い音になる
# >
# > **白い雑音は高い側に広がっている。** **落とさないと「ピピピ」が「チチチ」になる。**
CLICK_LOWPASS = 1400.0

# **狙う太さ。** 毎発鳴るので、小さめ
TARGET_RMS = 0.13


def blip(hz: float, rng: np.random.Generator) -> np.ndarray:
    """1 粒。**正弦に少しだけ倍音を足し、頭に雑音を混ぜる**"""
    n = int(RATE * BLIP_SEC)
    t = np.arange(n) / RATE
    env = np.exp(-t * DECAY)
    # **倍音を薄く**——正弦だけだと電子音になる
    wave = np.sin(2 * np.pi * hz * t) + 0.22 * np.sin(2 * np.pi * hz * 2 * t)
    # **頭の一瞬だけ雑音**。当たった「チッ」
    click = rng.normal(0, 1, n) * np.exp(-t * 900) * CLICK
    # **雑音の高い所を落とす**——そのままだと「チチチ」になる
    a = 1.0 - np.exp(-2.0 * np.pi * CLICK_LOWPASS / RATE)
    y = 0.0
    for i in range(n):
        y += a * (click[i] - y)
        click[i] = y * 2.2
    return (wave * env + click) * 0.5


def main() -> int:
    rng = np.random.default_rng(20260907)
    total = int(RATE * (GAP_SEC * (len(HZ) - 1) + BLIP_SEC + 0.02))
    out = np.zeros(total)
    for i, hz in enumerate(HZ):
        at = int(RATE * GAP_SEC * i)
        one = blip(hz, rng)
        # **後の粒ほど小さく**——尻すぼみのほうが軽く聞こえる
        out[at : at + len(one)] += one * (1.0 - 0.18 * i)

    # **軽く潰して角を丸める**
    out = np.tanh(out * 1.3)

    # **頭と尻を丸める**（ぶつっと切れないように）
    head = 32
    out[:head] *= np.linspace(0, 1, head)
    tail = int(RATE * 0.008)
    out[-tail:] *= np.linspace(1, 0, tail) ** 2

    rms = float(np.sqrt(np.mean(out**2))) or 1.0
    out = out * (TARGET_RMS / rms)
    peak = float(np.max(np.abs(out))) or 1.0
    if peak > 0.95:
        out = out / peak * 0.95

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, out.astype(np.float32), RATE, format="OGG", subtype="VORBIS")

    # ---- 登録。**必ず `is3D: false`**（`22-feedback.md` 1-1）
    defs = {"format_version": "1.20.20", "sound_definitions": {}}
    if os.path.exists(DEFS):
        defs = json.loads(io.open(DEFS, encoding="utf-8").read())
    defs.setdefault("sound_definitions", {})[f"pve_v3:{NAME}"] = {
        "category": "player",
        "min_distance": 0.0,
        "max_distance": 128.0,
        "sounds": [{"name": f"sounds/pve3/{NAME}", "volume": 1.0, "is3D": False, "stream": False}],
    }
    io.open(DEFS, "w", encoding="utf-8", newline="\n").write(json.dumps(defs, ensure_ascii=False, indent=2) + "\n")

    # ---- リソパの版を上げる（`docs/research/15-pack-delivery.md`）
    s = io.open(MANIFEST, encoding="utf-8").read()
    m = re.search(r"      1,\n      0,\n      (\d+)\n    \]", s)
    ver = None
    if m is not None:
        n = int(m.group(1)) + 1
        io.open(MANIFEST, "w", encoding="utf-8", newline="\n").write(
            s.replace(m.group(0), f"      1,\n      0,\n      {n}\n    ]", 1)
        )
        ver = f"1.0.{n}"

    spec = np.abs(np.fft.rfft(out))
    freq = np.fft.rfftfreq(len(out), 1 / RATE)
    cent = float((spec * freq).sum() / spec.sum())
    print(f"kaita: {OUT}  {len(out) / RATE * 1000:.0f} ms  {os.path.getsize(OUT)} byte")
    print(f"  namae  pve_v3:{NAME}（is3D: false）")
    print(f"  omosa  jushin {cent:.0f} Hz / futosa {float(np.sqrt(np.mean(out**2))):.3f}")
    if ver:
        print(f"  resopa {ver}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
