"""英語の語が「生き物」か「物」かを **WordNet で決める**（LLM は使わない。`docs/spec/08-genlab.md` 2-0）。

## なぜ要るか

画像の定型を 1 本にすると主語を乗っ取る（2026-09-21 の比較）:
- 「toy figurine of a book」→ ロボットのおもちゃが出る。「… of a sword」→ 剣を持った騎士
- 「3D model of a cat」→ 顔のアップ（全身が出ない）

**生き物には「全身」、物には「製品写真」**の定型を当てる。
その判定を WordNet（英語の語彙辞典。オフライン・数 MB）の上位語で行う。
語の**最後の単語**を見出しにする（"red car" → car）。辞書に無い語（固有名詞など）は「物」扱い。
"""

from __future__ import annotations

CREATURE_ROOTS = {"animal.n.01", "person.n.01", "imaginary_being.n.01", "spiritual_being.n.01"}

_ready = False


def _ensure() -> None:
    """初回だけ WordNet を用意する。無ければ落とす（初回はネットが要る）。"""
    global _ready
    if _ready:
        return
    import nltk

    try:
        from nltk.corpus import wordnet as wn

        wn.synsets("dog")
    except LookupError:
        nltk.download("wordnet", quiet=True)
        nltk.download("omw-1.4", quiet=True)
    _ready = True


def kind_of(english: str) -> str:
    """"creature" か "object"。分からなければ "object"。"""
    _ensure()
    from nltk.corpus import wordnet as wn

    words = english.strip().lower().replace(".", "").split()
    if not words:
        return "object"
    syns = wn.synsets(words[-1], pos=wn.NOUN)
    if not syns:
        return "object"
    # 最初の意味（最も普通の意味）だけ見る。全部見ると "bat"（棒）まで生き物になる
    s = syns[0]
    hyper = {h.name() for h in s.closure(lambda x: x.hypernyms())} | {s.name()}
    return "creature" if hyper & CREATURE_ROOTS else "object"
