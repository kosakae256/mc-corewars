"""`out/<日時>/result.json` の 20³ を等角図の PNG にする（画面を開かずに見る用）。

    .venv/Scripts/python.exe preview.py out/20260921-023449 [--out preview.png]

三面（上・左・右）を塗った立方体を、奥から手前へ描く。ブラウザ側（three.js）と同じ palette 色。
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

from pipeline.palette import BLOCKS, DIGITS
from pipeline.voxel import SIZE

RGB = {name: rgb for name, rgb in BLOCKS}


def shade(rgb: tuple[int, int, int], k: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(c * k))) for c in rgb)


def render(result: dict, cell: int = 14, views: int = 2) -> Image.Image:
    """views=2 なら正面寄りと背面寄りの 2 方向を横に並べる。"""
    pal = result["palette"]
    v = result["voxels"]
    SIZE = int(result.get("size", 20))  # 20 決め打ちにしない（80³ の比較で踏んだ）
    panels = []
    for view in range(views):
        w = cell * SIZE * 2 + 40
        h = cell * SIZE * 2 + 40
        img = Image.new("RGB", (w, h), (20, 22, 26))
        d = ImageDraw.Draw(img)
        ox, oy = w // 2, 30 + cell * SIZE // 2
        # 奥から手前: 描画順は (x + z) が小さい → 大きい、y が低い → 高い
        cells = []
        for y in range(SIZE):
            for z in range(SIZE):
                for x in range(SIZE):
                    idx = DIGITS.index(v[y * SIZE * SIZE + z * SIZE + x])
                    if idx <= 0:
                        continue
                    # 背面寄りの図は x, z を反転して同じ描画にかける
                    xx, zz = (x, z) if view == 0 else (SIZE - 1 - x, SIZE - 1 - z)
                    cells.append((xx + zz, y, xx, zz, RGB.get(pal[idx], (200, 200, 200))))
        cells.sort(key=lambda c: (c[0], c[1]))
        hx, hy = cell // 2, cell // 4  # 等角: x は右下へ、z は左下へ
        # 20³ の箱の輪郭。大きさの基準
        def P(x, y, z):
            return (ox + (x - z) * hx, oy + (x + z) * hy - y * (cell // 2) + hy)
        S = SIZE
        for a, b in [((0,0,0),(S,0,0)),((0,0,0),(0,0,S)),((S,0,0),(S,0,S)),((0,0,S),(S,0,S)),
                     ((0,S,0),(S,S,0)),((0,S,0),(0,S,S)),((S,S,0),(S,S,S)),((0,S,S),(S,S,S)),
                     ((0,0,0),(0,S,0)),((S,0,0),(S,S,0)),((0,0,S),(0,S,S)),((S,0,S),(S,S,S))]:
            d.line([P(*a), P(*b)], fill=(70, 78, 90), width=1)
        for _, y, x, z, rgb in cells:
            px = ox + (x - z) * hx
            py = oy + (x + z) * hy - y * (cell // 2)
            top = [(px, py - hy), (px + hx, py), (px, py + hy), (px - hx, py)]
            left = [(px - hx, py), (px, py + hy), (px, py + hy + cell // 2), (px - hx, py + cell // 2)]
            right = [(px + hx, py), (px, py + hy), (px, py + hy + cell // 2), (px + hx, py + cell // 2)]
            d.polygon(top, fill=shade(rgb, 1.0))
            d.polygon(left, fill=shade(rgb, 0.7))
            d.polygon(right, fill=shade(rgb, 0.85))
        d.text((8, 8), f"{result.get('text', '')}  {result['count']} blocks  view {view}", fill=(200, 200, 200))
        panels.append(img)
    out = Image.new("RGB", (sum(p.width for p in panels), panels[0].height))
    x = 0
    for p in panels:
        out.paste(p, (x, 0))
        x += p.width
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    d = Path(args.dir)
    result = json.loads((d / "result.json").read_text(encoding="utf-8"))
    img = render(result)
    out = Path(args.out) if args.out else d / "preview.png"
    img.save(out)
    print(out)


if __name__ == "__main__":
    main()
