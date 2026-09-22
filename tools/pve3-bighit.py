"""大ダメージの音を作る。

    python tools/pve3-bighit.py

仕様は `worlds/pve-v3/docs/spec/22-feedback.md` 2 章。

## 何をしているか

**渡された打撃音を、そのまま低くする。**

| | |
| --- | --- |
| **元** | `worlds/pve-v3/user/打撃3.mp3`（**本人が用意したもの**。ベンチで選んだ） |
| **低くする** | **ゆっくり再生する**（`RATE_SCALE`） |
| **鈍くする** | **高い所を落とす**（`LOWPASS_HZ` の一次ローパスを 2 回） |
| **重くする** | **下から支える唸りを足す**（`THUMP_HZ`）＋**軽く潰す** |
| **当たりを出す** | **出だしだけ元の音を混ぜる**（`BRIGHT_GAIN`）——**鈍いだけだと、当たった感じが出ない** |
| **短くする** | **伸びたぶんを `MAX_SEC` で切る** |
| **書き出し** | `resource_packs/pve_v3/sounds/pve3/big_hit.ogg`（**Bedrock が読むのは ogg**） |

**再生速度を落とすと、音の高さも一緒に落ちる。**
**打撃音は短いので、遅くなっても間延びして聞こえない**——**鈍く重くなる。**

## 耳で決める

**数字はブラウザで決められる。**

```
tools/pve3-bighit-bench.html   ← そのまま開く（音は中に入っている）
```

**スライダーを動かすと、その場で鳴る。** 決まったら**表示された数字をここへ写して**、この道具を走らせる。
**加工の順も式も、ベンチとこの道具で同じ。**

## 必要なもの

```bash
python -m pip install soundfile numpy
```
"""

import os

import numpy as np
import soundfile as sf

SRC = os.path.join("worlds", "pve-v3", "user", "打撃3.mp3")
OUT = os.path.join(
    "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3", "sounds", "pve3", "big_hit.ogg"
)

# **どれだけ低くするか。** 0.4 ＝ 1 オクターブ強下がる
RATE_SCALE = 1.0

# **鈍さ。** ここより上を落とす（Hz）。**低いほど、こもって鈍い**
LOWPASS_HZ = 3500

# **出だしの「シャ」。** ここだけ元の音を混ぜる（**鈍いだけだと、当たった感じが出ない**）
BRIGHT_GAIN = 1.2
BRIGHT_SEC = 0.035

# **重み。** 下から支える低い唸り
THUMP_HZ = 96
THUMP_GAIN = 0.45
THUMP_SEC = 0.12

# **長さの上限（秒）。** **遅くすると伸びる**ので、ここで切る
MAX_SEC = 0.29

# **全体の音量。** 割れないように少し下げる
GAIN = 0.98

# **狙う音の太さ**（RMS）。**山の高さではなく、鳴り続ける強さで揃える**
#
# > ### 山だけ合わせても、小さく聞こえる
# >
# > **低くて鈍い音は、山が高くても耳には小さい。**
# > **平均の強さ（RMS）で揃えてから、割れないところまで持ち上げる。**
TARGET_RMS = 0.3


def main() -> int:
    data, rate = sf.read(SRC, always_2d=True)
    # **1 本にまとめる**——鳴らすのは効果音なので、左右を分ける意味が無い
    mono = data.mean(axis=1)

    # ---- **ゆっくり読み直す。** これで高さが下がる
    n = int(len(mono) / RATE_SCALE)
    src = np.arange(len(mono), dtype=np.float64)
    dst = np.linspace(0, len(mono) - 1, n)
    slow = np.interp(dst, src, mono)

    # ---- **高い所を落とす。** これが「鈍さ」
    #
    # > **一次のローパス。** `y += a * (x - y)`。
    # > **細かい歯切れの良さが消えて、こもった音になる。**
    a = 1.0 - np.exp(-2.0 * np.pi * LOWPASS_HZ / rate)
    y = 0.0
    dull = np.empty_like(slow)
    for i, x in enumerate(slow):
        y += a * (x - y)
        dull[i] = y
    # **2 回通すと、もっと鈍い**
    y = 0.0
    for i, x in enumerate(dull):
        y += a * (x - y)
        dull[i] = y
    # ---- **出だしだけ、元の音を混ぜる**
    #
    # > ### 鈍いだけでは、当たったと分からない
    # >
    # > **高い所を全部落とすと、こもった音が一瞬鳴るだけになる。**
    # > **頭の 30 ミリ秒だけ元の音を足す**——**「シャ」の当たりが戻る。**
    t0 = np.arange(len(slow)) / rate
    edge = np.exp(-t0 / BRIGHT_SEC) * BRIGHT_GAIN
    slow = dull + slow * edge

    # ---- **長すぎるので切る**（`22-feedback.md` 8 章）。**打撃は短くないと重く感じない**
    cap = int(rate * MAX_SEC)
    if len(slow) > cap:
        slow = slow[:cap]

    # ---- **頭を立て、尻を丸める**（ぶつっと切れないように）
    #
    # **切った後ろは長めに丸める**——ぶつ切りに聞こえないように
    fade = min(256, len(slow) // 8)
    if fade > 0:
        slow[:fade] *= np.linspace(0, 1, fade)
    tail = min(len(slow) // 3, int(rate * 0.12))
    if tail > 0:
        slow[-tail:] *= np.linspace(1, 0, tail) ** 2

    # ---- **下から支える唸りを足す**（`ゴシャ` の「ゴ」）
    n2 = min(len(slow), int(rate * THUMP_SEC))
    t = np.arange(n2) / rate
    # **高さも一緒に落ちていく**——**叩いた物が沈む感じ**
    hz = THUMP_HZ * np.exp(-t * 3.0)
    thump = np.sin(2 * np.pi * np.cumsum(hz) / rate) * np.exp(-t * 14.0) * THUMP_GAIN
    slow[:n2] += thump

    # ---- **軽く潰す。** 角が丸くなって、鈍さが増す
    slow = np.tanh(slow * 1.6)

    rms = float(np.sqrt(np.mean(slow**2))) or 1.0
    slow = slow * (TARGET_RMS / rms)
    # **潰れる手前で止める**
    peak = float(np.max(np.abs(slow))) or 1.0
    if peak > GAIN:
        slow = slow / peak * GAIN

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, slow.astype(np.float32), rate, format="OGG", subtype="VORBIS")
    print("kaita:", OUT, f"{len(slow) / rate:.2f} byou", os.path.getsize(OUT), "byte")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
