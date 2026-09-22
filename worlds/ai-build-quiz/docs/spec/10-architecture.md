# 仕様 10: 全体の構成

> 作成日: 2026-09-21
> 企画: [../00-concept.md](../00-concept.md) / 調査: [docs/research/29](../../../../docs/research/29-text-to-blocks-feasibility.md)
> コードの決まり: [docs/imp.md](../../../../docs/imp.md)（BP は TypeScript、bridge も TypeScript）

## 1. 3 つのプロセス。全部ホストの PC

```
┌──────────────────────────────┐        ┌──────────────────────────┐        ┌────────────────────────┐
│ Minecraft（通常ワールド・ホスト） │        │ bridge（Node）            │        │ genlab（Python・GPU）    │
│                              │ /wsserver│  worlds/ai-build-quiz/bridge│  HTTP  │  tools/genlab/server.py  │
│  BP スクリプト（packs/ai_build_quiz）│◀──────▶│  ・単語を選ぶ              │◀──────▶│  単語 → 画像 → 3D → 格子 │
│  ・置く・30 秒・答え合わせ・得点   │        │  ・genlab に頼む           │        │  1 語 3 秒              │
│                              │        │  ・/scriptevent で BP へ渡す │        │                        │
└──────────────────────────────┘        └──────────────────────────┘        └────────────────────────┘
        ▲ フレンド参加（普通）
   他のプレイヤー
```

| | 役割 | 言語 | 場所 |
| --- | --- | --- | --- |
| **BP** | ゲームそのもの。状態・置く・当てる・得点。**Minecraft の中で完結する部分は全部ここ** | TypeScript（Script API v2） | [packs/ai_build_quiz](../../packs/ai_build_quiz/) |
| **bridge** | 外との橋。単語を選び、genlab に頼み、結果を `/scriptevent` で BP へ流す。ゲームの進行は BP の合図に従う | TypeScript（Node, `ws`） | [bridge/](../../bridge/) |
| **genlab** | 生成。既にある（[docs/spec/08](../../../../docs/spec/08-genlab.md)）。**このワールド専用ではない** | Python | [tools/genlab](../../../../tools/genlab/) |

**BDS は使わない**（[decisions/02](../decisions/02-no-setter-fixed-words-live.md)、[research/29 6 章](../../../../docs/research/29-text-to-blocks-feasibility.md)）。
参加者は普通にフレンド参加。ホストがワールドを開いて `/wsserver ws://127.0.0.1:8766` を打つ。

## 2. 責任の線

**「Minecraft の中で決められることは BP が決める。」** bridge は運び屋。

| 決めること | 誰が |
| --- | --- |
| 次のお題（単語） | bridge（リストからランダム） |
| 生成 | genlab |
| いつ置き始めるか・何個/tick・置き終わり | **BP** |
| 30 秒の計測・答え合わせ・得点・発表 | **BP** |
| 次のラウンドに進んでよいか | **BP が合図**（scoreboard）。bridge はそれを待つ（[13-transport.md](13-transport.md)） |
| ゲームの開始・終了 | **アドミンが `/quiz:start` / `/quiz:stop`**（BP のカスタムコマンド）。bridge は scoreboard で知る |

## 3. 1 ラウンドの流れ

```
bridge: 単語を選ぶ ──▶ genlab（3 秒）──▶ /scriptevent quiz:round … / quiz:chunk … / quiz:go
                                                              │
BP:                                      「AI が考え中…」表示 ◀─┘ 受け取り・検証
                                                              │
                                         箱（60³・原点中心）を空にする → 下から N 個/tick で置く（約 10 秒）
                                                              │
                                         置き終わり → 30 秒の回答 → 発表・得点 → phase を idle に
                                                              │
bridge:                                  scoreboard を見て idle なら ──▶ 次の単語
```

詳細は [11-flow.md](11-flow.md)。

## 4. 起動のしかた（運用）

> **運用の手順書は [docs/01-run.md](../01-run.md)**（2026-09-22）。ここは要点と、実機で確かめたことの記録。

