# 仕様 13: bridge ⇄ BP の口

> 作成日: 2026-09-21 / 調査: [research/29 6 章](../../../../docs/research/29-text-to-blocks-feasibility.md)
> **最初に確かめること**: 5 章。全部公式コマンドだが、疎通の実測は無い。

## 1. 口は 2 つ

| 向き | 何で | 中身 |
| --- | --- | --- |
| **bridge → BP** | `/scriptevent quiz:<id> <message>`（wsserver の `commandRequest`） | お題・ブロック・合図 |
| **BP → bridge** | **scoreboard**。BP が `phase` に数を書き、bridge が `commandRequest` で読む | 「次を出してよい」「止まっている」 |

出題者が居ないので、**BP から外へ文章を出す口は要らない**（decisions/02）。
**アドミンの開始・停止は BP のカスタムコマンド**（`/quiz:start` `/quiz:stop`、[11-flow.md](11-flow.md)）で、bridge は scoreboard を見て知る。**bridge にチャット命令は無い。**

## 2. bridge → BP（`/scriptevent`）

> ### 1 コマンド全体で **440 バイト以内**（2026-09-21 実測。1.26.51）
>
> 公式リファレンスの「message は 2,048 文字」は `/wsserver` 経由では**通らない**。`commandRequest` の `commandLine` が
> **452 バイトなら届き、462 バイトでワールドが「ホストから切断されました」で落ちる**（`bridge/tools/probe.ts`、5-2）。
> エラーではなく落ちるので、bridge は**送る前に必ず長さを確かめ**、超える物は作らない。上限は `config.json` の `maxCommandBytes`（440）。
> 長さは **UTF-8 のバイト数**で数える（日本語は 3 バイト）。

id は `quiz:` 名前空間。長い物は全部 **`<round> <i>/<n> <本文>`** の形で分割して送る。

| id | message | いつ |
| --- | --- | --- |
| `quiz:round` | `{"round":3,"answer":"犬","kind":"animal","hint":"ペット","size":60,"count":9911,"chunks":25,"accepts":2,"palettes":1}`（出題モードは `"topicId":12` も） | 生成が終わったとき。**見出しだけ**（答えの集合と palette は入れない。入れると 440 を超える） |
| `quiz:accept` | `3 1/2 ["いぬ","dog",…]` | `round` の直後。正規化済みの正解の集合を JSON 配列で、440 バイトに収まる数ずつ |
| `quiz:palette` | `3 1/1 ["air","white_wool",…]` | 同上。ブロック名を 440 バイトに収まる数ずつ |
| `quiz:prompt` | `3 1/2 one dress, a boy with a straw hat, alone, …` | 同上。**出題モードだけ**。genlab が実際に画像モデルへ渡したプロンプト（定型込み）を 440 バイトに収まる長さずつ。見出しの `prompts` が本数（無ければ 0）。BP は発表のときにお題・詳細と一緒にチャットへ出す（本人・2026-09-22「チャットにユーザーのプロンプトと画像のプロンプトを貼れる？」） |
| `quiz:chunk` | `3 2/25 <rle の断片>` | 同上。約 400 文字ずつ |
| `quiz:go` | `3` | 全部送ったあと |
| `quiz:status` | `生成サーバーを待っています…` | いつでも。BP は actionbar に出すだけ |
| **`quiz:ping`** | （空） | **bridge が生きている合図。`phase` を読むたび（1 秒ごと）、状態に関係なく送る。** BP は最後に受けた tick を覚え、**5 秒以内に受けていなければ「繋がっていない」**と判断する（`/quiz:start` を断る。[11-flow 2 章](11-flow.md)） |
| **`quiz:echo`** | 任意の文字列 | **計測用。** BP は受けた `message.length` を scoreboard `quiz` の偽プレイヤー `echo` に書く。`bridge/tools/probe.ts` が長さを段階的に上げて、落ちない上限を測る（5-2） |

**送る数の目安**: 60³ の建築は rle が 5,000〜45,000 文字 → chunk 13〜115 本。bridge は**応答を待ってから次**を送る（1 本 50〜100 ms）ので、大きい物で 10 秒ほど。

BP は `round` ごとに accept・palette・chunk を集め、**それぞれの総数が揃い、palette の個数・展開した長さ（size³）が見出しと合うことを確かめてから** `go` を受け付ける。palette は**許可リスト**（羊毛・コンクリート・テラコッタ 49 種）と照合する。
欠けや順序違いがあれば捨てて、actionbar に「受信に失敗。もう一度」を出し、`quiz_phase` を **9（失敗）**にする。bridge は 9 を見たら同じ round を送り直す（1 回だけ）。

### 2-1. ブロックの圧縮（連長）

genlab の `voxels`（size³ 文字、添字 = y×size² + z×size + x、**下の層から**）を、BP に渡す前に bridge が連長にする。

```
記号: 空気 = "."、ブロック = palette の添字 1.. を "A".."Z","a".."z" に（最大 52。palette は 49 種＋air なので足りる）
連長: <記号><個数>  個数は 10 進、1 なら省略
例:   ".1200A3.15B"  = 空気 1200、A 3 個、空気 15、B 1 個
```

