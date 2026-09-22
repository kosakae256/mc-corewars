"""① 文章 → 画像（`docs/spec/08-genlab.md` 2-1 / 2-1b）。

3 つのプロファイル:

- **v1 `sd-turbo`**（SD 2.1 の蒸留版。1 step で絵が出る。fp16 で約 2.5 GB、GPU に常駐）
- **v2 `sdxl-turbo`**（SDXL の蒸留版。知っている概念が多い。fp16 で約 7 GB）
- **v3 `japanese-stable-diffusion-xl`**（SDXL 1.0 の日本語微調整。**日本語のプロンプトをそのまま読む**。fp16 約 6.5 GB。gated）

> ### SDXL-Turbo をそのまま GPU に置くのはやめた（2026-09-21）
>
> fp16 で約 7 GB。Minecraft（2.3 GB）と 3D モデルを足すと **12 GB を溢れてスワップ**し、
> 2 step に 39 秒かかった。
>
> ### → v2 は「順番運転」で収める（2026-09-22・準備のみ、未検証）
>
> `enable_model_cpu_offload()` で重みは CPU RAM に置き、使う部品だけ GPU に上げる（UNet 5.1 GB が瞬間の最大）。
> 3D モデルは画像を作る間だけ CPU へ退避する（`run.py`）。v1 と v2 を同時に GPU には置かない。

モデルを替えるときはここの中だけ触る（他の段は画像しか見ない）。
"""

from __future__ import annotations

import time

from PIL import Image

MODEL_ID = "stabilityai/sd-turbo"
MODEL_ID_XL = "stabilityai/sdxl-turbo"
MODEL_ID_JA = "stabilityai/japanese-stable-diffusion-xl"
SIZE = 512  # sd-turbo / sdxl-turbo の学習解像度。3D 側も 512 で十分
SIZE_JA = 768  # JSDXL は 1024 が本来。VRAM と時間の折衷で 768
STEPS_JA = 25
GUIDANCE_JA = 7.0

PROFILES = ("v1", "v2", "v3")


class TextToImage:
    """v1: sd-turbo。GPU に常駐。v2 を使う間は `to_cpu()` で退避できる。"""

    profile = "v1"

    def __init__(self) -> None:
        self._pipe = None
        self._on_gpu = False

    @property
    def loaded(self) -> bool:
        return self._pipe is not None

    def load(self) -> float:
        import torch
        from diffusers import AutoPipelineForText2Image

        t = time.perf_counter()
        pipe = AutoPipelineForText2Image.from_pretrained(
            # diffusers 0.39 の引数名は torch_dtype（0.40 で dtype に改名）。
            # 間違えると**黙って無視されて fp32（2 倍の VRAM）**になる。2026-09-21 に踏んだ
            MODEL_ID, torch_dtype=torch.float16, variant="fp16", safety_checker=None
        )
        pipe.to("cuda")
        # 進捗バーはサーバーのログを汚すだけなので切る
        pipe.set_progress_bar_config(disable=True)
        self._pipe = pipe
        self._on_gpu = True
        return time.perf_counter() - t

    def to_gpu(self) -> None:
        if self._pipe is not None and not self._on_gpu:
            self._pipe.to("cuda")
            self._on_gpu = True

    def to_cpu(self) -> None:
        if self._pipe is not None and self._on_gpu:
            self._pipe.to("cpu")
            self._on_gpu = False

    def generate(self, prompt: str, negative: str, steps: int, seed: int | None) -> Image.Image:
        """1 枚出す。turbo 系は guidance を 0 にするのが作法（付けると崩れる）。"""
        assert self._pipe is not None, "load() が先"
        self.to_gpu()
        import torch

        gen = None
        if seed is not None:
            gen = torch.Generator(device="cuda").manual_seed(seed)
        out = self._pipe(
            prompt=prompt,
            negative_prompt=negative,
            num_inference_steps=max(1, steps),
            guidance_scale=0.0,
            height=SIZE,
            width=SIZE,
            generator=gen,
        )
        return out.images[0]