1. `tools/genlab`: `.venv\Scripts\python.exe server.py`（モデル読み込み 20 秒。VRAM 6.4 GB）
2. `worlds/ai-build-quiz/bridge`: `npm start`（初回は `npm install` と `npm run words`）
3. `worlds/ai-build-quiz/packs/ai_build_quiz`: `npm run local-deploy`（初回・直したとき）
4. Minecraft でワールドを作る/開く（**チート ON・教育版の機能 ON・実験「ベータ API」ON**、BP `ai_build_quiz BP` と RP を有効化）→ `/wsserver ws://127.0.0.1:8766`
5. 参加者が入ったら、アドミンが `/quiz:start`

**GPU を使う他のもの（`tools/bots` の LLM など）は止めておく。** 溢れると 1 語 100 秒になる（research/29 7-2）。
使う beta モジュール（[CLAUDE.md](../../../../CLAUDE.md) の決まりで記録する）: `@minecraft/server`（`chatSend`・カスタムコマンド）、`@minecraft/server-ui`（コンパスと出題の UI）、`@minecraft/debug-utilities`（`DebugText`。ランキング板——[17-modes.md 7 章](17-modes.md)）。

**beta モジュールの版は実機の版と一致させる。** 1.26.51 なら `@minecraft/server` は `2.11.0-beta`（`npm view @minecraft/server dist-tags` の `beta`）。合わないとスクリプトが読み込まれず `/quiz:start` が出ない（2026-09-21 に踏んだ。実機が 1.26.44 → 1.26.51 に上がっていた）。
**bridge は 1 つだけ。** 前のが残っていると新しいのは port を取れず終了する（メッセージを出す）。単語を作り直したら bridge を起動し直す（起動時に `words.json` を読む）。

### 4-1. 実機でまだ確かめていないこと（2026-09-21 時点）

Minecraft 無しで確かめられる範囲（scriptevent の分割・展開・個数・palette・置く順、[13 5-1](13-transport.md)）は通っている。
実機でしか分からないのは次の 4 つ。順に見て、通らなければ [13 5 章](13-transport.md) の代案へ。

| # | 見ること | どこで分かる |
| --- | --- | --- |
| 1 | `/wsserver ws://127.0.0.1:8766` で bridge に繋がる | bridge の画面と `bridge/bridge.log` に `[mc#1] 接続`。「サーバーが見つかりません」なら、ゲームがループバックに繋げていない → 管理者 PowerShell で `CheckNetIsolation.exe LoopbackExempt -a -n=Microsoft.MinecraftUWP_8wekyb3d8bbwe` |
| 2 | `scoreboard players list phase` の応答が読める | bridge の画面に `phase の応答（生）: …` が出て、その後 `round 1: … を生成` に進む。**進まなければ応答の形が違う**（`src/protocol.ts` の `parsePhase` を直す） |
| 3 | scriptevent が BP に届き、箱に置かれる | ゲーム内で「AI が考え中…」→ ブロックが下から置かれる。届かないなら BP が phase を 9 にし、bridge が 1 回送り直す |
| 4 | 参加直後に飛べる（`/ability @s mayfly true`） | 飛べなければ [16 2 章](16-world-rules.md) |

## 5. 文書の並び

| | |
| --- | --- |
| [11-flow.md](11-flow.md) | 進行。状態・時間・得点・発表 |
| [12-words.md](12-words.md) | 単語リスト。形式・正解・表記ゆれ・難易度・確認のしかた |
| [13-transport.md](13-transport.md) | bridge ⇄ BP。`/scriptevent` の中身・圧縮・BP → bridge の合図 |
| [14-build.md](14-build.md) | 置く。場所・順・速さ・音・片づけ |
| [15-state.md](15-state.md) | BP が持つ状態と鍵 |
| [16-world-rules.md](16-world-rules.md) | 飛行・行動範囲（200×200）・ワールド設定・羽のダッシュ |
| [17-modes.md](17-modes.md) | ゲームモード（フリー・対戦・出題）と運営のコンパス |
