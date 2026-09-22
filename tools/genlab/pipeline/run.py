"""⓪→③ を順に流し、段ごとに結果と秒数を返す（サーバーと CLI の共通部）。

`run()` はジェネレータ。段が終わるたびに dict を 1 つ yield する:
  { "stage": "translate" | "image" | "model" | "voxel" | "done", "seconds": float, ... }
サーバーはこれを SSE でそのまま流す。CLI は print する。
"""

from __future__ import annotations

import base64
import io
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Iterator

from PIL import Image

from .i23d import ImageTo3D
from .i23d_hy import ImageTo3DHunyuan
from .palette import BLOCKS
from .t2i import PROFILES, TextToImage, TextToImageJa, TextToImageXL
from .translate import DEFAULT_STYLE, NEGATIVE_JA, Translator, image_prompt, image_prompt_ja, negative_prompt, resolve_style
from .voxel import MIN_SUBCELLS_THIN, SIZE, build

OUT_DIR = Path(__file__).resolve().parent.parent / "out"
# 3D の後ろ側。"hunyuan"（既定。形が良い。5-3）か "triposr"（軽い。0.3 秒・1.6 GB）
BACKEND = "hunyuan"


def factor_for(size: int) -> int:
    """20³ に対して 2 倍細かい 40³ で問い合わせ、多数決で落とす（spec 2-2）。80³ は 160³ が重いので 1 倍。"""
    return 2 if size <= 40 else 1


def palette_rgb() -> dict[str, list[int]]:
    """画面で立方体に塗る色。表は palette.py が正で、ここは写すだけ。"""
    return {name: list(rgb) for name, rgb in BLOCKS}


def _release_gpu_cache() -> None:
    import torch

    torch.cuda.empty_cache()


def _png_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


class Pipeline:
    def __init__(self) -> None:
        self.translator = Translator()
        # 生成プロファイル（docs/spec/08-genlab.md 2-1b）。v1 は起動時に読み込む。v2 は最初に使うときに読み込む（重い）
        self.t2i_by_profile = {"v1": TextToImage(), "v2": TextToImageXL(), "v3": TextToImageJa()}
        self.profile = "v1"
        self.i23d = ImageTo3DHunyuan() if BACKEND == "hunyuan" else ImageTo3D()
        self.backend = BACKEND
        self.load_seconds: dict[str, float] = {}

    @property
    def t2i(self):
        return self.t2i_by_profile[self.profile]

    def profiles_loaded(self) -> dict[str, bool]:
        return {k: v.loaded for k, v in self.t2i_by_profile.items()}

    def use_profile(self, profile: str) -> None:
        """プロファイルを切り替える。使わない方の画像モデルは CPU へ（両方を GPU に置かない。2-1b）。
        v2 の初回は読み込み（20 秒。先に prefetch_v2.py で落としておく）。"""
        if profile not in PROFILES:
            raise ValueError(f"unknown profile: {profile}")
        if profile == self.profile and self.t2i.loaded:
            return
        for k, m in self.t2i_by_profile.items():
            if k != profile:
                m.to_cpu()
        self.profile = profile
        if not self.t2i.loaded:
            self.load_seconds[f"image_{profile}"] = self.t2i.load()
        self.t2i.to_gpu()

    def load(self) -> None:
        """3 つのモデルを常駐させる。初回はダウンロードで数分かかる。"""
        self.load_seconds["translate"] = self.translator.load()
        # WordNet は初回の呼び出しで 2 秒かかるので、ここで温める
        from .kind import kind_of

        kind_of("dog")
        self.load_seconds["image"] = self.t2i_by_profile["v1"].load()
        self.load_seconds["model"] = self.i23d.load()

    def _default_threshold(self) -> float:
        from . import i23d, i23d_hy

        return i23d_hy.DEFAULT_THRESHOLD if self.backend == "hunyuan" else i23d.DEFAULT_THRESHOLD

    def run(
        self,
        text: str,
        steps: int = 4,
        solid: bool = False,
        seed: int | None = None,
        style: str = DEFAULT_STYLE,
        threshold: float | None = None,
        level: bool | None = None,
        size: int = SIZE,
        profile: str = "v1",
        text_ja: str = "",
    ) -> Iterator[dict]:
        t_all = time.perf_counter()
        self.use_profile(profile)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        out_dir = OUT_DIR / stamp
        out_dir.mkdir(parents=True, exist_ok=True)

        # ⓪ 翻訳
        t = time.perf_counter()
        english = self.translator.translate(text)
        kind = resolve_style(english.strip().rstrip(".").strip().lower(), style)
        # v3（Japanese SDXL）は日本語のまま（text_ja があれば。無ければ英語の text で）。2-1b
        japanese = self.profile == "v3" and bool(text_ja.strip())
        prompt = image_prompt_ja(text_ja, kind) if japanese else image_prompt(english, style)
        yield {"stage": "translate", "seconds": time.perf_counter() - t, "english": english, "prompt": prompt, "kind": kind, "source": self.translator.last_source}

        # ① 画像
        t = time.perf_counter()
        # v2 / v3 は VRAM がきついので、画像を作る間だけ 3D モデルを CPU へ退避する（2-1b の順番運転）
        park_3d = self.profile in ("v2", "v3") and hasattr(self.i23d, "to_device")
        if park_3d:
            self.i23d.to_device("cpu")
        try:
            negative = NEGATIVE_JA if japanese else negative_prompt(english, style)
            image = self.t2i.generate(prompt, negative, steps=steps, seed=seed)
        finally:
            if park_3d:
                self.i23d.to_device("cuda")
        image.save(out_dir / "image.png")
        yield {"stage": "image", "seconds": time.perf_counter() - t, "image": _png_data_url(image), "profile": self.profile}

        # ② 3D（前処理 ＋ 問い合わせ）
        t = time.perf_counter()
        pre = self.i23d.preprocess(image)
        pre.save(out_dir / "input.png")
        t_pre = time.perf_counter() - t
        factor = factor_for(size)
        thr = threshold if threshold is not None else self._default_threshold()
        # 傾き補正は TripoSR の癖（やや上からのカメラ前提）への対処。Hunyuan3D は直立して出るので切る
        lv = level if level is not None else (self.backend != "hunyuan")
        occ, rgb, info = self.i23d.query_grid(pre, size * factor, thr, lv)
        t_model = time.perf_counter() - t
        yield {
            "stage": "model",
            "seconds": t_model,
            "preprocess_seconds": t_pre,
            "fine_count": int(occ.sum()),
            "input": _png_data_url(pre),
            "backend": self.backend,
            **info,
        }

        # ③ ブロック化
        t = time.perf_counter()
        # TripoSR は細い部品が消えやすいので緩める。Hunyuan3D は多数決（緩めると太って溶ける）
        min_sub = MIN_SUBCELLS_THIN.get(factor) if self.backend == "triposr" else None
        result = build(occ, rgb, factor, fill=solid, min_sub=min_sub)
        total = time.perf_counter() - t_all
        record = {
            "text": text,
            "english": english,
            "prompt": prompt,
            "steps": steps,
            "solid": solid,
            "seed": seed,
            "style": style,
            "profile": self.profile,
            "threshold": thr,
            "backend": self.backend,
            "total_seconds": total,
            **result,
        }
        (out_dir / "result.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        yield {"stage": "voxel", "seconds": time.perf_counter() - t, **result}
        # 推論の一時領域をキャッシュに抱えたままにしない。同じ GPU で Minecraft が描いている
        _release_gpu_cache()
        yield {"stage": "done", "seconds": total, "out_dir": str(out_dir)}
