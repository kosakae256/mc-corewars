"""バニラの弓の絵を下敷きに、こちらの弓の絵を作る（**いまは使っていない**）。

> ### 2026-08-29 に置き換えた
>
> **16x16 では色を替えるくらいしかできなかった。**
> いまは **`tools/pve-bow-art.py`** が **64x64（4 倍）で描き起こしている。**
> **この道具は、バニラの形に戻したくなったときのために残してある。**


  python tools/pve-bow-textures.py bedrock-samples worlds/pve/packs/pve

## やっていること

**元の 4 枚（構え・引き 0/1/2）をそのまま読み、色だけ差し替える。**

| なぜ | |
| --- | --- |
| 形を触らない | **引き段ごとの変化**（弦の寄り・矢の現れ方）が元のまま残る |
| 色だけ替える | **どの弓かは一目で分かる** |
| 飾りを足す | レア度の高いものにだけ、数ピクセル |

**新しく描き起こさない。** 描き起こすと、弓に見えないものになる（実際なった）。
"""

import os
import sys

from PIL import Image

SAMPLES = sys.argv[1]
PACK = sys.argv[2]
SRC = os.path.join(SAMPLES, "resource_pack", "textures", "items")
OUT = os.path.join(PACK, "resource_packs", "pve", "textures", "items")
os.makedirs(OUT, exist_ok=True)

FRAMES = ["standby", "pulling_0", "pulling_1", "pulling_2"]

# 元の木の色（濃い順）
WOOD = [(40, 30, 11, 255), (73, 54, 21, 255), (104, 78, 30, 255), (137, 103, 39, 255)]

STYLES = {
    # 支給された弓：**そのまま**。common は「ふつうの弓」でよい
    "common": {"wood": WOOD},
    # 無銘弓：鋼
    "plain": {
        "wood": [(52, 60, 70, 255), (96, 108, 122, 255), (142, 154, 168, 255), (188, 200, 214, 255)],
        # **弦と矢も青へ寄せる。** 白（矢尻）はそのまま残す
        "gray": {
            (68, 68, 68, 255): (58, 78, 96, 255),
            (107, 107, 107, 255): (104, 134, 160, 255),
            (150, 150, 150, 255): (170, 196, 220, 255),
            (177, 177, 177, 255): (196, 218, 238, 255),
        },
    },
    # 星屑：紫。**星を数粒足す**
    "stardust": {
        "wood": [(44, 28, 74, 255), (84, 58, 140, 255), (122, 88, 194, 255), (170, 142, 242, 255)],
        "gray": {
            (68, 68, 68, 255): (74, 58, 104, 255),
            (107, 107, 107, 255): (140, 118, 178, 255),
            (150, 150, 150, 255): (216, 200, 248, 255),
            (177, 177, 177, 255): (240, 230, 255, 255),
        },
        # 空いている隅に星（引くほど明るくする）
        "spark": [(1, 1), (14, 2), (2, 13)],
        "sparkColor": (255, 244, 200, 255),
    },
}


def convert(src_path: str, dst_path: str, style: dict, pull: int) -> None:
    img = Image.open(src_path).convert("RGBA")
    px = img.load()
    wood = style["wood"]
    gray = style.get("gray", {})
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            c = px[x, y]
            if c[3] == 0:
                continue
            if c in WOOD:
                px[x, y] = wood[WOOD.index(c)]
            elif c in gray:
                px[x, y] = gray[c]
    for x, y in style.get("spark", []):
        if px[x, y][3] != 0:
            continue  # 元の絵を潰さない
        col = style.get("sparkColor", (255, 255, 255, 255))
        a = 190 + pull * 22  # **引くほど強く光る**
        px[x, y] = (col[0], col[1], col[2], min(255, a))
    img.save(dst_path)


for key, style in STYLES.items():
    for f in FRAMES:
        convert(
            os.path.join(SRC, f"bow_{f}.png"),
            os.path.join(OUT, f"pve_bow_{key}_{f}.png"),
            style,
            FRAMES.index(f),
        )
        print("  ", f"pve_bow_{key}_{f}.png")
print("できた")
