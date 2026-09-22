"""日本語版 Wikipedia の日英対訳（記事名 → 英語版の記事名）を辞書にする（`docs/spec/08-genlab.md` 2-0b）。

    .venv/Scripts/python.exe build_wikititles.py

入力（wikidump/ に置く。https://dumps.wikimedia.org/jawiki/latest/ から。CC BY-SA）:
  jawiki-latest-page.sql.gz       記事 ID → 題名
  jawiki-latest-langlinks.sql.gz  記事 ID → 英語版の題名（ll_lang = 'en'）
  jawiki-latest-redirect.sql.gz   リダイレクト（別名・かな表記）→ 記事
出力: pipeline/wikititles_ja_en.json  { 日本語の題名（記事・リダイレクト。空白を除いた形）: 英語の題名 }

出題モードで、単語リストにも JMdict にも無い固有名詞（ジバニャン → Jibanyan、アルセウス → Arceus）を引くため。
実行時は表を引くだけ（LLM なし・GPU なし）。
"""

from __future__ import annotations

import gzip
import json
import re
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DUMP = HERE / "wikidump"
OUT = HERE / "pipeline" / "wikititles_ja_en.json"

# INSERT 文の 1 行（タプル）を取り出す。値の中の ' は \' でエスケープされている
ROW = re.compile(r"\((\d+),(\d+),'((?:[^'\\]|\\.)*)'")  # page: (id, ns, 'title', ...
LL = re.compile(r"\((\d+),'en','((?:[^'\\]|\\.)*)'")  # langlinks: (from, 'en', 'title')
RD = re.compile(r"\((\d+),(\d+),'((?:[^'\\]|\\.)*)'")  # redirect: (from, ns, 'title', ...


def unescape(s: str) -> str:
    return s.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\").replace("_", " ")


def key(title: str) -> str:
    """引くときの形: 空白を除く。括弧の注釈（曖昧さ回避）は落とさない（別に落とした形も登録する）"""
    return title.replace(" ", "").replace("　", "")


def main() -> None:
    t0 = time.perf_counter()
    # ① 記事 ID → 題名（ns 0 だけ）
    titles: dict[int, str] = {}
    with gzip.open(DUMP / "jawiki-latest-page.sql.gz", "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            if not (line.startswith("INSERT INTO") or line.startswith("(")):
                continue  # 値の行は "INSERT INTO ... VALUES" の次の行から "(" で始まる
            for m in ROW.finditer(line):
                if m.group(2) == "0":
                    titles[int(m.group(1))] = unescape(m.group(3))
    print(f"page: {len(titles)} 記事 ({time.perf_counter() - t0:.0f}s)")

    # ② 記事 ID → 英語の題名
    en_of: dict[int, str] = {}
    with gzip.open(DUMP / "jawiki-latest-langlinks.sql.gz", "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            if not (line.startswith("INSERT INTO") or line.startswith("(")):
                continue  # 値の行は "INSERT INTO ... VALUES" の次の行から "(" で始まる
            for m in LL.finditer(line):
                pid = int(m.group(1))
                if pid in titles:
                    en_of[pid] = unescape(m.group(2))
    print(f"langlinks(en): {len(en_of)} ({time.perf_counter() - t0:.0f}s)")

    # ③ 日本語の題名 → 英語
    out: dict[str, str] = {}
    for pid, en in en_of.items():
        ja = titles[pid]
        out.setdefault(key(ja), en)
        # 「胡桃 (原神)」→「胡桃」でも引けるように（先勝ち＝先に来た記事が優先）
        bare = re.sub(r"\s*[（(].*?[）)]\s*$", "", ja)
        if bare and bare != ja:
            out.setdefault(key(bare), en)

    # ④ リダイレクト（別名・かな表記）→ 記事の英語
    title_to_pid = {v: k for k, v in titles.items()}
    n_rd = 0
    with gzip.open(DUMP / "jawiki-latest-redirect.sql.gz", "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            if not (line.startswith("INSERT INTO") or line.startswith("(")):
                continue  # 値の行は "INSERT INTO ... VALUES" の次の行から "(" で始まる
            for m in RD.finditer(line):
                if m.group(2) != "0":
                    continue
                src = titles.get(int(m.group(1)))
                dst_pid = title_to_pid.get(unescape(m.group(3)))
                if src is None or dst_pid is None or dst_pid not in en_of:
                    continue
                if out.setdefault(key(src), en_of[dst_pid]) == en_of[dst_pid]:
                    n_rd += 1
    print(f"redirect: {n_rd} ({time.perf_counter() - t0:.0f}s)")

    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"→ {OUT} {len(out)} 件 {OUT.stat().st_size / 1e6:.1f} MB")
    for probe in ["ジバニャン", "アルセウス", "グラードン", "ミュウツー", "東京スカイツリー", "カービィ", "胡桃", "ドラえもん", "ヒカキン"]:
        print(" ", probe, "→", out.get(probe))


if __name__ == "__main__":
    main()
