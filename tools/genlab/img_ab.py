"""画像だけを並べて、物の定型の言い回しと step 数を比べる（3D はしない。0.2 秒/枚）。"""
import sys
from PIL import Image, ImageDraw
from pipeline.run import OUT_DIR
from pipeline.t2i import TextToImage
from pipeline.translate import Translator
NEG = "frame, border, box, multiple objects, duplicate, snow, ground texture, close-up, cropped, person, hand, text, watermark, blurry, top-down view"
STYLES = {
    "mini_now": ("a miniature model of a {x}, the entire {x} visible with empty space around it, small in frame, three-quarter view at eye level, single object, centered, plain white background, studio photo", 2),
    "iso4": ("a miniature model of a {x}, isolated on a plain white background, the entire {x} visible with plenty of empty space around it, three-quarter view at eye level, studio photo", 4),
    "toy4": ("a single {x} toy, isolated on a plain white background, the whole toy visible with plenty of empty space around it, three-quarter view at eye level, product photo", 4),
    "one4": ("one {x}, alone, isolated on a plain white background, the entire {x} visible, three-quarter view at eye level, clean 3D render", 4),
}
words = sys.argv[1:] or ["house", "car", "book", "sword", "guitar", "rocket"]
tr = Translator(); tr.load(); t2i = TextToImage(); t2i.load()
rows = []
for w in words:
    eng = tr.translate(w)
    cells = []
    for name, (tpl, steps) in STYLES.items():
        for seed in (7, 11):
            img = t2i.generate(tpl.replace("{x}", eng.lower().rstrip(".")), NEG, steps=steps, seed=seed).resize((200, 200))
            ImageDraw.Draw(img).text((4, 184), f"{w} {name} s{seed}", fill=(255, 0, 0)); cells.append(img)
    row = Image.new("RGB", (sum(c.width + 3 for c in cells), 200), "black"); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 3
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 3 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 3
out = OUT_DIR / "img-ab.png"; sheet.save(out); print(out)
