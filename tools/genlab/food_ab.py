"""食べ物の定型を比べる（画像だけ。0.3 秒/枚）。

    .venv/Scripts/python.exe food_ab.py [lemon strawberry ...]

物の定型 "one {x}, alone, isolated …" は食べ物だと**接写・山盛り・切り口**になった（2026-09-21 全語テスト）。
"""

import sys

from PIL import Image, ImageDraw

from pipeline.run import OUT_DIR
from pipeline.t2i import TextToImage
from pipeline.translate import NEGATIVES, STYLES

NEG_FOOD = "many, pile, group, multiple, pattern, sliced, cut, half, close-up, macro, cropped, plate, bowl, hand, person, text, watermark, blurry, top-down view, background scenery"
CANDIDATES = {
    "object_now": (STYLES["object"], NEGATIVES["object"]),
    "whole": ("a single whole {x}, one piece, alone, isolated on a plain white background, the entire {x} visible with empty space around it, three-quarter view at eye level, clean 3D render", NEG_FOOD),
    "toy": ("a toy model of one whole {x}, alone, isolated on a plain white background, the entire {x} visible with empty space around it, three-quarter view at eye level, studio product photo", NEG_FOOD),
    "plastic": ("a plastic food replica of a single whole {x}, alone on a white table, isolated on a plain white background, whole item visible with empty space around it, three-quarter view at eye level, product photo", NEG_FOOD),
}
words = sys.argv[1:] or ["lemon", "strawberry", "banana", "grapes", "watermelon", "hamburger", "sushi", "cake", "pizza", "egg", "onigiri rice ball", "ice cream cone"]
t2i = TextToImage()
t2i.load()
rows = []
for w in words:
    cells = []
    for name, (tpl, neg) in CANDIDATES.items():
        for seed in (1, 7):
            img = t2i.generate(tpl.replace("{x}", w), neg, steps=4, seed=seed).resize((200, 200))
            ImageDraw.Draw(img).text((4, 184), f"{w} {name} s{seed}", fill=(255, 0, 0))
            cells.append(img)
    row = Image.new("RGB", (sum(c.width + 3 for c in cells), 200), "black")
    x = 0
    for c in cells:
        row.paste(c, (x, 0))
        x += c.width + 3
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 3 for r in rows)), "black")
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height + 3
out = OUT_DIR / "food-ab.png"
sheet.save(out)
print(out)
