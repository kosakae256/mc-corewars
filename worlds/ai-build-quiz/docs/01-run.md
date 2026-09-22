# 立ち上げ方（運用手順）

> 作成日: 2026-09-22。**遊ぶ日はこの順にやる。** 仕組みの説明は [spec/10-architecture.md](spec/10-architecture.md)。
> 3 つのプロセス（genlab・bridge・Minecraft）を**全部ホストの PC**で動かす。BDS は使わない（ホストがワールドを開き、フレンドが参加する）。

## 0. 最初に 1 回だけ（準備）

| | やること | 詳しくは |
| --- | --- | --- |
| genlab | `tools/genlab` に `.venv` を作り、依存とモデルを入れる。`build_jmdict.py`（和英辞書）と `build_wikititles.py`（Wikipedia 対訳。出題モードの固有名詞に効く）も回しておく | [tools/genlab/README.md](../../../tools/genlab/README.md) |
| bridge | `worlds/ai-build-quiz/bridge` で `npm install` → `npm run words`（`words/` → `words.json`） | [spec/12-words.md](spec/12-words.md) |
| BP/RP | `worlds/ai-build-quiz/packs/ai_build_quiz` で `npm install` → `npm run local-deploy`（ゲームの開発用パック置き場に写す） | |
| ループバック | ゲームが同じ PC の bridge に繋げるように、**管理者 PowerShell で 1 回**: `CheckNetIsolation.exe LoopbackExempt -a -n=Microsoft.MinecraftUWP_8wekyb3d8bbwe` | [spec/10-architecture.md 4-1](spec/10-architecture.md) |
| ワールド | 新規作成時に **チート ON・教育版の機能 ON・実験「ベータ API」ON**、BP `ai_build_quiz BP` と RP を有効化（ベータ API は後から戻せないので作るときに入れる） | [spec/16-world-rules.md 5 章](spec/16-world-rules.md) |
| 版合わせ | ゲームの版が上がったら、beta モジュールの版も合わせて `npm install` し直す（合わないとスクリプトが読み込まれず `/quiz:start` が出ない） | [spec/10-architecture.md 4 章](spec/10-architecture.md) |

## 1. 遊ぶ日の起動（この順）

```
① genlab を起動   → ② bridge を起動   → ③ Minecraft でワールドを開く → /wsserver   → ④ コンパスで開始
```

### ① genlab（画像 → 3D → ブロック）

```
cd tools\genlab
.venv\Scripts\python.exe server.py
```

- `[genlab] models loaded: {...}` が出るまで待つ（20〜30 秒）。`http://127.0.0.1:8770/health` の `loaded: true` でも分かる
- 既定の生成モデルは **v2（SDXL-Turbo）**。v2 は**最初の 1 問目でさらに 20 秒**読み込む（2 問目から 8 秒/問）
- **GPU を使う他のもの（Ollama の LLM・別の python など）は止めておく。** VRAM が溢れると 1 問 100 秒になる

### ② bridge（単語を選び、genlab に頼み、ゲームへ渡す）

```
cd worlds\ai-build-quiz\bridge
npm start
```

- `bridge: ws://127.0.0.1:8766 で待機（genlab …、787 語、…、和英辞書 … 語、Wikipedia 対訳 … 件）` が出れば OK
- **bridge は 1 つだけ。** 前のが残っていると port を取れず終了する → 前のを Ctrl+C してから
- 答え・お題は画面に出ない（ホストも遊ぶため）。`bridge/bridge.log` にだけ残る

### ③ Minecraft

1. ワールドを開く（ホスト）
2. チャットで **`/wsserver ws://127.0.0.1:8766`**
   - bridge の画面に `[mc#1] 接続` が出れば繋がっている
   - 「サーバーが見つかりません」→ 0 章のループバックの許可をしていない
   - **bridge を起動し直したら、このコマンドも打ち直す**（切れたまま戻らない）
3. フレンドが参加する。運営（オペレーター）には**コンパスが自動で配られる**

### ④ 開始

コンパスを右クリック → **モード**（フリー／対戦／出題）・**回答のルール**（早い者勝ち／全員回答）を選び → **「ゲームを始める」**。`/quiz:start` でも同じ。
止めるのは「ゲームを止める」または `/quiz:stop`。

メニューの中身は [spec/17-modes.md 4 章](spec/17-modes.md)。

