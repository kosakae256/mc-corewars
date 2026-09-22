"""CLI で 1 語流して、段ごとの秒数と各層の絵を出す（サーバー無しで確かめる用）。

    .venv/Scripts/python.exe bench.py 犬 [--steps 2] [--shell] [--repeat 2]

初回はモデルのダウンロードと読み込みで数分かかる。**秒数は 2 回目以降を見る。**
"""

from __future__ import annotations

import argparse

from pipeline.run import Pipeline
from pipeline.voxel import ascii_layers


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("text")
    ap.add_argument("--steps", type=int, default=1)
    ap.add_argument("--shell", action="store_true", help="中を詰めない")
    ap.add_argument("--repeat", type=int, default=2, help="同じ語を何回流すか（2 回目以降が本当の速さ）")
    ap.add_argument("--layers", action="store_true", help="各層を文字で出す")
    args = ap.parse_args()

    p = Pipeline()
    p.load()
    print("load:", {k: round(v, 1) for k, v in p.load_seconds.items()})

    import torch

    for i in range(args.repeat):
        print(f"=== run {i + 1} ===")
        for ev in p.run(args.text, steps=args.steps, solid=not args.shell):
            extra = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in ev.items() if k in ("english", "count", "palette", "fine_count", "coarse_count", "pitch", "roll", "contact_before", "contact_after", "preprocess_seconds", "out_dir")}
            print(f"  {ev['stage']:10s} {ev['seconds']:6.2f}s  {extra}")
            if ev["stage"] == "voxel" and args.layers:
                print(ascii_layers(ev["voxels"]))
        free, total = torch.cuda.mem_get_info()
        print(f"  VRAM used by all processes: {(total - free) / 2**30:.1f} / {total / 2**30:.1f} GB")


if __name__ == "__main__":
    main()
