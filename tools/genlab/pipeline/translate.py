"""⓪ 日本語 → 英語（**LLM は使わない**。`docs/spec/08-genlab.md` 2-0）。

画像モデル（CLIP）は日本語を読めないので、単語だけ英語にする。

1. **辞書（JMdict）を先に引く。** 単語なら辞書が一番正確で、カタカナ語も外れない
   （Marian は ロケット → "Lockett"、ぬいぐるみ → "Creep" と訳した。2026-09-21）。
   表は `build_jmdict.py` が `jmdict_min.json` に作る。無ければこの段は飛ばす
2. 辞書に無い句（「赤い車」）は `Helsinki-NLP/opus-mt-ja-en`（Marian, 約 300 MB）を **CPU** で。VRAM 0

入力が ASCII だけなら翻訳しない（英語で打った場合はそのまま）。
"""

from __future__ import annotations

import json
import time
from pathlib import Path

MODEL_ID = "Helsinki-NLP/opus-mt-ja-en"
MT_MAX_TOKENS = 512  # Marian の位置埋め込みの上限
MT_MAX_CHARS = 300  # そもそも長文は訳さない（画像は先頭 77 トークンしか読まない）
DICT_PATH = Path(__file__).resolve().parent / "jmdict_min.json"


class Translator:
    """起動時に 1 回 load() し、以後 translate() を呼ぶ。"""

    def __init__(self) -> None:
        self._tok = None
        self._model = None
        self._dict: dict[str, str] = {}
        self.last_source = ""  # "dict" | "mt" | "ascii"。画面に出す

    def load(self) -> float:
        from transformers import MarianMTModel, MarianTokenizer

        t = time.perf_counter()
        if DICT_PATH.exists():
            self._dict = json.loads(DICT_PATH.read_text(encoding="utf-8"))
        self._tok = MarianTokenizer.from_pretrained(MODEL_ID)
        self._model = MarianMTModel.from_pretrained(MODEL_ID)
        self._model.eval()
        return time.perf_counter() - t

    def translate(self, text: str) -> str:
        """日本語なら英語に。辞書 → 機械翻訳の順。ASCII だけならそのまま返す。"""
        text = text.strip()
        if not text:
            return ""
        if text.isascii():
            self.last_source = "ascii"
            return text
        hit = self._dict.get(text) or self._dict.get(text.replace(" ", ""))
        if hit:
            self.last_source = "dict"
            return hit
        self.last_source = "mt"
        assert self._tok is not None and self._model is not None, "load() が先"
        import torch

        # **長い文は切る。** 切らないと Marian の位置埋め込みを超えて
        # `IndexError: index out of range in self` → genlab が 500 を返す（2026-09-22 実機。出題モードの長い詳細）。
        # 画像モデルが読むのは先頭 77 トークンだけなので、切っても絵は変わらない（08-genlab 2-0）
        with torch.no_grad():
            batch = self._tok([text[:MT_MAX_CHARS]], return_tensors="pt", truncation=True, max_length=MT_MAX_TOKENS)
            out = self._model.generate(**batch, max_new_tokens=32, num_beams=2)
        return self._tok.batch_decode(out, skip_special_tokens=True)[0].strip()


STYLES = {
    # 生き物: 全身が要る。「full body」が無いと顔のアップになる（2026-09-21 に踏んだ）
    # 生き物: 「toy figurine」＋「full body」が全身を安定して出す唯一の言い方だった（2026-09-21 比較）。
    # 「wide shot, full body」だけだと猫は顔のアップに戻る
    "creature": "a toy figurine of a {x}, full body, three-quarter front view, eye-level shot, standing on a flat white floor, single figure, centered, plain white background, studio product photo",
    # 物: 「toy figurine」は主語を乗っ取る（本 → ロボット、剣 → 騎士）。「product photo」は画面いっぱいに寄る。
    # 「small in frame」は SD が**本物の額縁**を描く（家・車・本で発生）。
    # 「one {x}, alone, isolated … clean 3D render」が、1 体・全体・額縁なしで最も安定した（2026-09-21 img_ab.py）
    "object": "one {x}, alone, isolated on a plain white background, the entire {x} visible, three-quarter view at eye level, clean 3D render",
    # 食べ物: 物の定型だと**接写・山盛り・切り口**になる（レモンの輪切りの山、ブドウの壁紙）。
    # 「食品サンプル（plastic food replica）を白い台に 1 個」が唯一、1 個・丸ごとで出た（2026-09-21 food_ab.py、4 通り × 16 語）
    "food": "a plastic food replica of a single whole {x}, alone on a white table, isolated on a plain white background, whole item visible with empty space around it, three-quarter view at eye level, product photo",
    # 植物・自然物: 物の定型だと**風景**になる（木は野原、山は遠景）。プラモデルなら 1 本で出る（同上。木・サボテン・花で確認）
    "plant": "a plastic model of a single whole {x}, alone on a white table, isolated on a plain white background, whole item visible with empty space around it, three-quarter view at eye level, product photo",
    # 以下は比較用に残す
    "plain": "a {x}, full body, the whole {x} visible, single object, centered, plain white background, 3D render, isometric view, soft studio lighting",
    "figurine": "a toy figurine of a {x}, three-quarter front view, eye-level shot, camera at ground level, full body, standing on a flat white floor, single object, centered, plain white background, studio product photo",
    "lowpoly": "a low-poly 3D model of a {x}, three-quarter view from slightly above, full body, single object, centered, plain white background, flat colors, game asset render",
}
DEFAULT_STYLE = "auto"  # WordNet で creature / object を選ぶ（kind.py）