## 2. 新しいワールドで 1 回だけやる設置

| | やること |
| --- | --- |
| 観覧の輪 | コンパス「観覧の輪を置く」（または `/quiz:ring`）。y=0・半径 58〜62 のガラスの輪。空気のところにだけ置くので何度押しても壊さない |
| 出題のボタン | **石のボタン**を手で置く（どこでもよい。案内の文字 (-18, 3, 66) の近くが分かりやすい）。出題モードのとき押すとお題の UI が出る |
| 空中の文字 | 何もしなくて出る: 出題キューの板 (0, 2, 68)、ランキング板 (5, 2, 68)、案内「お題はボタンから出せます」(-18, 3, 66)（後の 2 つは出題モードのときだけ） |

場所の一覧は [spec/16-world-rules.md](spec/16-world-rules.md)。

## 3. 出題モードの流れ（要点）

1. コンパスでモードを「出題」に → 「ゲームを始める」
2. 誰でも**ボタンを押す**とお題の UI（お題はひらがな・数字のみ、詳細は英語推奨）。「出題する」でキューに入る（1 人 1 件）
3. bridge が**待ちの間に先頭を生成**し、**ゲーム中に次の先頭を先読み**する。発表が終わると次がすぐ始まる
4. 受付を止めたいとき: コンパス「出題の受付を止める」。全部消したいとき: 「出題キューを空にする」
5. キューは `/reload` しても消えない。抜けた人の分は自動で消える

詳しくは [spec/17-modes.md 3 章](spec/17-modes.md)。

## 4. 終わるとき

1. コンパス「ゲームを止める」（または `/quiz:stop`）
2. ワールドを閉じる
3. bridge を Ctrl+C
4. genlab を Ctrl+C
5. 建てた物があれば、ワールドを **.mcworld で export** して `worlds/ai-build-quiz/world/` に置く

## 5. 直したとき、どこまでやり直すか

| 直した物 | やること |
| --- | --- |
| **BP のスクリプト**（`packs/ai_build_quiz/scripts`） | `npm run check` → `npm run local-deploy` → ゲーム内で **`/reload`**（ワールドを開いたままでよい。`/reload all` は要らない） |
| **RP**（絵・音・UI） | `local-deploy` → RP の版が上がるので、**ワールドを開き直す**（`/reload` では絵は替わらない） |
| **bridge** | Ctrl+C → `npm start` → ゲームで **`/wsserver ws://127.0.0.1:8766` を打ち直す** |
| **単語リスト**（`bridge/words/`） | `npm run words` → bridge を起動し直す（起動時に `words.json` を読む） |
| **genlab** | Ctrl+C → `server.py` → `models loaded` を待つ。bridge はそのまま（「生成サーバーを待っています…」と出て、上がれば続く） |

## 6. 困ったとき

| 症状 | 見るところ・直し方 |
| --- | --- |
| `/wsserver` で「サーバーが見つかりません」 | bridge が起動しているか（`npm start` の画面）。起動しているならループバックの許可（0 章） |
| コンパスに「bridge: 未接続」／`/quiz:start` が断られる | `/wsserver` を打っていない、または bridge を起動し直した後に打ち直していない |
| `/quiz:start` というコマンドが無い | BP が読み込まれていない。beta モジュールの版がゲームの版と合っていない（0 章「版合わせ」）か、ワールドで BP が有効になっていない |
| 「AI が考え中…」のまま進まない | bridge の画面。`phase が 5 回続けて読めない` なら BP が入っていない／`/wsserver` していない。`生成サーバーを待っています` なら genlab がまだ読み込み中か落ちている |
| 「受信に失敗」 | 送り直しが 1 回自動で走る。続くなら bridge の画面と `bridge.log` |
| bridge が起動直後に終了する | 前の bridge が残っている（port 8766）。それを Ctrl+C |
| genlab が 500 を返す | genlab の画面（例外が出ている）。直したら genlab だけ起動し直す（5 章） |
| 出題モードで絵が変 | 発表のチャットに出る「画像プロンプト」を見る。名前を知らないなら詳細に**英語で見た目**を書いてもらう（[spec/17-modes.md 3 章](spec/17-modes.md)） |
| ゲーム中に PC が重い・ws が切れる | 遊んでいる間は LLM・GPU を使うジョブ・重いテストを走らせない（`fake-mc` も genlab を回すので遊び終わってから） |
