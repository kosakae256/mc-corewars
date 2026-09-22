"""**音を pve_v3 のリソースパックへ入れる。**

    python tools/pve3-sound.py worlds/pve-v3/user/valorant-chamber-ult-jp.mp3 pve_v3:chamber.call

仕様は `worlds/pve-v3/docs/spec/25-enemy-kit.md` 8-A。

## なぜ道具にするのか

> ### **Bedrock が読めるのは `wav` / `ogg` / `fsb` の 3 つだけ**（bedrock-wiki）
>
> **mp3 は置いても鳴らない。** **しかもエラーは出ない**——**ただ無音になる。**
> **変換と登録を手でやると、必ずどちらかを忘れる。**

**やること**: `ogg`（Vorbis）へ変換して `sounds/pve3/` に置き、
**`sound_definitions.json` に短い名前を登録する。**

> ### **聞こえる距離は 2 つの掛け算で決まる**（bedrock-wiki）
>
> **聞こえる範囲 ＝ `min(max_distance, max(volume × 16, 16))`。**
> **`--far` で `max_distance` を渡す**が、**鳴らす側の音量も上げないと届かない**
> （200 マスに届かせるには **音量 12.5 以上**）。

**音のファイルは、クライアントを丸ごと再起動しないと読み込まれない**
（**ワールドの入り直しでは足りない**）。
"""

import io
import json
import os
import sys
import math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RP = os.path.join(ROOT, "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3")
SOUNDS = os.path.join(RP, "sounds")
DEFS = os.path.join(SOUNDS, "sound_definitions.json")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print("tsukaikata: python tools/pve3-sound.py <oto no file> <namae> [--stem <file mei>] [--far <masu>] [--gain <bairitsu>]")
        return 1
    src, name = args[0], args[1]
    stem = sys.argv[sys.argv.index("--stem") + 1] if "--stem" in sys.argv else name.split(":")[-1].replace(".", "_")
    # **届く距離**（マス）。**`volume × 16` と、この値の小さいほうまでしか聞こえない**
    far = float(sys.argv[sys.argv.index("--far") + 1]) if "--far" in sys.argv else 128.0
    gain = float(sys.argv[sys.argv.index("--gain") + 1]) if "--gain" in sys.argv else 1.0
    if not math.isfinite(gain) or gain < 0:
        raise ValueError("gain must be finite and nonnegative")

    import soundfile as sf  # **変換のためだけに使う**（`pip install soundfile`）

    data, rate = sf.read(src, always_2d=True)
    out = os.path.join(SOUNDS, "pve3", f"{stem}.ogg")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    # 再生側のvolumeは可聴距離にも影響するため、音源の振幅だけを変える。
    sf.write(out, data * gain, rate, format="OGG", subtype="VORBIS")

    d = json.load(io.open(DEFS, encoding="utf-8"))
    d["sound_definitions"][name] = {
        "category": "hostile",
        "min_distance": 0.0,
        "max_distance": far,
        "sounds": [{"name": f"sounds/pve3/{stem}", "volume": 1.0, "is3D": True, "stream": False}],
    }
    d["sound_definitions"] = dict(sorted(d["sound_definitions"].items()))
    io.open(DEFS, "w", encoding="utf-8", newline="\n").write(json.dumps(d, ensure_ascii=False, indent=2) + "\n")

    print("kaita:", os.path.relpath(out, ROOT), f"({os.path.getsize(out)} byte / {len(data) / rate:.2f} byou)")
    print("namae:", name)
    print("** client wo marugoto sai-kidou suru koto **")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
