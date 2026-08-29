"""GIF（や連番画像）を、粒に使える**パラパラ漫画の 1 枚**にする。

    python tools/gif-to-flipbook.py <入力.gif> <出力.png> [--fps 20] [--width 64]

## GIF はそのままでは粒にできない

Bedrock の粒が読むのは **1 枚の PNG** だけ。
ただし **`flipbook`** を使えば、**1 枚に並べたコマを順に映せる**——
**GIF のコマを横に並べれば、同じことができる。**

出力といっしょに、**貼り付け用の `uv` 断片**を表示する:

```json
"uv": {
  "texture_width": 256, "texture_height": 64,
  "flipbook": {
    "base_UV": [0, 0], "size_UV": [64, 64], "step_UV": [64, 0],
    "frames_per_second": 20, "max_frame": 4,
    "stretch_to_lifetime": true, "loop": false
  }
}
```

| | |
| --- | --- |
| `size_UV` | **1 コマの大きさ** |
| `step_UV` | **次のコマまでの移動**（横並びなら [幅, 0]） |
| `stretch_to_lifetime` | **粒の寿命に合わせて 1 周させる**（fps より優先） |

**透過は残る。** 背景が黒く塗られている GIF は、先に抜いておくこと。
"""

import argparse
import json
import os
import sys

from PIL import Image, ImageSequence


def main() -> int:
    ap = argparse.ArgumentParser(description="GIF をパラパラ漫画の 1 枚にする")
    ap.add_argument("src", help="入力（.gif / .png の連番なら 1 枚目）")
    ap.add_argument("out", help="出力 PNG")
    ap.add_argument("--fps", type=int, default=20)
    ap.add_argument("--width", type=int, default=0, help="1 コマの幅（0 なら元のまま）")
    ap.add_argument("--max", type=int, default=0, help="使うコマ数の上限（0 なら全部）")
    args = ap.parse_args()

    src = Image.open(args.src)
    frames = [f.convert("RGBA").copy() for f in ImageSequence.Iterator(src)]
    if args.max > 0:
        frames = frames[: args.max]
    if len(frames) == 0:
        print("コマがありません")
        return 1

    if args.width > 0:
        r = args.width / frames[0].width
        size = (args.width, max(1, round(frames[0].height * r)))
        frames = [f.resize(size, Image.LANCZOS) for f in frames]

    w, h = frames[0].size
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (w * i, 0))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sheet.save(args.out)

    uv = {
        "texture_width": w * len(frames),
        "texture_height": h,
        "flipbook": {
            "base_UV": [0, 0],
            "size_UV": [w, h],
            "step_UV": [w, 0],
            "frames_per_second": args.fps,
            "max_frame": len(frames),
            "stretch_to_lifetime": True,
            "loop": False,
        },
    }
    print(f"書いた: {args.out}  （{len(frames)} コマ / 1 コマ {w}x{h}）")
    print("粒の uv にこれを貼る:")
    print(json.dumps({"uv": uv}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
