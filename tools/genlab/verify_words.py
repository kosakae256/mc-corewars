"""単語リスト（worlds/ai-build-quiz/bridge/words.json）を全部流して、目で判断するためのシートを作る。

    .venv/Scripts/python.exe verify_words.py [--size 60] [--seed 1] [--per 12] [--kind animal]

起動中の genlab サーバー（`/build`）を使う。**別プロセスでモデルを読み込まない**（VRAM が溢れる）。
出力: out/verify/report.tsv（ja, kind, en, count, out_dir, seed）と、流した順のシート out/verify/sheet-*.png（見るのは resheet.py の大きい方）。
個数が少なすぎる語は seed 2, 3 でやり直し、使った seed を report に残す（words/*.txt の seed 列に写す）
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from preview import render  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORDS = ROOT / "worlds" / "ai-build-quiz" / "bridge" / "words.json"
OUT = Path(__file__).resolve().parent / "out" / "verify"
SERVER = "http://127.0.0.1:8770"


MIN_COUNT_60 = 1500  # 60³ でこれ未満なら「細すぎ・崩れた」とみて seed を変えてやり直す（傘 1,429 が境）
RETRY_SEEDS = (2, 3)


def build(word: dict, size: int, seed: int) -> dict:
    style = {"animal": "creature", "character": "creature", "food": "food", "nature": "plant"}.get(word["kind"], "object")  # bridge の styleOf と同じ
    q = urllib.parse.urlencode({"text": word["en"], "size": size, "style": style, "seed": seed, "steps": 4})
    with urllib.request.urlopen(f"{SERVER}/build?{q}", timeout=120) as r:
        return json.load(r)


def build_retry(word: dict, size: int, seed: int) -> tuple[dict, int]:
    """語に固定 seed があればそれ 1 回。無ければ seed → 2 → 3 と、個数が足りるまで。(結果, 使った seed)"""
    if word.get("seed"):
        sd = int(word["seed"])
        return build(word, size, sd), sd
    min_count = int(MIN_COUNT_60 * (size / 60) ** 3)
    best, best_seed = None, seed
    for sd in (seed, *RETRY_SEEDS):
        res = build(word, size, sd)
        if best is None or res["count"] > best["count"]:
            best, best_seed = res, sd
        if res["count"] >= min_count:
            return res, sd
    return best, best_seed


def cell(word: dict, res: dict, w: int = 220, seed: int = 1) -> Image.Image:
    img = Image.open(Path(res["out_dir"]) / "image.png").resize((w, w))
    r = {"size": res["size"], "palette": res["palette"], "voxels": res["voxels"], "count": res["count"], "text": word["ja"]}
    pv = render(r, cell=max(3, 200 // res["size"]), views=2)
    pv = pv.resize((int(pv.width * w / pv.height), w))
    c = Image.new("RGB", (img.width + pv.width + 4, w + 18), "black")
    c.paste(img, (0, 0))
    c.paste(pv, (img.width + 4, 0))
    ImageDraw.Draw(c).text((4, w + 2), f"{word['ja']} ({word['en']})  {res['count']} blk  seed {seed}", fill=(255, 255, 0))
    return c


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=60)  # 本番と同じ（spec 14）。40 だと細い物が消える
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--per", type=int, default=12)
    ap.add_argument("--kind", default=None)
    args = ap.parse_args()
    words = json.loads(WORDS.read_text(encoding="utf-8"))
    if args.kind:
        words = [w for w in words if w["kind"] == args.kind]
    OUT.mkdir(parents=True, exist_ok=True)
    report = OUT / "report.tsv"
    done = set()
    if report.exists():
        for line in report.read_text(encoding="utf-8").splitlines():
            cols = line.split("\t")
            if len(cols) > 3 and cols[3] != "ERROR":  # ERROR（429 など）は済みに数えず、やり直す
                done.add((cols[0], cols[2]))  # en（裏プロンプト）を書き換えた語はやり直す
    todo = [w for w in words if (w["ja"], w["en"]) not in done]
    print(f"{len(words)} 語のうち {len(todo)} 語を流す（report.tsv にある語は飛ばす）", flush=True)
    t0 = time.time()
    cells: list[Image.Image] = []
    page = 0
    for i, w in enumerate(todo, 1):
        try:
            res, used_seed = build_retry(w, args.size, args.seed)
            cells.append(cell(w, res, seed=used_seed))
            with report.open("a", encoding="utf-8") as f:
                f.write("\t".join([w["ja"], w["kind"], w["en"], str(res["count"]), res["out_dir"], str(used_seed)]) + "\n")
        except Exception as e:  # noqa: BLE001
            with report.open("a", encoding="utf-8") as f:
                f.write("\t".join([w["ja"], w["kind"], w["en"], "ERROR", repr(e)]) + "\n")
        if len(cells) >= args.per or (i == len(todo) and cells):
            page += 1
            cols = 3
            cw = max(c.width for c in cells)
            ch = max(c.height for c in cells)
            rows = (len(cells) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * (cw + 6), rows * (ch + 6)), "black")
            for j, c in enumerate(cells):
                sheet.paste(c, ((j % cols) * (cw + 6), (j // cols) * (ch + 6)))
            sheet_path = OUT / f"sheet-{int(t0)}-{page:03d}.png"
            sheet.save(sheet_path)
            cells = []
            print(f"{sheet_path.name}  {i}/{len(todo)} words  {(time.time() - t0) / 60:.1f} min", flush=True)
    print("done")


if __name__ == "__main__":
    main()
