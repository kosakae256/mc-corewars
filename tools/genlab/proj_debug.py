"""色の投影の軸を確かめる: 4 候補の IoU と、選んだ軸から見た色付き影絵を画像と並べる。"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from pipeline.run import Pipeline, OUT_DIR
from pipeline.translate import image_prompt, negative_prompt
from pipeline import i23d_hy
from pipeline.voxel import unshade
words = sys.argv[1:] or ["家", "象", "赤い車"]
p = Pipeline(); p.load()
rows = []
for w in words:
    eng = p.translator.translate(w)
    img = p.t2i.generate(image_prompt(eng), negative_prompt(eng), steps=2, seed=7)
    rgba = p.i23d.preprocess(img)
    occ, rgb, info = p.i23d.query_grid(rgba, 40, 0.0, level=False)
    # 4 候補の IoU を全部出す
    arr = np.asarray(rgba); alpha = arr[:, :, 3] > 0
    ys, xs = np.nonzero(alpha); mask = alpha[ys.min():ys.max()+1, xs.min():xs.max()+1]
    ox = np.nonzero(occ.any(axis=(1, 2)))[0]; oy = np.nonzero(occ.any(axis=(0, 2)))[0]; oz = np.nonzero(occ.any(axis=(0, 1)))[0]
    def sil(axis, mirror):
        if axis == "x": s = occ.any(axis=0)[oy.min():oy.max()+1, oz.min():oz.max()+1]
        else: s = occ.any(axis=2)[ox.min():ox.max()+1, oy.min():oy.max()+1].T
        s = s[::-1, :]
        return s[:, ::-1] if mirror else s
    scores = {}
    for ax in ("x", "z"):
        for m in (False, True):
            s = sil(ax, m); h, wd = mask.shape
            s2 = np.asarray(Image.fromarray(s.astype(np.uint8)*255).resize((wd, h), Image.NEAREST)) > 0
            scores[f"{ax}{'-' if m else '+'}"] = round(float((s2 & mask).sum() / max(1, (s2 | mask).sum())), 3)
    print(w, "chosen", info["view"], "all", scores)
    # 選んだ軸から見た色付きの絵（一番手前のセルの色）
    axis = info["view"][0]; mirror = info["view"][1] == "-"
    col = np.zeros(occ.shape + (3,)); col[occ] = rgb[occ]
    if axis == "x":
        # x 軸に沿って手前（x 小）から見る: 各 (y,z) で最初の占有
        front = np.zeros((occ.shape[1], occ.shape[2], 3)); 
        for y in range(occ.shape[1]):
            for z in range(occ.shape[2]):
                xs_ = np.nonzero(occ[:, y, z])[0]
                if len(xs_): front[y, z] = col[xs_[0], y, z]
        view = front[::-1, :, :]
    else:
        front = np.zeros((occ.shape[1], occ.shape[0], 3))
        for y in range(occ.shape[1]):
            for x in range(occ.shape[0]):
                zs_ = np.nonzero(occ[x, y, :])[0]
                if len(zs_): front[y, x] = col[x, y, zs_[0]]
        view = front[::-1, :, :]
    if mirror: view = view[:, ::-1, :]
    vimg = Image.fromarray(view.astype(np.uint8)).resize((300, 300), Image.NEAREST)
    cells = [img.resize((300, 300)), rgba.convert("RGB").resize((300, 300)), vimg]
    row = Image.new("RGB", (sum(c.width + 4 for c in cells), 320), "black"); x = 0
    for c in cells: row.paste(c, (x, 0)); x += c.width + 4
    ImageDraw.Draw(row).text((4, 302), f"{w}  chosen {info['view']}  {scores}", fill=(255, 255, 0)); rows.append(row)
sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height + 4 for r in rows)), "black"); y = 0
for r in rows: sheet.paste(r, (0, y)); y += r.height + 4
out = OUT_DIR / "proj-debug.png"; sheet.save(out); print(out)