**記号が英字・個数が数字なので区切りが要らない。** 40³ の象（1 万個）で 1〜2 万文字 → chunk 5〜10 回。
展開は BP の `core/rle.ts`（純粋関数・テスト対象）。

### 2-2. 送る速さ

wsserver の `commandRequest` は連続で投げてよい。**1 tick に 1 つずつ**（bridge が 50 ms 間隔）で送れば取りこぼさない想定。要検証（5 章）。

## 3. BP → bridge（scoreboard を読む）

**BP が書き、bridge が読む。** 公式コマンドだけで済む。

| 目標 `quiz` の偽プレイヤー | 意味 | 誰が書く |
| --- | --- | --- |
| `phase` | **0 = お題待ち（次を出してよい）** / 1 = 置いている / 2 = 回答中 / 3 = 発表 / **8 = idle** / 9 = 受信失敗（4「お題あり」は 2026-09-22 に廃止。出題モードは 0 で `quiz_topic` を読む） | BP |
| `round` | いまのラウンド番号 | BP |
| `mode` | 0 = フリー / 1 = 対戦 / 2 = 出題（[17-modes](17-modes.md)）。**出題では 0 で何もしない**（4 を待つ） | BP（コンパスの UI） |
| `kind` | 固定カテゴリ。0 = すべて / 1 animal / 2 vehicle / 3 building / 4 food / 5 object / 6 nature / 7 character / 8 person / 9 plant | BP（コンパスの UI） |
| `gen` | 生成プロファイル。0 = v1（sd-turbo）/ 1 = v2（SDXL-Turbo）/ 2 = v3（Japanese SDXL・日本語のまま）。[docs/spec/08-genlab.md 2-1b](../../../../docs/spec/08-genlab.md)。bridge は毎回読んで `profile` で genlab に渡す | BP（コンパスの UI） |

| 目標 `quiz_topic` の偽プレイヤー名 | 意味 |
| --- | --- |
| `0:<id>` `1:<お題>` `2:<詳細の 1 片>` `3:<2 片目>` … | 出題モードのキューの**先頭**（[17-modes 3 章](17-modes.md)）。BP が先頭が変わるたびに書く（phase は変えない。4 は廃止）。`id` はキューの通し番号で、bridge は `quiz:round` の見出しに `topicId` として返す。bridge は `scoreboard players list` の「tracked players」から名前を読み、`2:` 以降を番号順に繋ぐ（**詳細は 3000 文字まで、50 文字ずつ**に割る（最大 60 個の偽プレイヤー）。偽プレイヤー名の長さの上限が分からないので 1 片を短く保つ。2026-09-22。英語のプロンプトは 60 文字では足りない） カンマ・タブは BP が落とす |

bridge は **1 秒ごと**に `scoreboard players list phase`（と `mode` `kind`）を `commandRequest` で送り、
応答（`commandResponse` の `statusMessage`）から数を読む（`quiz` の後ろの数。**最初の応答は生でログに出す**——形が未確認なので）。

| `phase` | bridge がすること |
| --- | --- |
| 0 | **mode が 0/1 なら**単語を選び（`kind` が 1〜9 ならそのカテゴリだけ）、genlab に頼み、`quiz:round` → … → `quiz:go` を送る。送ったら **BP が 1 にするまで**何もしない。**mode が 2 なら待つ** |
| 0（mode 2） | `quiz_topic` に id があれば、お題を英語の主語に（[17-modes 3 章](17-modes.md)）、詳細と別々に genlab に頼み、0 と同じく送る（見出しに `topicId`）。無ければ待つ。答えはお題そのもの |
| 1〜3（mode 2） | `quiz_topic` の id が未生成なら**先読み**して保持（リアルタイム）。0 になったとき id が一致すれば即送る |
| 1 / 2 / 3 | 待つ |
| 8 | 待つ（ゲームが始まっていない） |
| 9 | 直前の round を**1 回だけ**送り直す |
| 読めない | 待つ。5 回続けて読めなければログに出す |

> ### なぜ時間で決め打ちしないか
>
> 置く時間は個数で変わり、誰かが当てれば 30 秒より早く終わる。
> bridge が勝手に数えると、**BP が受け取れない状態で次のお題が届く**。合図に従うほうが壊れない。

## 4. genlab の準備

bridge は起動時と `phase` が 0 になるたびに genlab の `/health` を見る。`loaded` でなければ待つ（BP には「生成サーバー待ち」を出したいが、bridge → BP の口は `/scriptevent` なので `quiz:status <文>` を送って actionbar に出す）。

## 5. 最初に確かめること

| # | 何を | どう |
| --- | --- | --- |
| 1 | `commandRequest` で `/scriptevent` が打てて、BP の `scriptEventReceive` に届く | 2,000 文字の message を送り `message.length` を見る |
| 2 | `commandResponse` が返り、`statusMessage` に scoreboard の値が入る | `scoreboard players list phase` を送って中身を見る |
| 3 | `commandRequest` を**応答を待ってから**次を送る（未応答が溜まるとクライアントが切る） | chunk を数える |
| 4 | `/ability @s mayfly true` が BP の `runCommand` から通る（[16-world-rules.md](16-world-rules.md)） | 参加直後に飛べるか |

