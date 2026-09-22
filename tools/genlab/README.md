# genlab — 単語 → 3D → 20³ ブロック を、ブラウザで試す

仕様は [docs/spec/08-genlab.md](../../docs/spec/08-genlab.md)。**Minecraft には繋がない。**
「その場で 3D が作られてブロックになる」を、秒数つきで見せるための道具。

## 初回だけ

```powershell
cd tools/genlab
python -m venv .venv
.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
.venv\Scripts\python.exe -m pip install -r requirements.txt
git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git Hunyuan3D-2   # 3D（既定）
git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git TripoSR              # 3D（軽い方。pipeline/run.py の BACKEND で切替）
.venv\Scripts\python.exe build_jmdict.py        # 和英辞書（JMdict）→ pipeline/jmdict_min.json。無くても動く（機械翻訳だけになる）
.venv\Scripts\python.exe build_wikititles.py    # Wikipedia の日英対訳（固有名詞）→ pipeline/wikititles_ja_en.json（61 MB）。wikidump/ に jawiki の page/langlinks/redirect の sql.gz を置いてから。出題モードの bridge が引く
.venv\Scripts\python.exe palette_from_rp.py     # リソパ → pipeline/palette_data.json（git に入っている。リソパを更新したら実行）
```

- **torch は CUDA 12.8 の index から入れる。** RTX 5070（Blackwell, sm_120）は古い wheel では動かない
- `torchmcubes` は**入れない**。TripoSR の import は `shim/torchmcubes/` が通す（メッシュを作らないので要らない）
- モデルは初回起動時に Hugging Face から落ちる（sd-turbo 約 2.5 GB / Hunyuan3D-2mini turbo 約 2.5 GB / TripoSR 約 1 GB / Marian 約 300 MB / WordNet 数十 MB）
- **Hunyuan3D は Tencent Hunyuan Community License（非商用）。** 配布物に組み込むときは条件を読む

## 使う

```powershell
.venv\Scripts\python.exe server.py        # → http://127.0.0.1:8770/
```

画面で単語を入れて「生成」。段ごとの秒数・画像・20³ の格子が下から置かれていく様子が出る。**1 語 3 秒前後・VRAM は Minecraft 込みで約 8.5 GB。**

```powershell
.venv\Scripts\python.exe bench.py 犬 --repeat 2 --layers    # 画面なしで秒数と各層の文字絵
```

**秒数は 2 回目以降を見る**（1 回目は読み込み・ウォームアップが混ざる）。

## 出力

`out/<日時>/` に `image.png`（生成画像）・`input.png`（3D に渡した画像）・`result.json`（`palette` / `voxels` / 秒数）。
git 管理外。見比べたいものは `docs/research/29` に貼る。

## 中身

| | |
| --- | --- |
| `pipeline/translate.py` | ⓪ 日本語 → 英語。**辞書（JMdict）→ 機械翻訳（Marian, CPU）**。LLM は使わない。定型も生き物／物で分ける |
| `pipeline/kind.py` | 英語の語が生き物か物か（WordNet） |
| `pipeline/level.py` | 傾きを直す（「床に接する柱が最大」）。純粋関数 |
| `pipeline/t2i.py` | ① 単語 → 画像（sd-turbo, 2 step）。モデルを替えるならここだけ |
| `pipeline/i23d_hy.py` | ② 画像 → 3D（**Hunyuan3D-2mini turbo**、既定）。VAE の格子を直接出す。色は画像を投影。**2.5 秒・＋3.8 GB** |
| `pipeline/i23d.py` | ② 画像 → 3D（TripoSR、軽い方。0.3 秒・1.6 GB。裏側が崩れる）。`run.py` の `BACKEND` で切替 |
| `pipeline/voxel.py` | ③ 占有＋色 → `{ palette, voxels }`。**純粋関数**。`python -m pipeline.voxel` で自己テスト |
| `pipeline/palette.py` | 色 → ブロックの表（`palette_data.json`）。**羊毛・コンクリート・テラコッタの 49 種。固定ルール** |
| `pipeline/run.py` | ⓪→③ を流して段ごとに yield |
| `server.py` | FastAPI。`/generate` は SSE |
| `static/index.html` | 画面。three.js で描き、下から 1 tick に N 個置く |

### 単語リストの確認（AI 建築当てゲーム用）

サーバーを起動したまま、`worlds/ai-build-quiz/bridge/words.json` を全部流して目で見る道具。**別プロセスでモデルを読まない**（VRAM が溢れる）。

| | |
| --- | --- |
| `verify_words.py` | 全語を `/build` に流し、`out/verify/<kind>-NN.png`（12 語/枚）と `report.tsv`。途中で止めても続きから |
| `resheet.py` | `report.tsv` から、物の範囲だけ切り出した**大きい**シート `out/verify/big/`（verify_words のシートは小さくて判断できなかった） |
| `seed_sweep.py` | 迷う語を seed 1〜5 で流して横に並べる（`words/*.txt` の固定 seed を決める） |
| `food_ab.py` | 食べ物・植物の定型の比較（画像だけ） |
| `grid_dump.py` → `retune.py` | 色付けの調整。③ の手前を npz に残し（GPU。**サーバーを止めてから**）、`voxel.py` を変えるたびに GPU 無しで塗り直して見比べる |

## 生成プロファイル v1 / v2（`docs/spec/08-genlab.md` 2-1b）

- v1 = sd-turbo（既定・常駐）。v2 = SDXL-Turbo（キャラに強い・重い）。`/build?profile=v2` で指定（bridge はコンパスの「生成モデル」から渡す）
- v2 を使う前に、**遊んでいない時間に** モデルを落としておく（約 7 GB。GPU は使わない）:

```powershell
.venv\Scripts\python.exe prefetch_v2.py
```

- v2 の初回呼び出しで 20 秒読み込む。画像を作る間だけ 3D モデルを CPU へ退避する順番運転で 12 GB に収める（2026-09-22 実機で動作: 8 秒／回）
- v3 = Japanese Stable Diffusion XL（日本語のまま読む）。**gated** なので、HF のモデルページで承認 → `.venv\Scripts\huggingface-cli.exe login` → `.venv\Scripts\python.exe prefetch_v3.py`（約 6.5 GB）。未検証
