"""訓練用カカシの絵を書き出す。

    python tools/pve3-dummy.py

仕様は `worlds/pve-v3/docs/spec/23-enemy-unit.md` 1-1。

## 何を書いているか

**64×64 の 1 枚。** `pve3_dummy.geo.json` の各箱が、
**箱の自動展開（`"uv": [u, v]`）でここを切り出す。**

| 場所 | 何 |
| --- | --- |
| (0,0)-(8,18) | 杭（木） |
| (10,0)-(38,15) | 胴（麻袋・継ぎ当て・はみ出した藁） |
| (0,20)-(24,32) | 頭（顔は前の面だけに描く） |
| (40,16)-(48,21) | 藁の房 |
| (0,34)-(48,38) | 腕（木） |
| (0,40)-(48,53) | 帽子のつば |
| (0,53)-(28,64) | 帽子の山 |

**箱の展開は「幅 ＝ 2×(奥行＋幅)、高さ ＝ 奥行＋高さ」。**
**前の面は、左上から (奥行, 奥行) の位置**——顔はそこに描く。
"""

import io
import os
import random

from PIL import Image

W = H = 64
OUT = os.path.join(
    "worlds", "pve-v3", "packs", "pve_v3", "resource_packs", "pve_v3", "textures", "entity", "pve3_dummy.png"
)

WOOD = (104, 76, 48)
WOOD_DARK = (78, 56, 34)
SACK = (198, 170, 116)
SACK_DARK = (168, 140, 92)
STRAW = (214, 182, 96)
STRAW_DARK = (176, 144, 66)
PATCH = (140, 112, 74)
HAT = (150, 118, 58)
HAT_DARK = (118, 90, 42)
INK = (48, 36, 26)
ROPE = (122, 96, 58)
HEAD = (212, 188, 138)

rnd = random.Random(20260906)


def box(img, x1, y1, x2, y2, color):
    for y in range(y1, y2):
        for x in range(x1, x2):
            if 0 <= x < W and 0 <= y < H:
                img.putpixel((x, y), (*color, 255))


def grain(img, x1, y1, x2, y2, color, chance=0.28):
    """木目・藁の乱れ。**одна色だと板に見える**"""
    for y in range(y1, y2):
        for x in range(x1, x2):
            if rnd.random() < chance:
                img.putpixel((x, y), (*color, 255))


def main():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # ---- 杭
    box(img, 0, 0, 8, 18, WOOD)
    grain(img, 0, 0, 8, 18, WOOD_DARK, 0.22)

    # ---- 胴（麻袋）
    box(img, 10, 0, 38, 15, SACK)
    grain(img, 10, 0, 38, 15, SACK_DARK, 0.18)
    # 継ぎ当て（前の面のあたり）
    box(img, 22, 6, 27, 11, PATCH)
    for x in range(22, 27):
        img.putpixel((x, 6), (*INK, 255))
        img.putpixel((x, 10), (*INK, 255))
    # 裾からはみ出した藁
    for x in range(10, 38):
        if rnd.random() < 0.5:
            img.putpixel((x, 14), (*STRAW, 255))
            img.putpixel((x, 13), (*STRAW_DARK, 255))

    # ---- 頭（6×6×6 → 24×12。前の面は (6,6) から 6×6）
    # **頭は胴より少し明るく。** 同じ色だと 1 本の袋に見える
    box(img, 0, 20, 24, 32, HEAD)
    grain(img, 0, 20, 24, 32, SACK_DARK, 0.12)
    fx, fy = 6, 26  # 前の面の左上
    # **目は縦の切れ目 2 本。** 6 ドットしかないので、×印は潰れて四角に見えた
    for y in (fy + 1, fy + 2):
        img.putpixel((fx + 1, y), (*INK, 255))
        img.putpixel((fx + 4, y), (*INK, 255))
    # **口は縫い目。** 横 1 本に、上下へ渡した糸
    for x in range(fx + 1, fx + 5):
        img.putpixel((x, fy + 4), (*INK, 255))
    img.putpixel((fx + 1, fy + 3), (*INK, 255))
    img.putpixel((fx + 3, fy + 3), (*INK, 255))
    # **首の縄。** 頭と胴が同じ色で溶けて見えたので、境目を作る
    for x in range(0, 24):
        img.putpixel((x, 31), (*ROPE, 255))

    # ---- 藁の房
    box(img, 40, 16, 48, 21, STRAW)
    grain(img, 40, 16, 48, 21, STRAW_DARK, 0.35)

    # ---- 腕（木）
    box(img, 0, 34, 48, 38, WOOD)
    grain(img, 0, 34, 48, 38, WOOD_DARK, 0.2)

    # ---- 帽子
    box(img, 0, 40, 48, 53, HAT)
    grain(img, 0, 40, 48, 53, HAT_DARK, 0.24)
    box(img, 0, 53, 28, 64, HAT)
    grain(img, 0, 53, 28, 64, HAT_DARK, 0.24)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)
    print("kaita:", OUT, os.path.getsize(OUT), "byte")


if __name__ == "__main__":
    main()