**1〜3 が通れば設計どおり。** 通らなければ [research/29 6-4](../../../../docs/research/29-text-to-blocks-feasibility.md) の代案に戻る。

### 4-1. bridge の画面に答えを出さない（本人・2026-09-21「出題モードで出題が見える」）

ホストは bridge の端末と同じ PC で遊ぶ。**画面（stdout）に答え・お題を出すと、ホストにだけ答えが見える。**
答え・お題・裏プロンプトは **`bridge.log` にだけ**書く（`console.debug` ＝ ファイル専用）。画面には「round N: 生成中（答えは bridge.log）」だけ。

### 5-1. Minecraft 無しで確かめたこと（2026-09-21）

`bridge/tools/fake-mc.ts` が **`/wsserver` のふりをして bridge に繋ぎ、届いた `/scriptevent` を BP の解析コードそのもの**（`packs/ai_build_quiz/scripts/core/`）で受ける。
bridge と genlab を起動してから `node tools/fake-mc.ts 2`（2 ラウンド）。`node tools/fake-mc.ts 2 custom` は出題モード（mode 2・phase 0・キューの先頭 `0:1` `1:ピカチュウ` `2:黄色い`。go で id が進む）のふり。2 ラウンド目は phase 1 の間の先読みで即送られる（`先読み済み。すぐ送る` が出れば OK）。
**本番の bridge が動いている横で試す**ときは、環境変数 `BRIDGE_PORT`（例 8768）で bridge と fake-mc の両方の port を変える（`config.json` の `port` より優先。本番を止めない）。

| 確かめたこと | 結果 |
| --- | --- |
| message が 2,048 文字以内 | 最大 1,909（`chunkChars` 1,900 ＋ 見出し） |
| chunk が揃い、展開すると size³ | 60³ = 216,000。105,901 個（サッカーボール）で 23 chunk、1,736 個（傘）で 4 chunk |
| 個数・palette の数が見出しと一致、palette が許可リスト | 一致 |
| 下から置く順（`placementOrder`）の最初のセルが y=0、1 tick の個数 | 530 個/tick（10 万個）、9 個/tick（1,700 個） |
| **見つけた不具合** | genlab が 429（別の要求を処理中）を返すと、bridge が**毎秒 1 語ずつ山から捨てて round も進めていた**。失敗した語は山に戻し round も進めないよう直した |

`/wsserver` の実物との違い（scoreboard の応答文字列の形・`/ability`）は、ここでは分からない。上の表 1〜4 は実機で。

### 5-2. 実機で分かったこと（2026-09-21・1.26.51）

| | 結果 |
| --- | --- |
| 1 `/wsserver` → bridge | 繋がる（ループバック免除は不要） |
| 2 `scoreboard players list phase` の応答 | `§a選択された 1 個のオブジェクトを phase に表示:
- quiz: 8 (quiz)`。`parsePhase` で読めた |
| 3 scriptevent の到達 | **コマンド全体 452 バイトまで届く。462 で落ちる**（`probe.ts`。100→2048 の粗い刻みで 480 が落ち、400→480 の 10 刻みで 440（全体 462）が落ちた）。round（JSON 400〜600）と chunk（1,930）を送っていた設計はここで落ちていた → 2 章の 440 バイト分割に作り替え |
| 4 `/ability mayfly` | 教育版の機能 ON で通る |

測り方: `node tools/probe.ts` → `/wsserver ws://127.0.0.1:8767`。段階的に送り、`echo` に書き戻された長さを読む。落ちた直前の長さが上限。版が上がったら測り直す。

## 6. bridge → genlab

`GET /generate?text=<en>&size=60&steps=4`（SSE）をそのまま使う。bridge は `done` まで読み、`voxel` イベントの `palette` / `voxels` を取る。
語の `kind` から定型を決めて `&style=creature|object|food|plant` で渡す（[12-words.md 4 章](12-words.md)。WordNet の判定を上書き）。scoreboard `gen` の値から `&profile=v1|v2|v3` も渡す。v3 のために `&ja=<日本語>`（単語の `ja`、出題モードはお題＋詳細）も常に渡す。
genlab は同時に 1 件しか処理しない（429 `busy`）。bridge は失敗した語を山に戻して次の poll でやり直す。
出題モードは `GET /build?text=<主語>&detail=<詳細>`。応答の `prompt`（定型を当てた最終プロンプト）と `english`（翻訳結果）を bridge が受け取り、`prompt` を `quiz:prompt` で BP に渡す。**`text` と `detail` は genlab が別々に翻訳して "text, detail" に繋ぐ**（2026-09-22。まとめて機械翻訳に通すと「アルセウス, きいろとしろ」→ "Arseus, stay with me." のように壊れる）。`text` は辞書の英語かカタカナ（bridge が作る）、`detail` は出題者の日本語のまま。
