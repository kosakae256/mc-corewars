"""乗り物の定型を比べる（画像だけ。0.3 秒/枚）。**サーバーを止めてから**。

    .venv/Scripts/python.exe vehicle_ab.py [bicycle helicopter ...]

物の定型 "one {x}, alone, isolated …" だと乗り物は**風景写真・接写**になり、切り抜きが散る（2026-09-21 60³ テスト。48 語中 9 語しか残らない）。
"""

import sys

from PIL import Image, ImageDraw

from pipeline.run import OUT_DIR
from pipeline.t2i import TextToImage
from pipeline.translate import NEGATIVES, STYLES

NEG_V = "road, street, sky, clouds, water, sea, landscape, scenery, background, close-up, cropped, partial, multiple, person, hand, text, watermark, blurry, motion blur"
CANDIDATES = {
    "object_now": (STYLES["object"], NEGATIVES["object"]),
    "toy": ("a toy model of a {x}, whole vehicle visible, three-quarter front view at eye level, on a flat white floor, isolated on a plain white background, product photo", NEG_V),
    "diecast": ("a die-cast toy {x}, complete vehicle from front three-quarter view, standing on a white table, plain white background, studio product photo", NEG_V),
    "plastic": ("a plastic model kit of a {x}, entire vehicle visible with empty space around it, three-quarter view at eye level, on a white table, plain white background, product photo", NEG_V),
}
words = sys.argv[1:] or ["bicycle", "helicopter", "airplane", "sailboat", "tractor", "steam locomotive", "motorcycle", "tank", "submarine", "police car", "excavator", "pirate ship"]
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
out = OUT_DIR / "vehicle-ab.png"
sheet.save(out)
print(out)
