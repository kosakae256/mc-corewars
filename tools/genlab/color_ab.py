"""色の付け方を比べる（40³）。同じ占有・同じ投影色で、量子化だけ変える。"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline.translate import image_prompt, negative_prompt
from pipeline import voxel
from preview import render

def unshade_bands(rgb, occ, bands=(0.62, 0.30)):
    """無彩色（灰）は明るさの帯で 3 段に分け、白・灰・黒を残す。有彩色は今までどおり明るい方に揃える。"""
    out = rgb.copy(); pts = rgb[occ]
    if len(pts) == 0: return out
    mx = pts.max(axis=1); safe = np.maximum(mx, 1.0)
    chroma = pts / safe[:, None]; sat = 1.0 - pts.min(axis=1) / safe
    neutral = sat < voxel.GRAY_SAT
    dark = mx < voxel.DARK_MAX
    fixed = pts.copy()
    # 有彩色: 色味ごとに上位 90% の明るさへ
    key = np.round(chroma * 3).astype(np.int64); key = key[:, 0] * 16 + key[:, 1] * 4 + key[:, 2]
    for k in np.unique(key[~neutral & ~dark]):
        sel = (key == k) & ~neutral & ~dark
        bright = np.percentile(mx[sel], 90); fixed[sel] = np.clip(chroma[sel] * bright, 0, 255)
    # 無彩色: 物体の中での相対的な明るさで 3 段
    sel = neutral & ~dark
    if sel.any():
        top = np.percentile(mx[sel], 90)
        rel = mx[sel] / max(top, 1.0)
        level = np.where(rel >= bands[0], top, np.where(rel >= bands[1], top * 0.55, top * 0.2))
        fixed[sel] = np.clip(level[:, None] * np.ones((1, 3)), 0, 255)
    out[occ] = fixed
    return out

def saturate(rgb, occ, k=1.5):
    """彩度を上げる（HSV の S を k 倍）。"""
    out = rgb.copy(); pts = rgb[occ] / 255.0
    mx = pts.max(axis=1); mn = pts.min(axis=1)
    mean = pts.mean(axis=1, keepdims=True)
    boosted = np.clip(mean + (pts - mean) * k, 0, 1)
    out[occ] = boosted * 255.0
    return out

words = sys.argv[1:] or ["飛行機", "赤い車", "電車"]
p = Pipeline(); p.load()
rows = []
for w in words:
    eng = p.translator.translate(w)
    img = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=4, seed=11)
    rgba = p.i23d.preprocess(img)
    occ, rgb, info = p.i23d.query_grid(rgba, 40, 0.0)
    cases = [
        ("A 今のまま", voxel.unshade(rgb, occ)),
        ("B 灰を 3 段で残す", unshade_bands(rgb, occ)),
        ("C B + 彩度 1.5 倍", saturate(unshade_bands(rgb, occ), occ, 1.5)),
        ("D 影処理なし（生の色）", rgb),
    ]
    cells = [img.resize((300, 300))]
    for name, col in cases:
        r = voxel.encode(occ, col); r["text"] = name
        pv = render(r, cell=7, views=2); pv = pv.resize((int(pv.width * 300 / pv.height), 300))
        ImageDraw.Draw(pv).text((6, 282), f"{w} {name}  {', '.join(r['palette'][1:7])}", fill=(255, 255, 0)); cells.append(pv)
    row = Image.new("RGB", (sum(c.width + 4 for c in cells), 300), "black"); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 6 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 6
out = OUT_DIR / "color-ab.png"; sheet.save(out); print(out)
