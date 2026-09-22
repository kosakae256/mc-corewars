# AI 建築当てゲーム

**2026-09-21 開始。** 出題者 1 人の文章から AI が 20×20×20 の建築を作り、残りの人が 30 秒で当てるゲーム。

設計は [docs/](docs/) を見ること。**ここが起点。**

---

## この中に何があるか

```
worlds/ai-build-quiz/
├── docs/                 このワールドの設計
│   ├── README.md             目次
│   ├── 00-concept.md         企画（起点）
│   ├── spec/                 技術仕様（10〜16）
│   └── decisions/            なぜそう決めたかの記録
├── packs/ai_build_quiz/  BP/RP のソース（TypeScript）。`npm run check` → `npm run local-deploy`
├── bridge/               単語を選び genlab に頼み、/wsserver 経由で BP へ渡す（Node/TypeScript）。`words/` に単語リスト
└── world/                ワールドデータ（手動 export した .mcworld）。**まだ無い**
```

生成そのものは [tools/genlab](../../tools/genlab/)（ワールド共通の道具）。

## 動かす（3 プロセス。全部ホストの PC）

**手順の正本は [docs/01-run.md](docs/01-run.md)。** 要点だけ:

1. `tools/genlab`: `.venv\Scripts\python.exe server.py`（モデル読み込み 20 秒）
2. `bridge`: `npm start`
3. `packs/ai_build_quiz`: `npm run local-deploy`（初回・直したとき）
4. Minecraft でワールドを作る（**チート ON・実験「ベータ API」ON**、BP/RP を有効化）→ `/wsserver ws://127.0.0.1:8766`
5. 運営がコンパスで「ゲームを始める」（`/quiz:start` でも同じ）。止めるのは「ゲームを止める」／`/quiz:stop`

仕組みは [docs/spec/10-architecture.md](docs/spec/10-architecture.md)。
