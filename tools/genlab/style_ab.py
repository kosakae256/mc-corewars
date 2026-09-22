"""定型（STYLES）を物に依存しない候補で比べる。画像と 20³ を並べる。"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline import translate
from preview import render

translate.STYLES.update({  # 比較用
    "_unused": "",
    "model": "a 3D model of a {x}, whole object visible, three-quarter view at eye level, single object, centered, plain white background, clean studio render, no shadows",
    "voxel": "isometric voxel art of a {x}, Minecraft style, blocky, whole object visible, single object, centered, plain white background",
    "icon": "a simple 3D icon of a {x}, clean simple shapes, bold flat colors, whole object visible, three-quarter view, single object, centered, plain white background, no shadows",
})
words = sys.argv[1:] or ["book", "pizza", "sword", "cat", "car"]
styles = ["auto"]
p = Pipeline(); p.load()
rows = []
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
out = OUT_DIR / "style-ab.png"; sheet.save(out); print(out)
