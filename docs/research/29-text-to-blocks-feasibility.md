# 調査: 文章 → AI が 3D → ブロックで建てる、はできるか

> 調査日: 2026-09-21 / 対象: Minecraft BE 1.26.44 / BDS / `@minecraft/server` 2.9.0
> 発端: [worlds/ai-build-quiz](../../worlds/ai-build-quiz/docs/00-concept.md)（AI 建築当てゲーム）
> 前提（本人の要望）: **AI は自作せず既存のものを使う。速さ優先。ONNX でも可。**

> ### 「精度は低くてよい」の意味を取り違えないこと
>
> **形の精度は要らない**——20×20×20 のブロックに潰すので、細部は消える。
> **文章の読み取りは正しくなければならない**——「赤い車」と書いたら赤い車が出ること。
> **粗くてよいのは 2 段目（画像 → 3D）と 3 段目（3D → ブロック）。**
> **1 段目（文章 → 画像）は「読み取りの正しさ」で選ぶ。速さだけで選ばない。**

## 0. 結論

> ### **できる。** ただし段ごとに確度が違う。**未実測なのは生成の速さだけ。**

| 段 | できるか | 確度 | 根拠 |
| --- | --- | --- | --- |
| 1. 文章を受ける | **できる** | **実績あり** | カスタムコマンド・`server-ui` のフォーム（[2-1](#2-1-文章を受ける)） |
| 2. 外へ渡し、結果を受け取る | **できる** | BDS 版: モジュール読込は実績あり。**BDS なし版: 文章を出す口だけ要検証** | BDS ＋ `server-net`（[2-2](#2-2-外へ渡す受け取る)）／**BDS なし: `/wsserver` ＋ `/scriptevent`（[6 章](#6-bds-なしで行けるか2026-09-21-追記)）** |
| 3. 3D モデルを作る（**10 秒以内**） | **既存のもので行けそう** | **未実測** | 文章→画像→3D の 2 段。**見込み 4〜7 秒**（[2-3](#2-3-3d-モデルを作るここが本丸)） |
| 4. 3D → 20×20×20 のブロック | **できる** | **実績あり**（別用途） | [tools/mc-voxelize.py](../../tools/mc-voxelize.py) が既にある（[2-4](#2-4-3d--ブロック)） |
| 5. 動的にブロックを置く | **できる** | **実績あり** | `setBlockType` を tick に分ける。pve-v3 の組み立て係が同じことをしている（[2-5](#2-5-動的にブロックを置く)） |
| 6. 1 個ずつ置く演出 | **できる** | — | 置く速さは決め事（[2-5](#2-5-動的にブロックを置く)） |

**「ブロックの情報を外で動的に作って、ゲームに持ってきて建てる」は、全部の部品に前例がある。**
**未知なのは「3D を 10 秒で作れるか」の 1 点だけ**で、これは**手元の GPU で実測すれば 1 日で分かる。**

## 1. 全体の流れ（案）

```
出題者                BDS（ビヘイビアパック）              手元の生成サーバー（Python）
  │ フォームに文章       │                                      │
  ├───────────────────▶│                                      │
  │                    │  HTTP POST { text }                  │
  │                    ├─────────────────────────────────────▶│
  │                    │                                      ├─ ⓪ 文章を英語の短い描写に直す（LLM, 〜1 秒）
  │                    │                                      ├─ ① 描写 → 画像（2〜3 秒）
  │                    │                                      ├─ ② 画像 → 3D（1〜2 秒）
  │                    │                                      ├─ ③ 3D → 20³ の格子（1 秒未満）
  │                    │  { palette, voxels }                 │
  │                    │◀─────────────────────────────────────┤
  │                    ├─ 下の層から N 個/tick で setBlockType
  │                    ├─ 置き終わり → 30 秒の回答受付
```

**全部同じ PC で動く。** BDS・生成サーバー・GPU が 1 台に載る（[docs/idea/01](../idea/01-llm-chat.md) と同じ構成）。

## 2. 段ごとの調査

### 2-1. 文章を受ける

3 通りある。**チャットは使わない。**

| 方法 | 他の人に見えるか | 備考 |
| --- | --- | --- |
| チャット（`beforeEvents.chatSend`） | **見える** | お題が全員に見えたら**ゲームにならない**。`cancel` しても処理は restricted で次 tick |
| カスタムコマンド `/quiz:build <文章>` | **見えない** | `/` コマンドは**サーバーにしか送られない**（[spec/02 5-6](../spec/02-llm-chat.md)）。コールバックは restricted なので `system.run` へ逃がす |
| **`server-ui` の `ModalFormData.textField`** | **見えない** | **これが本命。** 出題者にだけ入力欄を出す。長文も打ちやすい |

**フォームで受ける。** コマンドは開発中の手打ち用に残す。

### 2-2. 外へ渡す・受け取る

#### BDS 前提なら `@minecraft/server-net`（**BDS なしの道は [6 章](#6-bds-なしで行けるか2026-09-21-追記)**）

| | |
| --- | --- |
| 何 | `http.request(HttpRequest)` → `Promise<HttpResponse>`。**`body` は文字列** |
| 制約 | **BDS 限定・beta。** `config/<スクリプトモジュール UUID>/permissions.json` で許可が要る（[research/03](03-bds-and-friend-join.md)） |
| 前例 | **`addons/bots_cmd`**（HTTP GET で制御サーバーを叩く）と **`addons/exp`**（パケットイベント）。**両方とも BDS で読み込めている。** `config/` に許可の実物もある |
| 未確認 | **`http.request` が実際に応答を受け取れた記録が docs に無い。** bots_cmd の実装はあるが動作確認の記述が無い。**最初に疎通を確かめる** |
| 型定義の版 | `@minecraft/server-net@1.0.0-beta.1.26.50-preview.26`（bots_cmd が使っているもの） |

#### 応答の大きさ

20×20×20 ＝ **最大 8,000 マス**。座標つき JSON にすると 100〜200 KB になる。
**応答の上限は型定義に書かれていない**（`RequestBodyTooLargeError` は**送る側**の上限）。
**詰めて送れば問題にならない**:

```json
{ "palette": ["air", "white_wool", "oak_planks", "…"],
  "voxels": "AAAABBBA…" }
```

`voxels` は **8,000 文字。1 文字 = 1 マス。下の層から順。** 全体で **8 KB。**
どの上限にも引っかからない。**置く順（下から）もこの並びで決まる。**

#### 待ち方

`HttpRequest.timeout` は**秒**。**15 秒**にして 1 回の POST で待つ。
`Promise` なので tick は止まらない。**同時に投げられる数に上限がある**
（`HttpRequestLimitExceededError`）——**1 ゲーム 1 リクエスト**にすれば関係ない。

> ### 型定義には `WebSocket` クラスもある（`server-net` preview）
>
> `WebSocket.connect(uri)` → `send` / `afterEvents.message`。
> **進捗を流す用途に使えそうだが、preview の API なので今回は当てにしない。** HTTP で足りる。

#### BDS を使わない道

**`/wsserver` ＋ `/scriptevent` は行ける**——[6 章](#6-bds-なしで行けるか2026-09-21-追記)に分けて書いた。以下は採らないもの。

| 道 | なぜ採らないか |
| --- | --- |
| `/wsserver` から `setblock` を直接打つ | 8,000 回のコマンドになり、演出の制御もしづらい。**`/scriptevent` でデータだけ渡し、置くのはスクリプト**にする（6 章） |
| 偽プレイヤー（`tools/bots`）に置かせる | 置く速さ・位置の制御が粗い。**そもそも要らない** |
| `.mcstructure` を書いて `/reload` | **クローン一発になる。** 演出の要件（1 個ずつ）に反する |

BDS は[research/03](03-bds-and-friend-join.md)で導入済みなので、**BDS 版はすぐ試せる。** ただし**本人の希望は「できれば BDS なし」**（6 章）。

### 2-3. 3D モデルを作る（**ここが本丸**）

#### 前提: 「文章 → 3D を直接」は遅いか低品質。**「文章 → 画像 → 3D」の 2 段が現実的**

2026-09 時点で、**速くて手元で動く 3D 生成はほぼ全部「画像 → 3D」**。
文章から直接 3D を作るものは、クラウド API（20〜100 秒）か、古くて遅い研究モデルしかない。

**2 段に分けると、「文章の読み取り」を 1 段目に閉じ込められる**のが利点。
**読み取りが正しい画像さえ出れば、2 段目以降は形をなぞるだけ**なので粗くてよい。

#### ⓪ 文章の読み取り（**ここだけは正確に**）

出題者は**日本語**で、しかも**変な文章**を送ってくる。画像モデルは日本語が弱い。
**手前で LLM に「英語の短い物体の描写」へ直させる。**

```
入力:  「赤くてでかい車、タイヤが 6 個ある」
出力:  "a big red car with six wheels"
```

| | |
| --- | --- |
| 何で | **Ollama**（入っている）。`qwen3.5:9b` は [spec/02](../spec/02-llm-chat.md) で実測 88 tok/s、`think: false` で 0.6 秒 |
| 出すもの | **物体の描写（英語 1 文）** ＋ **答えの単語（日本語）**。後者は「当たり」判定に使える |
| 効き目 | 画像モデルの読み取りが**英語の短文で最も安定する**。「single object, centered, plain white background, 3D render style」を機械的に足せる |
| 注意 | **VRAM を食う**（9b で 6.6 GB）。下の予算表を見る。**翻訳だけなら 1〜2 GB の小さなモデルで足りる**（要実測） |

**「変な文章でも普通に建築される」**は、LLM に「必ず何か 1 つの物体に落とせ」と指示することで満たす。
拡散モデルも**何を入れても必ず絵を出す**ので、この段で止まることはない。

#### ① 描写 → 画像（**読み取りの正しさで選ぶ**）

| | 所要 | VRAM | 読み取り | 判定 |
| --- | --- | --- | --- | --- |
| **Z-Image-Turbo**（Alibaba, Apache-2.0, 6B, 8 step） | **2〜3 秒** | bf16 14〜16 GB / **fp8 〜8 GB** / GGUF 〜6 GB | **強い**（文字も物も指示どおりに出ると評判） | **◎ 本命** |
| FLUX.2 [klein] 4B（Apache-2.0） | 1 秒未満 | **〜13 GB** | 強い | ✗ 12 GB に載らない |
| FLUX.1 schnell（4 step） | 数秒 | Q4 で 6〜8 GB | 強い | ○ 対抗 |
| SDXL-Turbo（1〜4 step） | **1 秒未満** | 〜5 GB | **弱い**（複数の指定を落とす） | △ **最速だが読み取りが甘い。** 速さが足りないときの逃げ道 |

> ### 「速いから SDXL-Turbo」にしない
>
> 一番速いが、**「6 個のタイヤ」「赤い」のような指定を平気で落とす。**
> **読み取りの正しさが要件**なので、**Z-Image-Turbo を本命**にし、
> 10 秒に収まらなかったときだけ SDXL-Turbo（か step 数を減らす）へ落とす。

#### ② 画像 → 3D（**粗くてよい。速さで選ぶ**）

| | 所要（公称） | VRAM | Windows | ライセンス | 判定 |
| --- | --- | --- | --- | --- | --- |
| **TripoSR**（VAST × Stability, **MIT**） | **A100 で 0.5 秒未満** → 5070 で 1〜2 秒の見込み | **〜6 GB** | ○ | MIT | **◎ 本命** |
| **Stable Fast 3D (SF3D)** | **〜0.5 秒** | 〜6 GB | ○ | Stability Community License | ○ 対抗。TripoSR の後継 |
| Hunyuan3D-2mini | 数十秒 | 5 GB（形状のみ） | ○ | Tencent Community License | △ 遅い・高精度すぎる |
| Hunyuan3D 2.1 | 数分 | 29 GB | ○ | 同上 | ✗ |
| TRELLIS.2 | H100 で 3〜60 秒 | **24 GB** | **✗ Linux のみ** | MIT | ✗ |
| Shap-E（文章 → 3D 直接） | V100 で 13 秒。家庭用 GPU で「数分」の報告も | 〜6 GB | ○ | MIT | △ 団子になる。読み取りも弱い |

クラウド API（Meshy 30〜90 秒 / Tripo 25〜100 秒 / Rodin 2〜3 分、$0.1〜0.5/回）は
**10 秒に届かず、毎ラウンド金がかかる。採らない。**
（Tripo に **voxel / Minecraft 風の様式指定**があるのは面白いが、遅い。）

> ### TripoSR の落とし穴: **`torchmcubes` が CPU 版に黙って落ちる**
>
> CUDA の版が torch とずれると、メッシュ化（marching cubes）が CPU 実装に落ち、
> **0.5 秒のはずが 30 秒になる。エラーは出ない。**
> **RTX 5070 は Blackwell（sm_120）で、torch 2.7 以降 ＋ CUDA 12.8 が要る。**
> 古い CUDA でビルドされた拡張は動かない。**ここが Windows で一番つまずく所。**
>
> **回避案（未検証）: メッシュを作らない。**
> TripoSR の出力は triplane NeRF で、**任意の点の密度と色を問い合わせられる。**
> **こちらが欲しいのは 20³ ＝ 8,000 点の「詰まっているか・何色か」だけ**なので、
> **その 8,000 点を直接問い合わせれば、marching cubes も OBJ も要らない。**
> 形の精度は落ちるが、**形の精度は要らない**。速くもなる。

#### 見込みの合計（**未実測**）

| 段 | 見込み |
| --- | --- |
| ⓪ 文章 → 英語の描写（Ollama） | 0.5〜1 秒 |
| ① 描写 → 画像（Z-Image-Turbo fp8） | 2〜3 秒 |
| ② 画像 → 3D（TripoSR） | 1〜2 秒 |
| ③ 3D → 20³（voxelize） | 1 秒未満 |
| HTTP の往復・JSON | 0.1 秒 |
| **合計** | **4〜7 秒**（初回はモデル読込で ＋10〜30 秒。**常駐させる**） |

**10 秒に収まる見込み。** 収まらなければ、**⓪ と ① は削らず**、② の解像度と ① の step 数を落とす。

#### VRAM の予算（12 GB）— **ここが一番きつい**

| 常駐させたいもの | VRAM |
| --- | --- |
| ⓪ LLM（qwen3.5:9b） | 6.6 GB |
| ① Z-Image-Turbo fp8 | 〜8 GB |
| ② TripoSR | 〜6 GB |
| **合計** | **〜21 GB。載らない** |

**全部は載らない。** 取れる手:

| 手 | 効き | 引き換え |
| --- | --- | --- |
| **⓪ を小さなモデルにする**（翻訳だけなら 1〜2 GB 級で足りる） | −5 GB | 読み取りが落ちないか要確認 |
| **① を GGUF（〜6 GB）にする** | −2 GB | 少し遅くなる・少し粗くなる |
| **① と ② を順に読み込む**（使うときだけ載せる） | 常駐 1 つ分で済む | **毎回 ＋2〜5 秒**。10 秒がきつくなる |
| ⓪ を CPU で回す | −6.6 GB | 30 トークンで 3 秒ほど（要実測） |

**ゲーム中は LLM チャット（`tools/bots`）を止める。** 同じ GPU を取り合う。

#### 保険: LLM に直接ブロックを出させる

**3D を経由しない道。** Ollama の `qwen3.5:9b` はもう入っている。
「箱・線・点」の JSON を出させる方式は **MineBench** という評価まである（**小さなモデルは弱い**）。
88 tok/s なので 500 トークン ≈ 6 秒。**新しいものを入れずに今日試せる**が、
本人の設計（3D → 固定ルールで置換）から外れるので、**3D 側が駄目だったときの逃げ道**として置いておく。

### 2-4. 3D → ブロック

**[tools/mc-voxelize.py](../../tools/mc-voxelize.py) が既にある。** OBJ を読んで格子に刻み、
マテリアル名 → ブロック、無ければ色（`Kd`）→ 近いブロック、を当てる。**AI は使っていない。**

今回に足りないもの:

| 足りないもの | どうするか |
| --- | --- |
| **20×20×20 への収め方** | 一番長い軸を 20 に合わせて縮小。中央寄せ。**床に接地**（y=0 に最下面） |
| **色の取り方** | TripoSR は**頂点色**で出す（`Kd` ではない）。頂点色 → 近いブロックの対応を足す |
| **殻か中身か** | 既定は殻のみ、`--solid` で床から詰める。**当てやすさで決める**（殻だけだと上から見て透ける） |
| **速さ** | 20³ なら 1 秒未満。問題にならない |
| **対応表** | 形の精度は要らないので、**羊毛・コンクリート 16 色 ＋ 木・石 数種**の小さな表でよい。**色は当てる手がかりになる**ので、赤は赤に落とす |

**Python のまま生成サーバーに同居させる**（画像→3D も Python なので）。

### 2-5. 動的にブロックを置く

**前例が pve-v3 にある。** [`services/builder.ts`](../../worlds/pve-v3/packs/pve_v3/scripts/services/builder.ts) は
手順の配列を 1 tick の予算（`PER_TICK = 16000`、`setBlockType` 1 回 = 12）で流している。
**つまり 1 tick に約 1,300 個の `setBlockType` は通る。** 8,000 個は負荷としては何でもない。

| API | 使いどころ |
| --- | --- |
| `Dimension.setBlockType(loc, id)` | **1 個ずつ置く。** 演出の主役。restricted 不可（`system.run` の中で） |
| `Dimension.setBlockPermutation(loc, perm)` | 色や向きの状態が要るとき |
| `Dimension.fillBlocks(volume, "air")` | **建てる前に箱を空にする。** 20³ = 8,000 < 上限 32,768 なので 1 回で済む |
| `Dimension.isChunkLoaded(loc)` | 置く前に確かめる。**建てる場所には ticking area を張る** |
| `Dimension.playSound("dig.wood", loc)` 等 | 「ポ」の音。1 個ごとに鳴らせる |

**速さは決め事。** 殻だけなら 1,000〜3,000 個、詰めると最大 8,000 個。

| 1 tick に置く数 | 2,000 個にかかる時間 | 8,000 個 |
| --- | --- | --- |
| 1 | 100 秒 | 400 秒 |
| 5 | 20 秒 | 80 秒 |
| **10** | **10 秒** | 40 秒 |
| 20 | 5 秒 | 20 秒 |

**下の層から順に、1 層の中は端から**。並びは 2-2 の `voxels` 文字列がそのまま順序になる。
[docs/imp.md 10-1](../imp.md) に従い、**輪は 1 本**（`loop.ts`）の中で毎 tick N 個進める。

## 3. 最初に確かめること（この順で）

**安いものから。3〜4 で駄目なら設計を変える。**

| # | 何を | どう | 目安 |
| --- | --- | --- | --- |
| 1 | **`server-net` の `http.request` が BDS で通る** | `bots_cmd` の形で、手元の Python に GET → 200 が返る | 30 分 |
| 2 | **⓪ の読み取り** | 変な日本語 10 本を `qwen3.5:9b` に投げ、英語 1 文 ＋ 答えの単語が安定して返るか。**小さなモデルでも足りるか** | 1 時間 |
| 3 | **Z-Image-Turbo が 5070 で何秒か** | torch 2.7+ / CUDA 12.8 を入れて fp8 で 1 枚出す。**指定（色・数）が絵に出ているか** | 半日（環境構築込み） |
| 4 | **TripoSR が 5070 で何秒か** | 同上。**`torchmcubes` が GPU で動いているか**を必ず見る（30 秒かかったら CPU 版） | 半日 |
| 5 | **VRAM に何が同居できるか** | 3 つを載せて `nvidia-smi`。溢れたら 2-3 の表の手を順に試す | 半日 |
| 6 | **通しで 10 秒に収まるか** | フォーム → HTTP → 生成 → 置く、を 1 本つなぐ | 1 日 |
| 7 | **当てられる絵になるか** | 「犬」「赤い家」「6 輪の車」で 20³ にして見る。**駄目なら殻/詰め・対応表・画像プロンプトを触る** | — |

**4 で駄目なら**: SF3D に替える → それも駄目なら「メッシュを作らず 8,000 点を直接問い合わせる」→ それも駄目なら LLM 直接（保険）。

## 4. 決めてもらうこと

| | 選択肢 | 調査側の推し |
| --- | --- | --- |
| 文章の入力 | チャット／コマンド／**フォーム** | **フォーム**（他の人に見えない） |
| 置く速さ | 1 tick に 1〜20 個 | **10 個/tick**（殻 2,000 個で 10 秒） |
| 殻か中身か | 殻／床から詰める | **詰める**（上から見ても形が分かる）。実物を見て決め直す |
| 生成の実体 | 手元 GPU／クラウド | **手元 GPU**（速い・無料・ゲーム中に金が減らない） |
| ⓪ 読み取りの LLM | qwen3.5:9b／もっと小さいもの | **まず 9b で試し、VRAM が足りなければ小さいものへ** |
| ① 画像モデル | **Z-Image-Turbo**／FLUX.1 schnell／SDXL-Turbo | **Z-Image-Turbo**（読み取りが強い）。速さが足りなければ SDXL-Turbo |
| ② 3D モデル | TripoSR／SF3D | **TripoSR**（MIT・軽い）。ビルドで詰まったら SF3D |

## 5. 手元の環境（2026-09-21 確認）

| | |
| --- | --- |
| GPU | **RTX 5070, 12,227 MiB**, driver 591.74 |
| Python | 3.12.10。**torch 未導入** |
| Ollama | phi4:14b / qwen3.5:9b / gemma3:12b / qwen3:14b |
| Blender | 無し（要らない。OBJ は自前で読める） |
| BDS | `C:\MinecraftServer\1.26.44.3`。`config/` に `server-net` を許可した実物が 2 つある |

## 6. BDS なしで行けるか（2026-09-21 追記）

> ### **行ける。** `/wsserver` ＋ `/scriptevent` で、通常ワールド（クライアントホスト）でも組める。
>
> **本人の希望は「できれば BDS なし」。** この節はその道を調べたもの。
> **確かめていないのは「文章を外に出す口」の 1 点。** それ以外は公式コマンドと既存の道具で足りる。

### 6-1. 何が BDS 限定だったか

**`@minecraft/server-net`（HTTP）だけ。** それ以外——フォーム・`setBlockType`・輪——は通常ワールドで全部動く。
つまり **「外と話す口」を別のものに替えれば BDS は要らない。**

通常ワールドで外と話せる口は **`/wsserver` だけ**（[spec/04](../spec/04-ws-llm-chat.md)）。
**ゲーム本体のコマンド**で、ホストのクライアントが外の WebSocket サーバーへ繋ぎに行く。
**`tools/wsbridge` として実装済み**（Node。`PlayerMessage` の購読と `commandRequest` の送信ができる）。

### 6-2. 流れ（BDS なし版）

```
出題者            ホストの Minecraft（通常ワールド）        wsbridge（Node）        生成サーバー（Python）
  │ 文章            │  /wsserver で接続済み                    │                       │
  ├──────(口)──────▶│── PlayerMessage ───────────────────────▶│── POST { text } ─────▶│
  │                 │                                         │◀─ { palette, voxels } ─┤
  │                 │◀─ /scriptevent quiz:voxels <2048 文字> ──┤  × 4〜5 回
  │                 │◀─ /scriptevent quiz:done ───────────────┤
  │                 ├─ BP スクリプト: scriptEventReceive で受け、下から N 個/tick で置く
```

**生成・置換のロジックは BDS 版と 1 文字も変わらない。** 変わるのは「口」だけ。

### 6-3. 入口: `/scriptevent`（**確度: 公式仕様**）

| | |
| --- | --- |
| 何 | `/scriptevent <id> <message>` → `system.afterEvents.scriptEventReceive` |
| **上限** | **message は 2048 文字まで**（公式リファレンス） |
| 8,000 マスの運び方 | **2,000 文字 × 4 回 ＋ palette 1 回 ＋ done 1 回**。順番と欠けは `seq` を付けてスクリプト側で確かめる |
| 誰が打つか | **wsbridge が `commandRequest` で打つ**（ホストのプレイヤー権限で実行される） |
| 条件 | **チート必須**（`/wsserver` も `/scriptevent` も）。**実績が解除できなくなる**——ミニゲームなので問題ない |

### 6-4. 出口: 文章を wsbridge に届ける（**確度: 要検証。ここだけ**）

`/wsserver` が拾えるのは **`PlayerMessage`（チャット）だけ**。
**フォームの結果は外に出せない**（スクリプトは外と話せない）。候補:

| 案 | やり方 | 他の人に見えるか | 確かめること |
| --- | --- | --- | --- |
| **A. チャット ＋ 打ち消し** | 出題者が `!お題 赤い車` と打つ → BP が `beforeEvents.chatSend` で `cancel` → 全員の画面には出ない | **出ない（はず）** | **打ち消したチャットを `/wsserver` の `PlayerMessage` がまだ拾うか。** 拾うなら最良、拾わないなら B |
| **B. `/tell`（ささやき）** | 出題者が `/tell <ホスト> 赤い車` → ホストの `PlayerMessage` に `type: "tell"` で届く | **ホストには見える** | `tell` が `PlayerMessage` に来るか。**ホストが遊ばない PC なら見えても構わない** |
| C. スコアボードの偽プレイヤー名 | スクリプトが文章を偽プレイヤー名として `setScore`、bridge が `scoreboard players list` の応答から読む | 見えない | 名前の長さ上限・応答の形。**最後の手** |

**A から順に試す。** A が通れば BDS 版と同じくらい綺麗になる。

### 6-5. BDS あり／なしの比較

| | **BDS**（2〜5 章） | **`/wsserver`**（この節） |
| --- | --- | --- |
| 外との口 | `server-net`（beta・BDS 限定・`permissions.json`） | `/wsserver`（**非公式・「unsupported surface」**だが長年動いている。**実装済み**） |
| 参加のしかた | `bedrock-portal` ＋ **ポート開放（2 段 NAT）** | **普通のフレンド参加。ポート開放なし** |
| ホスト | BDS プロセス（画面なし） | **Minecraft クライアントを開いたまま**。**描画と生成で GPU を取り合う** |
| 毎回の手間 | BDS 起動 ＋ portal 起動 | ワールドを開いて `/wsserver ws://127.0.0.1:8765` を打つ |
| 文章の口 | **フォーム → HTTP**（綺麗・誰にも見えない） | チャット打ち消し or `/tell`（**要検証**） |
| データの入口 | HTTP 応答 8 KB を 1 回 | `/scriptevent` 2,048 文字 × 5〜6 回 |
| 版の追従 | **BDS をクライアントと同じ版に上げ続ける** | 不要 |
| チート | `/reload` に必要（開発中のみ） | **必須**（常時） |
| 壊れ方 | `server-net` の beta 変更・portal の追従停止 | Mojang が `/wsserver` を消したら終わり（10 年以上残っている） |

> ### 判断
>
> **「できれば BDS なし」なら `/wsserver` で組める。** 参加が楽で、版追従が要らないのは大きい。
> **弱点は 6-4 の口と、ホストの GPU を描画と分け合うこと**（12 GB がさらに狭くなる。設定を最低にして測る）。
> **6-4 の A が通るか**を最初に確かめ、通れば `/wsserver` で決める。
> BDS 版（2 章）は**そのまま予備**として残す——口を差し替えるだけで移れる形に作る。

### 6-6. 他の BDS なしの道（採らない）

| 道 | なぜ採らないか |
| --- | --- |
| 偽プレイヤーが NetherNet で参加し、`/scriptevent` を打つ（[research/04](04-nethernet-client-world.md)） | **2 つ目の Xbox アカウントが要る**。別アカウントでの参加は未検証。`bedrock-protocol` の版追従も要る。`/wsserver` より重い |
| スクリプトの中で生成する | 外と話せない以上、GPU の生成をスクリプトに持ち込む手段が無い |
| Realms | `server-net` 不可。`/wsserver` も期待できない |

### 6-7. 最初に確かめること（`/wsserver` 版）

**3 章の 1 をこれに差し替える。** 2 以降は同じ。

| # | 何を | どう | 目安 |
| --- | --- | --- | --- |
| 1a | **打ち消したチャットを wsserver が拾うか**（6-4 A） | BP で `chatSend` を `cancel`、wsbridge のログに `PlayerMessage` が出るか | 30 分 |
| 1b | **`/scriptevent` を wsbridge から打てて、2,048 文字が届くか** | `commandRequest` で 2,000 文字を送り、`scriptEventReceive` の `message.length` を見る | 30 分 |
| 1c | **クライアントが開いた状態で VRAM がいくつ残るか** | `nvidia-smi` を見る。描画設定を最低にしたときも | 10 分 |

## 出典

- [Best 3D Model Generation APIs in 2026 (3DAI Studio)](https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026) — クラウド API の所要と費用
- [Tripo Developers — Pricing](https://developers.tripo3d.ai/en/pricing) / [Tripo H3.1](https://developers.tripo3d.ai/en/models/v3-1)
- [Hunyuan3D vs TRELLIS vs TripoSR (2026)](https://triposr.org/blog/hunyuan3d-vs-trellis) — VRAM・所要・Windows 対応・ライセンス
- [TripoSR (GitHub)](https://github.com/VAST-AI-Research/TripoSR)
- [Text to 3D Open Source: Deploy TripoSR (2026 Guide)](https://www.qwe.edu.pl/ai-tools/text-to-3d-open-source-triposr-install/) — `torchmcubes` が CPU に落ちる話
- [Hunyuan3D-2 (GitHub)](https://github.com/Tencent-Hunyuan/Hunyuan3D-2) / [Hunyuan3D-2.1](https://github.com/tencent-hunyuan/hunyuan3d-2.1)
- [Best Open-Source Text-to-3D Tools on GitHub (2026)](https://biff.ai/best-open-source-text-to-3d-tools-on-github/) — Shap-E / threestudio
- [OpenAI Shap-E (Tom's Hardware)](https://www.tomshardware.com/news/openai-shap-e-creates-3d-models) — 家庭用 GPU で数分の報告
- [Shap·E 論文](https://arxiv.org/pdf/2305.02463) — V100 で 13 秒
- [Z-Image Turbo in ComfyUI (2026)](https://localaimaster.com/blog/z-image-turbo-comfyui) / [Best Local AI Image Models 2026](https://localaimaster.com/blog/best-local-image-models-compared) — 画像モデルの所要・VRAM・読み取りの強さ
- [The Best Open-Source Image Generation Models in 2026 (BentoML)](https://www.bentoml.com/blog/a-guide-to-open-source-image-generation-models)
- [MineBench (GitHub)](https://github.com/willchil/minebench) — LLM に直接ブロックを出させる評価
- [3D Building Generation in Minecraft via LLMs (arXiv)](https://arxiv.org/pdf/2406.08751)

## 7. genlab で実測した（2026-09-21）

**[docs/spec/08-genlab.md](../spec/08-genlab.md) の道具で、Minecraft 抜きに通しで動かした。** 道具は `tools/genlab/`。

### 7-1. 速さと VRAM（Minecraft を開いたまま・RTX 5070）

| 段 | 実測（2 回目以降） |
| --- | --- |
| ⓪ 日本語 → 英語（Marian, CPU） | 0.05 秒 |
| ① 単語 → 画像（**sd-turbo**, 2 step, 512²） | 0.15〜0.2 秒 |
| ② 背景抜き（rembg u2netp, CPU）＋ TripoSR ＋ 40³ の問い合わせ 2 回 | 0.45 秒 |
| ③ 20³ へ（純粋関数） | 0.02 秒 |
| **合計** | **0.65〜0.75 秒**（起動後の 1 回目だけ 1.2〜1.5 秒） |
| VRAM | **全プロセス合計 5.3 GB**（Minecraft 2.3 GB 込み。genlab は約 3 GB） |

**10 秒の予算に対して 1 秒未満。** 3 章の「未実測」は解けた。

### 7-2. 踏んだもの（同じ穴に落ちないために）

| 症状 | 原因 | 直し |
| --- | --- | --- |
| **1 回 100 秒・VRAM 11.9/11.9 GB** | SDXL-Turbo（fp16 で 7 GB）が Minecraft・TripoSR と同居できず**スワップ** | **sd-turbo（2 GB）に替えた。** 単語 1 つの絵に SDXL は要らない |
| それでも VRAM 11 GB | diffusers 0.39 の引数名は `torch_dtype`。`dtype` と書くと**黙って無視されて fp32** | `torch_dtype=` に直した。**黙って 2 倍になる**ので数字を見る |
| TripoSR の checkpoint が読めない | transformers 5 系で ViT の重みの名前が変わった | `transformers<5`（それに合わせて `diffusers<0.40`） |
| 犬が「顔のアップ」→ 3D が板になる | プロンプトに全身の指定が無い | **「toy figurine, three-quarter front view, eye-level, full body」**で固定。猫 2 匹・車 5 台も出なくなった |
| 物体が箱の 1 割しか使わない | TripoSR の枠に対して物体が小さい | 粗い格子で**外接箱**を測り、その中だけを 40³ で問い合わせる（2 回問い合わせ） |
| **車が地面に着かない**（本人の指摘） | TripoSR は学習時のカメラ（やや上から）を前提に組むので、**系統的に 20〜27° 傾いて出る** | **「床に接する柱が最大になる角度」に回す**（`level.py`、純粋関数）。ロケットが直立し、車の腹が床に着いた。接地が 1.5 倍＋2 柱以上増えるときだけ回す（裏面を床にする悪用を弾く） |
| 複数の物・浮きかす | 画像に 2 匹出る／推定の外にゴミ | **一番大きい塊だけ残す**（画像のマスクと立体の占有の両方） |
| ロケット → "Lockett"、ぬいぐるみ → "Creep" | Marian opus-mt は**カタカナ語に弱い**。fugumt はもっと悪い（犬 → snuff） | **未解決。** 辞書引き（JMdict）か小さな LLM。LLM は VRAM の懸念があり保留 |

### 7-3. 見た目の評価

| 語 | 20³ でどう見えるか |
| --- | --- |
| ロケット・家・車 | **分かる。** 直立したロケット、屋根と壁のある家、腹の平らな車 |
| 犬・猫 | **「四つ足の動物」までは分かる。** 犬か猫かは厳しい。単語より「赤い車」のような色つきの句のほうが当てやすそう |
| 全体 | **正面（絵と同じ向き）からが一番よく、裏側は推測で崩れる**（1 枚推定の限界）。ゲームでは**建築を観客席に向けて置く**（正面を決める）と効く |

### 7-4. 次の手（まだやっていない）

| | 効き | 代償 |
| --- | --- | --- |
| **観客席方式**（正面を決めて全員が同じ側から見る） | 裏側の弱さがほぼ消える | 企画の「見る位置」がここで決まる |
| Hunyuan3D-2mini turbo（本物の 3D 生成。全方向で形が出る） | 裏側も犬になる | **VRAM ＋3〜5 GB・＋2〜5 秒の見込み（未実測）**。色は無いので今の経路から借りる。ライセンスは非商用 |
| 翻訳を辞書に | カタカナ語が外れない | JMdict の取り込み |
| 蒸留（今の構成を先生に小さな text→voxel を学習） | 1 モデル・数十 ms・日本語直入力 | **2〜3 週間。先生を超えない。** ゲームが良くなるわけではないので後回し（[decisions/01](../../worlds/ai-build-quiz/docs/decisions/01-use-existing-3d-model.md) 参照） |

**「voxel 専用のローカル AI」は探したが、汎用・軽い・色つきを満たすものは無かった**（Diffusion-SDF / DVD はカテゴリ限定、VoxelCNN は家だけ、Roblox Cube 3D は 16〜24 GB で色なし、TRELLIS.2 は 24 GB・Linux）。

### 7-5. 3D を Hunyuan3D-2mini turbo に替えた（2026-09-21）

**「3D が微妙」→ 同じ画像で TripoSR と比べ、Hunyuan3D に切り替えた**（[spec/08 5-3](../spec/08-genlab.md)）。

| | TripoSR | Hunyuan3D-2mini turbo |
| --- | --- | --- |
| 何をするか | 1 枚から**復元**。見えている面だけ忠実 | 学習した 3D の知識で**生成**。裏側も犬 |
| 3D の段 | 0.3 秒 | **2.5 秒** |
| genlab の VRAM（sd-turbo 込み） | 約 4 GB | **約 6.4 GB**（Minecraft 込み 8.7 GB） |
| 色 | 持っている | 無い → 画像を z+ から平行投影 |
| ライセンス | MIT | Tencent Hunyuan Community License（非商用） |

**1 語 3 秒・Minecraft 込み 8.7 GB。** 「軽さ」は削ったが予算内。**同居させて溢れさせない**（測るときはサーバーを止める。溢れると 100 秒になる）。
20³ で象・犬・家・猫・車・ロケットはどちらから見ても分かる。剣・本のような薄い物は 20³ の限界。
