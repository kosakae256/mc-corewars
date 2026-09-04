"""飛竜の**目の案を並べた 1 枚**を書き出す。

    python tools/pve3-eye-sheet.py

出す先は `worlds/pve-v3/preview/eye-patterns.png`。

## 何のためか

> ### 目は 1 案ずつ直すと遅い
>
> **1 回直して、貼って、見て、また直す**を繰り返していた。
> **並べて見せて、選んでもらう。**

採用が決まったら、その並びを `tools/pve3-wyvern.py` の `PAT` に写す。

記号は `pve3-wyvern.py` と同じ。`.` は描かない（体の色のまま）。
"""

import io
import os

from PIL import Image, ImageDraw

OUT = os.path.join("worlds", "pve-v3", "preview", "eye-patterns.png")

HIDE = (108, 26, 22)        # 体の色（暗赤）
COL = {
    "e": (204, 84, 14),     # 虹彩の外周
    "m": (230, 110, 16),    # 虹彩
    "o": (246, 140, 22),    # 虹彩
    "O": (255, 176, 44),    # 虹彩の芯
    "P": (10, 7, 5),        # 瞳
    "L": (255, 240, 210),   # 光の点
    "k": (52, 18, 12),      # まぶたの影（使う案だけ）
}

# **後ろ → 前**の並び。`.` は描かない
PATTERNS = [
    ("01 いま入っているもの", (
        ".eeeeee",
        "emoPom.",
        "emoPLo.",
        "emoPom.",
        "eeeee..",
    )),
    ("02 左右対称・角落とし", (
        ".eeeee.",
        "emoPome",
        "emoPLoe",
        "emoPome",
        ".eeeee.",
    )),
    ("03 完全な四角", (
        "eeeeeee",
        "emoPome",
        "emoPLoe",
        "emoPome",
        "eeeeeee",
    )),
    ("04 前上だけ尖る", (
        ".eeeeee",
        "emoPom.",
        "emoPLo.",
        "emoPom.",
        ".eeee..",
    )),
    ("05 後ろ下だけ尖る", (
        ".eeeee.",
        "emoPome",
        "emoPLoe",
        "emoPome",
        "eeeee..",
    )),
    ("06 細長い（7x3）", (
        ".eeeee.",
        "emoPLoe",
        ".eeeee.",
    )),
    ("07 縦長（5x5）", (
        ".eee.",
        "emPoe",
        "emPLe",
        "emPoe",
        ".eee.",
    )),
    ("08 瞳が太い", (
        ".eeeee.",
        "emPPome",
        "emPPLoe",
        "emPPome",
        ".eeeee.",
    )),
    ("09 瞳が上下に抜ける", (
        ".eePee.",
        "emoPome",
        "emoPLoe",
        "emoPome",
        ".eePee.",
    )),
    ("10 瞳が斜め", (
        ".eeeee.",
        "emoPome",
        "emoPLoe",
        "emPoome",
        ".eeeee.",
    )),
    ("11 光の点なし", (
        ".eeeee.",
        "emoPome",
        "emoPooe",
        "emoPome",
        ".eeeee.",
    )),
    ("12 光の点が上の端", (
        ".eeLee.",
        "emoPome",
        "emoPooe",
        "emoPome",
        ".eeeee.",
    )),
    ("13 光の点が大きい", (
        ".eeeee.",
        "emoPLme",
        "emoPLoe",
        "emoPome",
        ".eeeee.",
    )),
    ("14 瞳が前寄り", (
        ".eeeee.",
        "emooPme",
        "emooPLe",
        "emooPme",
        ".eeeee.",
    )),
    ("15 瞳が後ろ寄り", (
        ".eeeee.",
        "emPoome",
        "emPoLoe",
        "emPoome",
        ".eeeee.",
    )),
    ("16 虹彩が一色", (
        ".ooooo.",
        "oooPooo",
        "oooPLoo",
        "oooPooo",
        ".ooooo.",
    )),
    ("17 上まぶたの影あり", (
        ".kkkkk.",
        "emoPome",
        "emoPLoe",
        "emoPome",
        ".eeeee.",
    )),
    ("18 小さい（5x3）", (
        ".eee.",
        "eoPLe",
        ".eee.",
    )),
    ("19 大きい（9x5）", (
        ".eeeeeee.",
        "emooPoome",
        "emooPLooe",
        "emooPoome",
        ".eeeeeee.",
    )),
    ("20 前上と後ろ下へ長く", (
        "..eeeeee",
        ".emoPom.",
        "eemoPLo.",
        "eemoPom.",
        "eeeee...",
    )),
]

DOT = 12          # 1 ドットを何画素で描くか
COLS = 5          # 何列に並べるか
PAD = 14
LABEL = 18


def tile_size():
    w = max(len(r[0]) for _, r in PATTERNS)
    h = max(len(r) for _, r in PATTERNS)
    return w * DOT + PAD * 2, h * DOT + PAD * 2 + LABEL


def main():
    tw, th = tile_size()
    rows = (len(PATTERNS) + COLS - 1) // COLS
    img = Image.new("RGB", (tw * COLS, th * rows), (34, 30, 32))
    d = ImageDraw.Draw(img)
    for i, (name, pat) in enumerate(PATTERNS):
        cx, cy = (i % COLS) * tw, (i // COLS) * th
        d.rectangle([cx + 2, cy + 2, cx + tw - 3, cy + th - 3], fill=HIDE)
        pw, ph = len(pat[0]), len(pat)
        ox = cx + (tw - pw * DOT) // 2
        oy = cy + LABEL + (th - LABEL - ph * DOT) // 2
        for ry, row in enumerate(pat):
            for rx, ch in enumerate(row):
                col = COL.get(ch)
                if col is None:
                    continue
                x, y = ox + rx * DOT, oy + ry * DOT
                d.rectangle([x, y, x + DOT - 1, y + DOT - 1], fill=col)
        d.rectangle([cx + 2, cy + 2, cx + tw - 3, cy + LABEL], fill=(34, 30, 32))
        # **番号だけ書く。** 既定の字形は日本語を持たず、書くと化ける
        d.text((cx + 8, cy + 5), name.split()[0], fill=(236, 232, 228))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)
    print("kaita:", OUT, img.size)


if __name__ == "__main__":
    raise SystemExit(main())
