"""v3（Japanese Stable Diffusion XL）のモデルを先に落としておく（fp16 で約 6.5 GB）。GPU は使わない。

gated モデルなので、先に
  1. https://huggingface.co/stabilityai/japanese-stable-diffusion-xl で承認（名前・メール等のフォーム）
  2. .venv/Scripts/huggingface-cli.exe login   （HF のトークン）
それから
  .venv/Scripts/python.exe prefetch_v3.py

ライセンスは STABILITY AI COMMUNITY LICENSE（非商用は無償）。`docs/spec/08-genlab.md` 2-1b。
"""

from huggingface_hub import snapshot_download

from pipeline.t2i import MODEL_ID_JA

path = snapshot_download(
    MODEL_ID_JA,
    allow_patterns=["*.json", "*.py", "*.md", "*.model", "*.txt", "*fp16*", "tokenizer/*", "scheduler/*"],
)
print("ok:", path)
