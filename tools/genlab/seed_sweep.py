"""判断に迷う語を、seed を変えて何通りか流し、1 語 1 行で並べる（固定 seed を決めるため）。

    .venv/Scripts/python.exe seed_sweep.py --seeds 1,2,3,4,5 bus airplane helicopter ...

起動中の genlab サーバー（`/build`）を使う（verify_words.py と同じ。別の要求と同時に投げると 429 になる）。
出力: out/verify/seeds/<en>.png（左から seed 順）と out/verify/seeds/report.tsv（en, seed, count, out_dir）
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from resheet import cell  # noqa: E402
from verify_words import WORDS, build  # noqa: E402

OUT = Path(__file__).resolve().parent / "out" / "verify" / "seeds"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=40)
    ap.add_argument("--seeds", default="1,2,3,4,5")
    ap.add_argument("names", nargs="+")
    args = ap.parse_args()
    seeds = [int(s) for s in args.seeds.split(",")]
    words = {w["en"]: w for w in json.loads(WORDS.read_text(encoding="utf-8"))}
    OUT.mkdir(parents=True, exist_ok=True)
    report = OUT / "report.tsv"
    for name in args.names:
        w = words.get(name)
        if w is None:
            print("words.json に無い:", name)
            continue
        w = {**w, "seed": None}  # 固定 seed があっても、ここでは引数の seed で流す
        cells = []
        for sd in seeds:
            try:
                res = build(w, args.size, sd)
            except Exception as e:  # noqa: BLE001
                print(name, sd, "ERROR", e)
                continue
            c = cell(w["ja"], f"{w['en']} seed {sd}", res["out_dir"], w=240)
            cells.append(c)
            with report.open("a", encoding="utf-8") as f:
                f.write(f"{name}\t{sd}\t{res['count']}\t{res['out_dir']}\n")
        if not cells:
            continue
        sheet = Image.new("RGB", (sum(c.width + 6 for c in cells), max(c.height for c in cells)), "black")
        x = 0
        for c in cells:
            sheet.paste(c, (x, 0))
            x += c.width + 6
        path = OUT / f"{name.replace('/', '_')}.png"
        sheet.save(path)
        print(path.name, flush=True)


if __name__ == "__main__":
    main()
