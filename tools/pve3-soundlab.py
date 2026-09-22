"""音の工房を組み立てる。**種になる音を作って、UI に埋め込む。**

    python tools/pve3-soundlab.py

**書き出すもの**: `tools/pve3-soundlab.html`（**そのまま開ける。中に音が入っている**）

仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 9 章。

## なぜ種から作るのか

**借りてきた音は使えない**（権利）。**合成なら、いくらでも作り直せる。**
**種を何種類か用意して、UI 側でいくらでも改造する**——
高さ・速さ・長さ・こもり・繰り返し・歪み・残響。

| 種 | どんな音 |
| --- | --- |
| `blip` | **ピッ。** 丸い電子音 |
| `tick` | **チッ。** 短い当たり |
| `thud` | **ドッ。** 低くて鈍い |
| `snap` | **パンッ。** 乾いた破裂 |
| `metal` | **キンッ。** 金属の余韻 |
| `wood` | **コッ。** 木を叩いた感じ |
| `pop` | **ポッ。** 空気が抜ける |
| `noise` | **シャッ。** 帯を絞った雑音 |

## 必要なもの

```bash
python -m pip install soundfile numpy
```
"""

import base64
import io
import os

import numpy as np

RATE = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(HERE, "pve3-soundlab.tpl.html")
OUT = os.path.join(HERE, "pve3-soundlab.html")

RNG = np.random.default_rng(20260907)


def env(n, decay):
    """減り方。**大きいほど、ぱっと消える**"""
    return np.exp(-np.arange(n) / RATE * decay)


def lowpass(x, hz):
    a = 1.0 - np.exp(-2.0 * np.pi * hz / RATE)
    y = 0.0
    out = np.empty_like(x)
    for i, v in enumerate(x):
        y += a * (v - y)
        out[i] = y
    return out


def tone(sec, hz, decay, harm=0.0, bend=0.0):
    """正弦（＋倍音）。**bend で高さが落ちていく**"""
    n = int(RATE * sec)
    t = np.arange(n) / RATE
    f = hz * np.exp(-t * bend)
    ph = 2 * np.pi * np.cumsum(f) / RATE
    return (np.sin(ph) + harm * np.sin(2 * ph)) * env(n, decay)


def noise(sec, decay, hz):
    n = int(RATE * sec)
    return lowpass(RNG.normal(0, 1, n), hz) * env(n, decay) * 3.0


def mix(*parts):
    """**長さの違うものを重ねる。** 短いほうは足りないぶんを 0 にする"""
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def norm(x, peak=0.9):
    p = float(np.max(np.abs(x))) or 1.0
    x = x / p * peak
    head = min(48, len(x) // 8)
    x[:head] *= np.linspace(0, 1, head)
    tail = min(len(x) // 3, int(RATE * 0.006))
    x[-tail:] *= np.linspace(1, 0, tail) ** 2
    return x


def bases():
    """**種になる音。** どれも 40〜160 ミリ秒"""
    out = {}
    out["blip"] = norm(mix(tone(0.045, 620, 120, 0.25), noise(0.045, 900, 1400) * 0.18))
    out["tick"] = norm(mix(noise(0.03, 700, 2600) * 0.9, tone(0.03, 900, 400, 0.1) * 0.5))
    out["thud"] = norm(mix(tone(0.16, 150, 40, 0.15, bend=6.0), noise(0.05, 500, 400) * 0.5))
    out["snap"] = norm(mix(noise(0.06, 340, 3800), tone(0.05, 420, 180, 0.3) * 0.6))
    out["metal"] = norm(
        mix(
            *[tone(0.16, hz, 26 + i * 7, 0.0) * w for i, (hz, w) in enumerate([(1180, 1.0), (1790, 0.55), (2630, 0.3)])],
            noise(0.02, 1200, 6000) * 0.5,
        )
    )
    out["wood"] = norm(mix(tone(0.07, 380, 130, 0.5, bend=3.0), noise(0.03, 800, 1800) * 0.6))
    out["pop"] = norm(mix(tone(0.06, 300, 90, 0.0, bend=12.0), noise(0.012, 1400, 900) * 0.4))
    out["noise"] = norm(noise(0.09, 220, 1100))
    return out


def wav_bytes(x):
    """**16 bit の WAV**（そのまま `data:` に載せる）"""
    import struct

    pcm = np.clip(x, -1, 1)
    pcm = (pcm * 32767).astype("<i2").tobytes()
    head = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt "
    head += struct.pack("<IHHIIHH", 16, 1, 1, RATE, RATE * 2, 2, 16)
    head += b"data" + struct.pack("<I", len(pcm))
    return head + pcm


def main() -> int:
    made = bases()
    blob = {k: base64.b64encode(wav_bytes(v)).decode() for k, v in made.items()}
    tpl = io.open(TPL, encoding="utf-8").read()
    js = ",\n".join(f'    "{k}": "data:audio/wav;base64,{v}"' for k, v in blob.items())
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(tpl.replace("__BASES__", js))
    print(f"kaita: {OUT}  {os.path.getsize(OUT)} byte")
    for k, v in made.items():
        print(f"  {k:6s} {len(v) / RATE * 1000:4.0f} ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
