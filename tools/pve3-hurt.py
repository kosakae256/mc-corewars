"""被弾音を「自前」と「無音」に分ける。

    python tools/pve3-hurt.py

仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 10 章。

## なぜ分けるのか

> ### `damage` は要る。でも音は要らない
>
> **赤く光らせるのも、画面を揺らすのも、`damage`（＝バニラのダメージ）でしか出せない。**
> **ところが、そのたびにバニラの被弾音が鳴る。**
> **大ダメージの音と重なって、両方聞こえてしまう。**

**同じイベントで音だけ止めることはできない。** だから**分ける。**

| | |
| --- | --- |
| **`game.player.hurt`** | **無音の音を割り当てる。** バニラのダメージでは何も鳴らない |
| **`pve_v3:hurt`** | **自前の被弾音。** 鳴らしたいときだけ、script から鳴らす |

**これで「光らせるが鳴らさない」「鳴らすが光らせない」を別々に選べる。**

## 作るもの

| ファイル | 中身 |
| --- | --- |
| `sounds/pve3/silent.ogg` | **30 ミリ秒の無音。** 割り当て先が要るので置く |
| `sounds/pve3/hurt.ogg` | **自前の被弾音。** 低い衝撃 ＋ 短い当たり |

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
SOUNDS = os.path.join(PACK, "sounds", "pve3")
DEFS = os.path.join(PACK, "sounds", "sound_definitions.json")
MANIFEST = os.path.join(PACK, "manifest.json")

RATE = 44100
RNG = np.random.default_rng(20260907)

# **被弾音の作り。** 低い衝撃と、短い当たり
BODY_HZ = 190.0
BODY_BEND = 9.0
BODY_DECAY = 46.0
EDGE_HZ = 520.0
EDGE_DECAY = 150.0
EDGE_MIX = 0.45
CLICK = 0.30
CLICK_LOWPASS = 1800.0
LENGTH = 0.16
TARGET_RMS = 0.17


def lowpass(x, hz):
    a = 1.0 - np.exp(-2.0 * np.pi * hz / RATE)
    y = 0.0
    out = np.empty_like(x)
    for i, v in enumerate(x):
        y += a * (v - y)
        out[i] = y
    return out


def hurt():
    """**痛みの音。** 低い衝撃に、短い当たりを重ねる"""
    n = int(RATE * LENGTH)
    t = np.arange(n) / RATE
    # **沈んでいく低音**——殴られた重み
    f = BODY_HZ * np.exp(-t * BODY_BEND)
    body = np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * BODY_DECAY)
    # **その上に短い当たり**
    edge = np.sin(2 * np.pi * EDGE_HZ * t) * np.exp(-t * EDGE_DECAY) * EDGE_MIX
    # **頭に「ドッ」**。雑音は上を落として、高くならないように
    click = lowpass(RNG.normal(0, 1, n), CLICK_LOWPASS) * np.exp(-t * 700) * CLICK * 2.4
    x = np.tanh((body + edge + click) * 1.25)

    head = 32
    x[:head] *= np.linspace(0, 1, head)
    tail = int(RATE * 0.02)
    x[-tail:] *= np.linspace(1, 0, tail) ** 2
    rms = float(np.sqrt(np.mean(x**2))) or 1.0
    x = x * (TARGET_RMS / rms)
    peak = float(np.max(np.abs(x))) or 1.0
    if peak > 0.95:
        x = x / peak * 0.95
    return x


def put(name, data):
    os.makedirs(SOUNDS, exist_ok=True)
    p = os.path.join(SOUNDS, f"{name}.ogg")
    sf.write(p, data.astype(np.float32), RATE, format="OGG", subtype="VORBIS")
    return p


def main() -> int:
    silent = np.zeros(int(RATE * 0.03))
    p_silent = put("silent", silent)
    x = hurt()
    p_hurt = put("hurt", x)

    defs = {"format_version": "1.20.20", "sound_definitions": {}}
    if os.path.exists(DEFS):
        defs = json.loads(io.open(DEFS, encoding="utf-8").read())
    sd = defs.setdefault("sound_definitions", {})

    # > ### バニラの被弾音は**無音にする**
    # >
    # > **`damage` を使うたびに鳴るのを止める。**
    # > **鳴らしたいときは `pve_v3:hurt` を script から鳴らす。**
    sd["game.player.hurt"] = {
        "category": "player",
        "sounds": [{"name": "sounds/pve3/silent", "volume": 0.0, "is3D": False, "stream": False}],
    }
    sd["pve_v3:hurt"] = {
        "category": "player",
        "min_distance": 0.0,
        "max_distance": 128.0,
        "sounds": [{"name": "sounds/pve3/hurt", "volume": 1.0, "is3D": False, "stream": False}],
    }
    io.open(DEFS, "w", encoding="utf-8", newline="\n").write(json.dumps(defs, ensure_ascii=False, indent=2) + "\n")

    s = io.open(MANIFEST, encoding="utf-8").read()
    m = re.search(r"      1,\n      0,\n      (\d+)\n    \]", s)
    ver = None
    if m is not None:
        n = int(m.group(1)) + 1
        io.open(MANIFEST, "w", encoding="utf-8", newline="\n").write(
            s.replace(m.group(0), f"      1,\n      0,\n      {n}\n    ]", 1)
        )
        ver = f"1.0.{n}"

    spec = np.abs(np.fft.rfft(x))
    freq = np.fft.rfftfreq(len(x), 1 / RATE)
    print(f"kaita: {p_hurt}  {len(x) / RATE * 1000:.0f} ms")
    print(f"kaita: {p_silent}  30 ms（muon）")
    print(f"  game.player.hurt -> muon / pve_v3:hurt -> jibun")
    print(f"  jushin {float((spec * freq).sum() / spec.sum()):.0f} Hz")
    if ver:
        print(f"  resopa {ver}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