NEGATIVES = {
    "creature": "close-up, portrait, cropped, head only, top-down view, aerial view, text, watermark, multiple animals, blurry, background scenery",
    "object": "frame, border, box, multiple objects, duplicate, snow, ground texture, person, human, figurine, toy robot, hand, character, close-up, cropped, top-down view, aerial view, text, watermark, blurry, background scenery",
    "food": "many, pile, group, multiple, pattern, sliced, cut, half, close-up, macro, cropped, plate, bowl, hand, person, text, watermark, blurry, top-down view, background scenery",
    "plant": "many, pile, group, multiple, pattern, forest, field, landscape, scenery, close-up, macro, cropped, hand, person, text, watermark, blurry, top-down view, aerial view",
}


def resolve_style(english: str, style: str) -> str:
    """"auto" なら WordNet で creature / object を決める。"""
    if style != "auto":
        return style
    from .kind import kind_of

    return kind_of(english)


def image_prompt(english: str, style: str = DEFAULT_STYLE) -> str:
    """画像モデルに渡す文。**機械的に定型を足す**（2-0）。

    画像→3D は「1 つの物体・中央・無地の背景」を前提に学習されているので、その形の絵を出させる。
    定型は生き物と物で分ける（STYLES の注釈）。
    """
    core = english.strip().rstrip(".").strip().lower()
    return STYLES[resolve_style(core, style)].replace("{x}", core)


def negative_prompt(english: str, style: str = DEFAULT_STYLE) -> str:
    st = resolve_style(english.strip().rstrip(".").strip().lower(), style)
    return NEGATIVES.get(st, NEGATIVES["object"])


NEGATIVE_PROMPT = NEGATIVES["object"]


# v3（Japanese SDXL）用の日本語の定型（docs/spec/08-genlab.md 2-1b）。英語の STYLES と同じ意図を日本語で。未検証（2026-09-22 準備のみ）
STYLES_JA = {
    "creature": "{x}のフィギュア、全身、斜め前から、目の高さ、白い床に立っている、1体だけ、中央、無地の白い背景、商品写真",
    "object": "{x}、1つだけ、白い背景に単体で、全体が見える、斜め前から目の高さ、きれいな3Dレンダー",
    "food": "{x}の食品サンプル、丸ごと1つ、白いテーブルの上に単体で、無地の白い背景、周りに余白、斜め前から目の高さ、商品写真",
    "plant": "{x}のプラモデル、丸ごと1つ、白いテーブルの上に単体で、無地の白い背景、周りに余白、斜め前から目の高さ、商品写真",
    "auto": "{x}、1つだけ、白い背景に単体で、全体が見える、斜め前から目の高さ、商品写真",
}
# 「かーびぃ」で 2×2 の顔のグリッドが出た（2026-09-22）→ グリッド・コラージュ・顔のアップを negative に
NEGATIVE_JA = "低品質、ぼやけ、複数、群れ、切れている、文字、ロゴ、背景に物、風景、接写、顔のアップ、グリッド、コラージュ、分割画像、4枚、複数の画像"


def image_prompt_ja(text_ja: str, style: str) -> str:
    """v3: 日本語のまま定型に入れる（翻訳しない）"""
    return STYLES_JA.get(style, STYLES_JA["auto"]).format(x=text_ja.strip())
