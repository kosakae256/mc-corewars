"""複数の語を流して、それぞれ image.png と preview.png を横に並べた 1 枚（out/batch-<日時>.png）にする。

    .venv/Scripts/python.exe batch.py 犬 車 ロケット 家 [--steps 1]
"""
from __future__ import annotations
import argparse, json
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from preview import render

ap = argparse.ArgumentParser(); ap.add_argument("words", nargs="+"); ap.add_argument("--steps", type=int, default=4); ap.add_argument("--fill", action="store_true"); ap.add_argument("--seed", type=int, default=None)
args = ap.parse_args()
p = Pipeline(); p.load()
rows = []
for w in args.words:
    last = None
    for ev in p.run(w, steps=args.steps, solid=args.fill, seed=args.seed):
        if ev["stage"] == "done": last = ev
    d = Path(last["out_dir"]); r = json.loads((d / "result.json").read_text(encoding="utf-8"))
    img = Image.open(d / "image.png").resize((260, 260)); pv = render(r, cell=10, views=2); pv = pv.resize((int(pv.width * 260 / pv.height), 260))
    row = Image.new("RGB", (img.width + pv.width + 8, 260), "black"); row.paste(img, (0, 0)); row.paste(pv, (img.width + 8, 0))
    ImageDraw.Draw(row).text((4, 244), f"{w} -> {r['english']}  {r['count']} blocks  {last['seconds']:.2f}s", fill=(255, 255, 0))
    rows.append(row); print(w, r["english"], r["count"], f"{last['seconds']:.2f}s")
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 4 for r in rows)), "black")
y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 4
out = OUT_DIR / f"batch-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png"; sheet.save(out); print(out)
