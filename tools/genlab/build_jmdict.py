"""JMdict（和英辞書・EDRDG, CC BY-SA 4.0）から、単語 → 英語 の小さな表を作る。

    .venv/Scripts/python.exe build_jmdict.py

`docs/spec/08-genlab.md` 2-0。Marian の機械翻訳は**カタカナ語に弱い**（ロケット → Lockett）。
**単語なら辞書が一番正確**なので、辞書を先に引き、無いときだけ翻訳する。

出力 `pipeline/jmdict_min.json` は git 管理外（数 MB・取り直せる）。無ければ翻訳だけで動く。
"""

from __future__ import annotations

import gzip
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz"
OUT = Path(__file__).resolve().parent / "pipeline" / "jmdict_min.json"
CACHE = Path(__file__).resolve().parent / "out" / "JMdict_e.gz"

# 名詞として使えそうな品詞。画像にするのは「物」なので、動詞・形容詞だけの語は捨てる
PRI_WEIGHT = {"ichi1": 3.0, "ichi2": 1.5, "spec1": 2.0, "spec2": 1.0, "gai1": 2.0, "gai2": 1.0, "news1": 1.0, "news2": 0.5}

NOUN_POS = {"noun (common) (futsuumeishi)", "noun or verb acting prenominally", "proper noun"}


def clean(gloss: str) -> str:
    """"rocket (vehicle)" → "rocket"。括弧書きと to- 不定詞を落とす。"""
    g = gloss
    while "(" in g:  # 入れ子（"dog (Canis (lupus) familiaris)"）は 1 回では取れない
        g2 = re.sub(r"\([^()]*\)", "", g)
        if g2 == g:
            break
        g = g2
    g = g.strip()
    g = re.sub(r"\s+", " ", g)
    return g


def main() -> None:
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        print("downloading", URL)
        urllib.request.urlretrieve(URL, CACHE)
    table: dict[str, str] = {}
    prio: dict[str, float] = {}
    with gzip.open(CACHE, "rb") as f:
        for _, elem in ET.iterparse(f, events=("end",)):
            if elem.tag != "entry":
                continue
            # 表記ごとに、**その表記自身の**常用マーカーで優先度を付ける。
            # 項目全体で数えると「もと（元・本・素・基）」のように漢字が多い項目が勝ってしまう。
            # nfXX は頻度順位（小さいほど頻出）なので、それも足す
            forms: list[tuple[str, float]] = []
            for ele, txt, pri in (("k_ele", "keb", "ke_pri"), ("r_ele", "reb", "re_pri")):
                for i, e in enumerate(elem.findall(ele)):
                    w = e.findtext(txt)
                    pris = [x.text for x in e.findall(pri)]
                    # ichi1（基本語彙 1 万語）は news1（新聞頻度）より「基本の意味」の指標として強い:
                    # 象 = しょう(news1, 形) と ぞう(ichi1, 動物) なら動物を取りたい
                    score = sum(PRI_WEIGHT.get(t, 0.0) for t in pris)
                    for t in pris:
                        if t and t.startswith("nf"):
                            score += (50 - int(t[2:])) / 50
                    # 項目の最初の表記なら少し加点: 本 = もと(元・本…) より ほん(本) を取りたい
                    if i == 0:
                        score += 0.5
                    forms.append((w, score))
            gloss = None
            for sense in elem.findall("sense"):
                pos = {p.text for p in sense.findall("pos")}
                if pos and not (pos & NOUN_POS):
                    continue
                for g in sense.findall("gloss"):
                    if g.text and (g.get("{http://www.w3.org/XML/1998/namespace}lang") in (None, "eng")):
                        gloss = clean(g.text)
                        break
                if gloss:
                    break
            elem.clear()
            if not gloss:
                continue
            for w, score in forms:
                if not w:
                    continue
                if w not in table or score > prio.get(w, -1):
                    table[w] = gloss
                    prio[w] = score
    OUT.write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(table), "entries ->", OUT)
    for w in ["犬", "ロケット", "ぬいぐるみ", "ピカチュウ", "寿司", "東京タワー", "家", "本", "車"]:
        print(f"  {w} -> {table.get(w)}")


if __name__ == "__main__":
    main()
