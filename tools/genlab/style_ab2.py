"""構図の言い方を比べる。生き物と物で候補を分ける。"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline import translate
from preview import render

translate.STYLES.update({
    "o_mini": "a miniature model of a {x}, the entire {x} visible with empty space around it, small in frame, three-quarter view at eye level, single object, centered, plain white background, studio photo",
    "o_wide": "a {x}, wide shot, the entire {x} visible with empty space around it, small in frame, centered, three-quarter view at eye level, single object, plain white background, product photo, no shadows",
    "c_fig": "a toy figurine of a {x}, full body, three-quarter front view, eye-level shot, standing on a flat white floor, single figure, centered, plain white background, studio product photo",
    "c_wide": "a {x}, wide shot, full body, the entire animal visible from head to feet with empty space around it, small in frame, standing, three-quarter view at eye level, single animal, centered, plain white background, studio photo",
})
translate.NEGATIVES.update({k: translate.NEGATIVES["object"] for k in ("o_mini", "o_wide")})
translate.NEGATIVES.update({k: translate.NEGATIVES["creature"] for k in ("c_fig", "c_wide")})
groups = {"o": ["book", "sword", "car", "guitar", "rocket", "apple"], "c": ["cat", "dog", "bird"]}
p = Pipeline(); p.load()
rows = []
for g, words in groups.items():
    styles = [s for s in translate.STYLES if s.startswith(g + "_")]
    for w in words:
        cells = []
        for st in styles:
            last = None
            for ev in p.run(w, steps=2, seed=7, style=st):
                if ev["stage"] == "done": last = ev
            d = Path(last["out_dir"]); r = json.loads((d / "result.json").read_text(encoding="utf-8"))
            img = Image.open(d / "image.png").resize((230, 230)); pv = render(r, cell=12, views=1); pv = pv.resize((int(pv.width * 230 / pv.height), 230))
            c = Image.new("RGB", (img.width + pv.width + 4, 246), "black"); c.paste(img, (0, 0)); c.paste(pv, (img.width + 4, 0))
            ImageDraw.Draw(c).text((2, 232), f"{w} / {st}  {r['count']} blk", fill=(255, 255, 0)); cells.append(c)
            print(w, st, r["count"], f"{last['seconds']:.2f}s")
        row = Image.new("RGB", (sum(c.width + 4 for c in cells), 246), "black"); x = 0
        for c in cells: row.paste(c, (x, 0)); x += c.width + 4
        rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "style-ab2.png"; sheet.save(out); print(out)
