"""verify_words.py の結果（out/verify/report.tsv）から、ボクセルを**大きく**描き直したシートを作る。

    .venv/Scripts/python.exe resheet.py [--per 6] [--kind animal]

verify_words.py のシートは 40³ の箱ごと描くので物が小さく、目で判断できなかった。
ここでは物の占める範囲だけ切り出して描く（生成はしない。result.json を読むだけ）。
出力: out/verify/big/<kind>-<n>.png
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline.palette import DIGITS  # noqa: E402
from preview import render  # noqa: E402

OUT = Path(__file__).resolve().parent / "out" / "verify"


def crop(result: dict) -> dict:
    """占有ボクセルの外接立方体に切り出す（等角図で大きく描くため）"""
    s = int(result["size"])
    v = result["voxels"]
    xs, ys, zs = [], [], []
    for i, ch in enumerate(v):
        if ch != DIGITS[0]:
            y, r = divmod(i, s * s)
            z, x = divmod(r, s)
            xs.append(x)
            ys.append(y)
            zs.append(z)
    if not xs:
        return result
    n = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) + 1
    x0, y0, z0 = min(xs), min(ys), min(zs)
    out = [DIGITS[0]] * (n * n * n)
    for i, ch in enumerate(v):
        if ch == DIGITS[0]:
            continue
        y, r = divmod(i, s * s)
        z, x = divmod(r, s)
        out[(y - y0) * n * n + (z - z0) * n + (x - x0)] = ch
    return {**result, "size": n, "voxels": "".join(out)}


def cell(ja: str, en: str, out_dir: str, w: int = 300, seed: str = "") -> Image.Image:
    d = Path(out_dir)
    res = json.loads((d / "result.json").read_text(encoding="utf-8"))
    img = Image.open(d / "image.png").resize((w, w))
    c = crop(res)
    pv = render(c, cell=max(4, 520 // c["size"]), views=2)
    pv = pv.crop(pv.convert("L").point(lambda p: 255 if p > 40 else 0).getbbox() or (0, 0, pv.width, pv.height))
    pv = pv.resize((int(pv.width * w / pv.height), w))
    out = Image.new("RGB", (img.width + pv.width + 4, w + 20), "black")
    out.paste(img, (0, 0))
    out.paste(pv, (img.width + 4, 0))
    ImageDraw.Draw(out).text((4, w + 4), f"{ja} ({en})  {res['count']} blk" + (f"  seed {seed}" if seed else ""), fill=(255, 255, 0))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=8)
    ap.add_argument("--force", action="store_true", help="既にあるシートも作り直す")
    ap.add_argument("--kind", default=None)
    args = ap.parse_args()
    rows = [line.split("\t") for line in (OUT / "report.tsv").read_text(encoding="utf-8").splitlines()]
    rows = [r for r in rows if len(r) >= 5 and r[3] != "ERROR" and (args.kind is None or r[1] == args.kind)]
    big = OUT / "big"
    big.mkdir(exist_ok=True)
    by_kind: dict[str, list[list[str]]] = {}
    for r in rows:
        by_kind.setdefault(r[1], []).append(r)
    for kind, ws in by_kind.items():
        for page, start in enumerate(range(0, len(ws), args.per)):
            path = big / f"{kind}-{page + 1:02d}.png"
            if path.exists() and not args.force:
                continue
            cells = [cell(r[0], r[2], r[4], seed=(r[5] if len(r) > 5 else "")) for r in ws[start : start + args.per]]
            cols = 2
            cw = max(c.width for c in cells)
            ch = max(c.height for c in cells)
            rowsn = (len(cells) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * (cw + 6), rowsn * (ch + 6)), "black")
            for i, c in enumerate(cells):
                sheet.paste(c, ((i % cols) * (cw + 6), (i // cols) * (ch + 6)))
            sheet.save(path)
            print(path.name, flush=True)


if __name__ == "__main__":
    main()
