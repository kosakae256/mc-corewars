# AI 建築当てゲーム — 設計

**2026-09-21 開始。**

> ### 企画・仕様まで書いた（2026-09-21）
>
> **[00-concept.md](00-concept.md) が起点。** 仕様は [spec/](spec/)。**次は実装**（packs / bridge）。
> **未定のものは各文書の最後にまとめてある。**

## 企画（何を作るか）

| | |
| --- | --- |
| [00-concept.md](00-concept.md) | **起点。** システムが単語を選び、AI がその場で 60³ に建て、全員が 30 秒で当てる。出題者は居ない |
| [01-run.md](01-run.md) | **立ち上げ方。** 遊ぶ日の起動の順（genlab → bridge → `/wsserver` → コンパス）・初回の設置・直したときのやり直し・困ったとき |

## 仕様（どう作るか）

| | |
| --- | --- |
| [spec/10-architecture.md](spec/10-architecture.md) | **全体。** Minecraft（BP）＋ bridge ＋ genlab の 3 プロセス。責任の線・起動のしかた |
| [spec/11-flow.md](spec/11-flow.md) | **進行。** 4 つの状態・アドミンの開始/停止・30 秒・答え合わせ・1 点 |
| [spec/12-words.md](spec/12-words.md) | **単語リスト。** 形式・入れる条件・確認のしかた |
| [spec/13-transport.md](spec/13-transport.md) | **bridge ⇄ BP。** `/scriptevent` の中身・連長圧縮・scoreboard の合図・**最初に確かめること** |
| [spec/14-build.md](spec/14-build.md) | **置く。** 60³ を原点中心・下から N 個/tick・音・片づけ |
| [spec/15-state.md](spec/15-state.md) | **状態と鍵。** scoreboard / メモリ・層 |
| [spec/16-world-rules.md](spec/16-world-rules.md) | **ワールドの決まり。** 常時飛行（サバイバル）・200×200 の境界（Core Wars 流用） |
| [spec/18-moderation.md](spec/18-moderation.md) | **下ネタの規制。** チャットと出題の入口で言葉の一覧に当てる（ルールベース） |
| [spec/17-modes.md](spec/17-modes.md) | **ゲームモード。** フリー・対戦・出題（ボタンを押した人が UI でお題を書き、キューに並ぶ）と、運営のコンパス |

## 決定記録

| | |
| --- | --- |
| [decisions/01-use-existing-3d-model.md](decisions/01-use-existing-3d-model.md) | 3D 生成の AI は既存のものを使う。形は粗くてよいが、読み取りは正しく |
| [decisions/02-no-setter-fixed-words-live.md](decisions/02-no-setter-fixed-words-live.md) | **出題者を無くし、固定リストから出題し、常にその場で生成する** |

## 関係しそうな共通の文書

| | なぜ関係するか |
| --- | --- |
| [docs/research/29-text-to-blocks-feasibility.md](../../../docs/research/29-text-to-blocks-feasibility.md) | **このゲームが技術的にできるかの調査。** 段ごとの確度・モデル候補・実測の順 |
| [docs/imp.md](../../../docs/imp.md) | コードを書く前に読む。設計原則と 10 章の構成 |
| [docs/idea/01-llm-chat.md](../../../docs/idea/01-llm-chat.md) | ローカル LLM（Ollama）を BDS から叩く構想。**AI を絡めるなら同じ経路** |
| [docs/spec/02-llm-chat.md](../../../docs/spec/02-llm-chat.md) | 偽プレイヤー（`tools/bots`）と LLM の会話。**外部プロセス側から AI を動かす前例** |
| [docs/research/03-bds-and-friend-join.md](../../../docs/research/03-bds-and-friend-join.md) | BDS と `@minecraft/server-net`。HTTP を使うならこの制約 |
| [docs/research/06-worker-entities.md](../../../docs/research/06-worker-entities.md) | 作業ワーカー（自動で建てる）3 方式の使い分け |
| [docs/research/10-custom-block-replacement.md](../../../docs/research/10-custom-block-replacement.md) | 壊せないブロック。**当てる側に建築を壊させない**なら |
| [tools/mc-voxelize.py](../../../tools/mc-voxelize.py) | **既にあるボクセル化の道具**（OBJ → ブロック一覧 JSON、マテリアル名 → ブロックの対応表、殻のみ／`--solid`）。3 段目の土台にできそう。仕様書 `docs/spec/40-voxelize.md` は**存在しない**（冒頭コメントが指しているだけ） |
