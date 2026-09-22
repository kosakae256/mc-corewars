"""傾き補正あり／なしを同じ seed・同じ画像で比べる。"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from preview import render
words = sys.argv[1:] or ["car", "rocket", "cat"]
p = Pipeline(); p.load()
rows = []
for w in words:
    cells = []
    for lv in (False, True):
        last = None; info = {}
        for ev in p.run(w, steps=2, seed=7, style="figurine", threshold=25.0, level=lv):
            if ev["stage"] == "done": last = ev
            if ev["stage"] == "model": info = {k: ev.get(k) for k in ("pitch", "roll", "contact_before", "contact_after")}
        d = Path(last["out_dir"]); r = json.loads((d / "result.json").read_text(encoding="utf-8"))
        pv = render(r, cell=14, views=2); pv = pv.resize((int(pv.width * 360 / pv.height), 360))
        ImageDraw.Draw(pv).text((6, 340), f"{w} level={lv} {info} {r['count']} blk", fill=(255, 255, 0))
        cells.append(pv); print(w, lv, info, r["count"])
    img = Image.open(d / "image.png").resize((360, 360))
    row = Image.new("RGB", (img.width + sum(c.width + 4 for c in cells), 360), "black"); row.paste(img, (0, 0)); x = img.width + 4
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "ab-level.png"; sheet.save(out); print(out)