class TextToImageXL:
    """v2: sdxl-turbo。重みは CPU RAM、使う部品だけ GPU（`enable_model_cpu_offload`）。

    初回の `load()` はダウンロード込みで数分かかることがある → 先に `prefetch_v2.py` で落としておく。
    """

    profile = "v2"

    def __init__(self) -> None:
        self._pipe = None

    @property
    def loaded(self) -> bool:
        return self._pipe is not None

    def load(self) -> float:
        import torch
        from diffusers import AutoPipelineForText2Image

        t = time.perf_counter()
        pipe = AutoPipelineForText2Image.from_pretrained(MODEL_ID_XL, torch_dtype=torch.float16, variant="fp16")
        # GPU に常駐させない。使う部品だけ上げて、終わったら CPU へ戻る（VRAM の瞬間最大 ≈ UNet 5.1 GB ＋ 作業）
        pipe.enable_model_cpu_offload()
        pipe.set_progress_bar_config(disable=True)
        self._pipe = pipe
        return time.perf_counter() - t

    def to_gpu(self) -> None:
        """オフロード運転なので何もしない（呼ばれたときに勝手に上がる）"""

    def to_cpu(self) -> None:
        """同上。使い終わった部品は既に CPU にある"""

    def generate(self, prompt: str, negative: str, steps: int, seed: int | None) -> Image.Image:
        assert self._pipe is not None, "load() が先"
        import torch

        gen = None
        if seed is not None:
            gen = torch.Generator(device="cuda").manual_seed(seed)
        out = self._pipe(
            prompt=prompt,
            negative_prompt=negative,
            num_inference_steps=max(1, steps),
            guidance_scale=0.0,
            height=SIZE,
            width=SIZE,
            generator=gen,
        )
        return out.images[0]


class TextToImageJa:
    """v3: Japanese Stable Diffusion XL。**日本語のプロンプトをそのまま読む**（docs/spec/08-genlab.md 2-1b）。

    蒸留版ではないので 25 step ＋ guidance 7。重みは CPU RAM、使う部品だけ GPU（v2 と同じ順番運転）。
    gated モデルなので、先に HF で承認して `huggingface-cli login` → `prefetch_v3.py`。
    """

    profile = "v3"

    def __init__(self) -> None:
        self._pipe = None

    @property
    def loaded(self) -> bool:
        return self._pipe is not None

    def load(self) -> float:
        import torch
        from diffusers import DiffusionPipeline

        t = time.perf_counter()
        # 独自のパイプライン（pipeline_japanese_stable_diffusion_xl.py）と文字エンコーダを同梱しているので trust_remote_code
        pipe = DiffusionPipeline.from_pretrained(MODEL_ID_JA, trust_remote_code=True, torch_dtype=torch.float16, variant="fp16")
        _patch_jsdxl_check_inputs(pipe)
        pipe.enable_model_cpu_offload()
        pipe.set_progress_bar_config(disable=True)
        self._pipe = pipe
        return time.perf_counter() - t

    def to_gpu(self) -> None:
        """オフロード運転なので何もしない"""

    def to_cpu(self) -> None:
        """同上"""

    def generate(self, prompt: str, negative: str, steps: int, seed: int | None) -> Image.Image:
        """prompt・negative は日本語。steps は最低 STEPS_JA（bridge が渡す 4 は turbo 用なので上書き）"""
        assert self._pipe is not None, "load() が先"
        import torch

        gen = None
        if seed is not None:
            gen = torch.Generator(device="cuda").manual_seed(seed)
        out = self._pipe(
            prompt=prompt,
            negative_prompt=negative or None,
            num_inference_steps=max(STEPS_JA, steps),
            guidance_scale=GUIDANCE_JA,
            height=SIZE_JA,
            width=SIZE_JA,
            generator=gen,
        )
        return out.images[0]


def _patch_jsdxl_check_inputs(pipe) -> None:
    """JSDXL の同梱パイプライン（2023 年・diffusers 0.2x 向け）は `check_inputs` の引数が古く、
    diffusers 0.39 の `__call__` が渡す 15 個（ip_adapter_image / ip_adapter_image_embeds が増えた）を受けられずに落ちる
    （TypeError: takes from 6 to 13 positional arguments but 15 were given。2026-09-22 実機）。
    新しい引数並びで受けて、親（StableDiffusionXLPipeline）の検査に流す。JSDXL は文字エンコーダが 1 つなので prompt_2 は使わない。
    """
    import types

    from diffusers import StableDiffusionXLPipeline

    def check_inputs(
        self,
        prompt,
        prompt_2,
        height,
        width,
        callback_steps,
        negative_prompt=None,
        negative_prompt_2=None,
        prompt_embeds=None,
        negative_prompt_embeds=None,
        pooled_prompt_embeds=None,
        negative_pooled_prompt_embeds=None,
        ip_adapter_image=None,
        ip_adapter_image_embeds=None,
        callback_on_step_end_tensor_inputs=None,
    ):
        return StableDiffusionXLPipeline.check_inputs(
            self,
            prompt,
            None,
            height,
            width,
            callback_steps,
            negative_prompt,
            None,
            prompt_embeds,
            negative_prompt_embeds,
            pooled_prompt_embeds,
            negative_pooled_prompt_embeds,
            ip_adapter_image,
            ip_adapter_image_embeds,
            callback_on_step_end_tensor_inputs,
        )

    pipe.check_inputs = types.MethodType(check_inputs, pipe)
