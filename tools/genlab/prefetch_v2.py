"""v2（SDXL-Turbo）のモデルを先に落としておく（約 7 GB）。GPU は使わない。

    .venv/Scripts/python.exe prefetch_v2.py

server.py の起動中に初めて v2 を使うと、ダウンロードで数分止まる。遊んでいない時間にこれを回しておく
（`docs/spec/08-genlab.md` 2-1b）。
"""

from huggingface_hub import snapshot_download

from pipeline.t2i import MODEL_ID_XL

path = snapshot_download(MODEL_ID_XL, allow_patterns=["*.json", "*.txt", "*fp16*", "tokenizer*/*", "*/merges.txt", "*/vocab.json", "*/special_tokens_map.json"])
print("ok:", path)
